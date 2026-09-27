import { openCurrentProblem } from './helpers.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { validateNoteImages, imagePrefix, maxImageBytes } from '../src/database/noteImages.ts';

const imageId = '11111111-1111-4111-8111-111111111111';
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';
test('note attachments validate format, limits and remove unused data', () => {
  assert.deepEqual(validateNoteImages({ [imageId]: png }, imagePrefix + imageId), { [imageId]: png });
  assert.deepEqual(validateNoteImages({ [imageId]: png }, ''), {});
  for (const value of [[], { bad: png }, { [imageId]: 'data:image/svg+xml;base64,PHN2Zz4=' }, { [imageId]: 'data:image/png;base64,YmFk' },
    { [imageId]: 'data:image/png;base64,' + 'A'.repeat(maxImageBytes * 2) }, Object.fromEntries(Array.from({ length: 6 }, () => [crypto.randomUUID(), png]))]) {
    assert.throws(() => validateNoteImages(value, imagePrefix + imageId));
  }
});

test('inline images support paste, drop, upload, autosave, delete confirmation and undo', { timeout: 90000 }, async () => {
  const extension = resolve('dist');
  const context = await chromium.launchPersistentContext('', { channel: process.env.CODEVAULT_BROWSER_CHANNEL || 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const popup = await context.newPage(); await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
    const send = (message) => popup.evaluate((data) => chrome.runtime.sendMessage({ channel: 'codevault', ...data }), message);
    const get = async () => (await send({ action: 'notes.get', problemId: 'leetcode:1' })).data;
    const page = await context.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://leetcode.cn/**', (route) => new URL(route.request().url()).pathname === '/graphql/'
      ? route.fulfill({ json: { data: { question: { questionId: '1', titleSlug: 'two-sum', title: 'Two Sum', difficulty: 'Easy', topicTags: [] } } } })
      : route.fulfill({ contentType: 'text/html', body: '<h1>Host</h1>' }));
    const input = () => page.getByRole('textbox', { name: '笔记文字 1', exact: true });
    const open = async () => { await page.goto('https://leetcode.cn/problems/two-sum/'); await openCurrentProblem(page); await input().waitFor(); };
    const button = (name) => page.getByRole('button', { name, exact: true });
    const saved = () => page.getByRole('region', { name: '题目笔记' }).getByRole('status').filter({ hasText: /^已保存$/ }).waitFor();
    const paste = (mode = 'valid', kind = 'paste') => input().evaluate((input, { mode, kind }) => {
      const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 80;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#dbeafe'; ctx.fillRect(0, 0, 240, 80); ctx.fillStyle = '#1e40af'; ctx.font = '20px sans-serif'; ctx.fillText('Array: 1 → 2 → 3', 15, 45);
      const bytes = Uint8Array.from(atob(canvas.toDataURL().split(',')[1]), (c) => c.charCodeAt(0));
      const file = new File([mode === 'large' ? new Uint8Array(2 * 1024 * 1024 + 1) : mode === 'broken' ? 'bad' : bytes], 'paste.png', { type: mode === 'svg' ? 'image/svg+xml' : 'image/png' });
      const transfer = new DataTransfer(); transfer.items.add(file);
      input.dispatchEvent(kind === 'drop' ? new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }) : new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    }, { mode, kind });
    await open();
    await worker.evaluate(() => { globalThis.oldPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (...args) { if (this.name === 'notes') throw new Error('injected'); return globalThis.oldPut.apply(this, args); }; });
    await input().fill('before AFTER'); await input().evaluate((node) => node.setSelectionRange(7, 12)); await paste();
    const images = page.getByRole('img', { name: '笔记图片', exact: true });
    await images.first().waitFor(); await images.first().evaluate((node) => node.decode());
    assert.equal(await images.first().evaluate((node) => node.naturalWidth), 240);
    assert.equal(await input().inputValue(), 'before ');
    assert.equal(await button('预览笔记').count(), 0);
    await page.getByRole('alert').filter({ hasText: '本地存储暂时不可用' }).waitFor(); assert.equal(await get(), null);
    await worker.evaluate(() => { IDBObjectStore.prototype.put = globalThis.oldPut; });
    await button('重试保存笔记').click(); await saved();
    assert.equal(Object.keys((await get()).images).length, 1); assert.equal((await get()).blocks[1].type, 'image');
    await open(); await images.first().waitFor(); await images.first().evaluate((node) => node.decode()); assert.equal(await images.first().evaluate((node) => node.naturalWidth), 240);
    for (const [mode, error] of [['large', '单张图片不能超过2MB'], ['broken', '图片损坏'], ['svg', '请粘贴 PNG']]) {
      await paste(mode); await page.getByRole('alert').filter({ hasText: error }).waitFor(); assert.equal(await images.count(), 1);
    }
    await paste('valid', 'drop'); await saved(); assert.equal(Object.keys((await get()).images).length, 2);
    const uploadData = await images.first().getAttribute('src');
    await page.getByLabel('选择笔记图片').setInputFiles({ name: 'upload.png', mimeType: 'image/png', buffer: Buffer.from(uploadData.split(',')[1], 'base64') });
    await page.waitForFunction(() => document.querySelector('#codevault-root').shadowRoot.querySelectorAll('.note-blocks img').length === 3);
    await saved(); assert.equal(Object.keys((await get()).images).length, 3);
    await button('删除图片').first().click(); await button('取消删除图片').click(); assert.equal(await images.count(), 3);
    await button('删除图片').first().click(); await button('确认删除图片').click(); await saved(); assert.equal(Object.keys((await get()).images).length, 2);
    await button('撤销删除图片').click(); await saved(); assert.equal(Object.keys((await get()).images).length, 3);
    await images.first().scrollIntoViewIfNeeded(); await page.screenshot({ path: resolve('test-results/note-block-images.png') });
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
