import { openCurrentProblem } from './helpers.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import { migrateMarkdown, validateBlocks } from '../src/database/noteBlocks.ts';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';
const asset = '11111111-1111-4111-8111-111111111111';
const textOf = (note) => note.blocks.filter((block) => block.type === 'text').map((block) => block.content).join('');
test('legacy Markdown converts to plain blocks and local images; block input is bounded', () => {
  const source = '# 思路\n\n**哈希表**\n\n![图](codevault-image:' + asset + ')\n\n```python\nprint(1)\n```\n\n![远程](https://example.com/pixel.png)';
  const blocks = migrateMarkdown(source, { [asset]: png });
  assert.equal(blocks.filter((b) => b.type === 'image').length, 1);
  const text = textOf({ blocks });
  assert.match(text, /思路/); assert.match(text, /print\(1\)/); assert.equal(text.includes('**'), false); assert.equal(text.includes('```'), false);
  assert.equal(JSON.stringify(blocks).includes('https://example.com'), false);
  assert.equal(validateBlocks(blocks, { [asset]: png }).images[asset], png);
  for (const invalid of [[], [{ id: crypto.randomUUID(), type: 'html', content: '<script>' }], [{ id: crypto.randomUUID(), type: 'text', content: 'x'.repeat(20001) }], [{ id: crypto.randomUUID(), type: 'image', assetId: asset }]]) assert.throws(() => validateBlocks(invalid, {}));
});

test('v4 notes migrate without loss; autosave, failure recovery, conflicts, close and routes remain isolated', { timeout: 90000 }, async () => {
  const resultDir = resolve('test-results'); await mkdir(resultDir, { recursive: true });
  const profile = await mkdtemp(resolve(resultDir, 'notes-profile-'));
  const extension = resolve('dist');
  const launch = () => chromium.launchPersistentContext(profile, { locale: 'zh-CN', channel: process.env.CODEVAULT_BROWSER_CHANNEL || 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const problem = { id: 'leetcode:1', platform: 'leetcode', slug: 'two-sum', url: 'https://leetcode.cn/problems/two-sum/', title: '两数之和', difficulty: 'Easy', tags: [] };
  const legacy = { problemId: problem.id, markdown: '# 旧笔记\n\n**哈希表**\n\n![图](codevault-image:' + asset + ')', images: { [asset]: png }, revision: 3, updatedAt: 123 };
  let context;
  try {
    context = await launch();
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    await worker.evaluate(({ problem, legacy }) => new Promise((done, reject) => {
      const request = indexedDB.open('codevault', 4);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('problems', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
        request.result.createObjectStore('solutions', { keyPath: 'id' }).createIndex('problemId', 'problemId');
        request.result.createObjectStore('notes', { keyPath: 'problemId' });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { const db = request.result; const tx = db.transaction(['problems', 'notes'], 'readwrite'); tx.objectStore('notes').put(legacy); tx.objectStore('problems').put({ ...problem, createdAt: 100, updatedAt: 100 }); tx.oncomplete = () => { db.close(); done(); }; tx.onabort = () => reject(tx.error); };
    }), { problem, legacy });
    let popup = await context.newPage(); await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    const send = (message) => popup.evaluate((data) => chrome.runtime.sendMessage({ channel: 'codevault', ...data }), message);
    const get = async (id = problem.id) => (await send({ action: 'notes.get', problemId: id })).data;
    const migrated = await get();
    assert.equal(migrated.revision, 3); assert.equal(migrated.updatedAt, 123);
    assert.deepEqual(migrated.legacy, { markdown: legacy.markdown, images: legacy.images });
    assert.equal(migrated.blocks.filter((b) => b.type === 'image').length, 1);
    assert.equal(await worker.evaluate(async () => (await indexedDB.databases()).find((db) => db.name === 'codevault').version), 5);
    const page = await context.newPage(); const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://leetcode.*/**', (route) => {
      if (new URL(route.request().url()).pathname === '/graphql/') { const slug = route.request().postDataJSON().variables.titleSlug; return route.fulfill({ json: { data: { question: { questionId: slug === 'two-sum' ? '1' : '2', titleSlug: slug, title: slug, difficulty: 'Easy', topicTags: [] } } } }); }
      return route.fulfill({ contentType: 'text/html', body: '<h1>Host unchanged</h1>' });
    });
    const open = async (url = problem.url) => { await page.goto(url); await openCurrentProblem(page); await page.getByRole('textbox', { name: '笔记文字 1', exact: true }).waitFor(); };
    const input = () => page.getByRole('textbox', { name: '笔记文字 1', exact: true });
    const saved = () => page.getByRole('region', { name: '题目笔记' }).getByRole('status').filter({ hasText: /^已保存$/ }).waitFor();
    const button = (name) => page.getByRole('button', { name, exact: true });
    await open(); assert.match(await input().inputValue(), /旧笔记/); assert.equal((await input().inputValue()).includes('#'), false);
    await page.getByRole('img', { name: '笔记图片' }).waitFor();
    assert.equal(await button('预览笔记').count(), 0); assert.equal(await button('保存笔记').count(), 0);
    await input().fill('直接输入\n<script>window.pwned=1</script>'); await saved();
    assert.equal(await page.evaluate(() => window.pwned), undefined); assert.equal((await get()).legacy.markdown, legacy.markdown);
    await open('https://leetcode.com/problems/two-sum/'); assert.match(await input().inputValue(), /直接输入/);
    const revision = (await get()).revision;
    await input().fill('本地冲突草稿');
    assert.equal((await send({ action: 'notes.save', problem, markdown: '其他页面的新内容', revision })).ok, true);
    await page.getByRole('alert').filter({ hasText: '笔记已在其他页面更新' }).waitFor();
    assert.equal(await input().inputValue(), '本地冲突草稿');
    await button('读取最新笔记').click(); await button('继续编辑').click(); assert.equal(await input().inputValue(), '本地冲突草稿');
    await button('读取最新笔记').click(); await button('放弃修改并读取').click();
    await page.waitForFunction(() => document.querySelector('#codevault-root').shadowRoot.querySelector('.note-text').value === '其他页面的新内容');
    await input().fill('切题前的最终文字');
    await page.evaluate(() => history.pushState({}, '', '/problems/other/'));
    await page.getByRole('link', { name: 'other', exact: true }).waitFor(); await input().waitFor();
    assert.equal(await input().inputValue(), ''); assert.equal(textOf(await get()), '切题前的最终文字');
    // A failed automatic parent write rolls back the note too.
    await worker.evaluate(() => { globalThis.oldAdd = IDBObjectStore.prototype.add; IDBObjectStore.prototype.add = function (...args) { if (this.name === 'problems') throw new Error('injected'); return globalThis.oldAdd.apply(this, args); }; });
    await input().fill('第二题草稿'); await page.getByRole('alert').filter({ hasText: '本地存储暂时不可用' }).waitFor();
    assert.equal(await get('leetcode:2'), null); assert.equal((await send({ action: 'problems.get', id: 'leetcode:2' })).data, null);
    await worker.evaluate(() => { IDBObjectStore.prototype.add = globalThis.oldAdd; });
    await button('重试保存笔记').click(); await saved(); assert.equal(textOf(await get('leetcode:2')), '第二题草稿');
    // Reverting to the previous baseline while a save response is pending must still save the final text.
    await worker.evaluate(() => {
      globalThis.oldTransaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (...args) {
        const tx = globalThis.oldTransaction.apply(this, args);
        if (args[1] === 'readwrite' && Array.isArray(args[0]) && args[0].includes('notes')) {
          Object.defineProperty(tx, 'oncomplete', { set(callback) { tx.addEventListener('complete', (event) => setTimeout(() => callback.call(tx, event), 800)); } });
        }
        return tx;
      };
    });
    await input().fill('保存中的中间版本');
    await page.getByRole('region', { name: '题目笔记' }).getByRole('status').filter({ hasText: /^正在保存…$/ }).waitFor();
    await input().fill('第二题草稿'); await button('关闭面板').click();
    assert.equal(textOf(await get('leetcode:2')), '第二题草稿');
    await worker.evaluate(() => { IDBDatabase.prototype.transaction = globalThis.oldTransaction; });
    await openCurrentProblem(page); await input().waitFor();
    // Closing the panel before the debounce expires flushes the latest snapshot.
    await input().fill('关闭前的最终文字'); await button('关闭面板').click();
    assert.equal(textOf(await get('leetcode:2')), '关闭前的最终文字');
    await openCurrentProblem(page); await input().waitFor(); assert.equal(await input().inputValue(), '关闭前的最终文字');
    await input().fill('刷新前的最终文字'); await page.reload(); await openCurrentProblem(page); await input().waitFor(); assert.equal(await input().inputValue(), '刷新前的最终文字');
    // Queued snapshots from one editor use the preceding committed revision.
    const sessionId = crypto.randomUUID(); const base = (await get()).revision;
    const blocks = [{ id: crypto.randomUUID(), type: 'text', content: '排队的第一版' }];
    const writes = await Promise.all(['排队的第一版', '排队的最终版'].map((content) => send({ action: 'notes.saveBlocks', problem, blocks: [{ ...blocks[0], content }], images: {}, revision: base, sessionId })));
    assert.ok(writes.every((response) => response.ok)); assert.equal(textOf(await get()), '排队的最终版');
    assert.deepEqual(errors, []);
    await context.close(); context = await launch(); await context.setOffline(true);
    popup = await context.newPage(); await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    assert.equal(textOf(await get()), '排队的最终版'); assert.equal(textOf(await get('leetcode:2')), '刷新前的最终文字');
    assert.deepEqual((await get()).legacy, migrated.legacy);
  } finally { await context?.close(); if (profile.startsWith(resultDir + sep)) await rm(profile, { recursive: true, force: true }); }
});
