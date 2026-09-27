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

test('paste images previews locally, saves atomically, reloads and removes unused attachments', { timeout: 90000 }, async () => {
  const extension = resolve('dist');
  const context = await chromium.launchPersistentContext('', { channel: process.env.CODEVAULT_BROWSER_CHANNEL || 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
    const send = (message) => popup.evaluate((data) => chrome.runtime.sendMessage({ channel: 'codevault', ...data }), message);
    const get = () => send({ action: 'notes.get', problemId: 'leetcode:1' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://leetcode.cn/**', (route) => new URL(route.request().url()).pathname === '/graphql/'
      ? route.fulfill({ json: { data: { question: { questionId: '1', titleSlug: 'two-sum', title: 'Two Sum', difficulty: 'Easy', topicTags: [] } } } })
      : route.fulfill({ contentType: 'text/html', body: '<h1>Host</h1>' }));
    const open = async () => { await page.goto('https://leetcode.cn/problems/two-sum/'); await openCurrentProblem(page); await page.getByLabel('Markdown内容').waitFor(); };
    const button = (name) => page.getByRole('button', { name, exact: true });
    const paste = (mode = 'valid') => page.getByLabel('Markdown内容').evaluate((input, mode) => {
      const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 80;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#dbeafe'; ctx.fillRect(0, 0, 240, 80); ctx.fillStyle = '#1e40af'; ctx.font = '20px sans-serif'; ctx.fillText('Array: 1 → 2 → 3', 15, 45);
      const bytes = Uint8Array.from(atob(canvas.toDataURL().split(',')[1]), (c) => c.charCodeAt(0));
      const file = new File([mode === 'large' ? new Uint8Array(2 * 1024 * 1024 + 1) : mode === 'broken' ? 'bad' : bytes], 'paste.png', { type: mode === 'svg' ? 'image/svg+xml' : 'image/png' });
      const transfer = new DataTransfer(); transfer.items.add(file);
      input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
    }, mode);
    await open();
    await page.getByLabel('Markdown内容').fill('before AFTER');
    await page.getByLabel('Markdown内容').evaluate((input) => input.setSelectionRange(7, 12));
    await paste(); await page.getByText('图片已插入，请保存笔记。', { exact: true }).waitFor();
    const markdown = await page.getByLabel('Markdown内容').inputValue();
    assert.match(markdown, /^before !\[粘贴图片\]\(codevault-image:/);
    assert.equal((await get()).data, null);
    await button('预览笔记').click();
    const img = page.getByRole('img', { name: '粘贴图片' });
    await img.waitFor(); assert.equal(await img.evaluate((node) => node.complete && node.naturalWidth === 240), true);
    await img.scrollIntoViewIfNeeded(); await page.screenshot({ path: resolve('test-results/note-images.png') });
    await worker.evaluate(() => { globalThis.oldPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (...args) { if (this.name === 'notes') throw new Error('injected'); return globalThis.oldPut.apply(this, args); }; });
    await button('保存笔记').click(); await page.getByRole('alert').filter({ hasText: '本地存储暂时不可用' }).waitFor();
    assert.equal((await get()).data, null);
    await worker.evaluate(() => { IDBObjectStore.prototype.put = globalThis.oldPut; });
    await button('保存笔记').click(); await page.getByText('笔记已保存到本机。', { exact: true }).waitFor();
    assert.equal(Object.keys((await get()).data.images).length, 1);
    await open(); assert.equal(await page.getByLabel('Markdown内容').inputValue(), markdown);
    await button('预览笔记').click(); await img.waitFor(); assert.equal(await img.evaluate((node) => node.complete && node.naturalWidth === 240), true);
    await button('编辑笔记').click();
    for (const [mode, error] of [['large', '单张图片不能超过2MB'], ['broken', '图片损坏'], ['svg', '请粘贴 PNG']]) {
      await paste(mode); await page.getByRole('alert').filter({ hasText: error }).waitFor();
      assert.equal(await page.getByLabel('Markdown内容').inputValue(), markdown);
    }
    await page.getByLabel('Markdown内容').fill('图片已移除');
    await button('保存笔记').click(); await page.getByText('笔记已保存到本机。', { exact: true }).waitFor();
    assert.deepEqual((await get()).data.images, {});
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
