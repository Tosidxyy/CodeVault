import { openCurrentProblem } from './helpers.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { chromium } from 'playwright';

test('notes migrate v2, render safe Markdown, persist, isolate routes and protect concurrent edits', { timeout: 90000 }, async () => {
  const resultDir = resolve('test-results');
  await mkdir(resultDir, { recursive: true });
  const profile = await mkdtemp(resolve(resultDir, 'notes-profile-'));
  const extension = resolve('dist');
  const launch = () => chromium.launchPersistentContext(profile, { channel: process.env.CODEVAULT_BROWSER_CHANNEL || 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const problem = { id: 'leetcode:1', platform: 'leetcode', slug: 'two-sum', url: 'https://leetcode.cn/problems/two-sum/', title: '两数之和', difficulty: 'Easy', tags: [] };
  let context;
  try {
    context = await launch();
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    await worker.evaluate(() => new Promise((done, reject) => {
      const request = indexedDB.open('codevault', 2);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('problems', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
        request.result.createObjectStore('solutions', { keyPath: 'id' }).createIndex('problemId', 'problemId');
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { request.result.close(); done(); };
    }));
    let popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    const send = (message) => popup.evaluate((data) => chrome.runtime.sendMessage({ channel: 'codevault', ...data }), message);
    const get = () => send({ action: 'notes.get', problemId: problem.id });
    assert.equal((await get()).data, null);
    assert.equal(await worker.evaluate(async () => (await indexedDB.databases()).find((db) => db.name === 'codevault').version), 4);
    for (const patch of [{ markdown: 'x'.repeat(20001) }, { revision: -1 }, { markdown: null }]) {
      assert.equal((await send({ action: 'notes.save', problem, markdown: 'test', revision: 0, ...patch })).ok, false);
    }
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://leetcode.*/**', (route) => {
      if (new URL(route.request().url()).pathname === '/graphql/') {
        const slug = route.request().postDataJSON().variables.titleSlug;
        return route.fulfill({ json: { data: { question: { questionId: slug === 'two-sum' ? '1' : '2', titleSlug: slug, title: slug, difficulty: 'Easy', topicTags: [] } } } });
      }
      return route.fulfill({ contentType: 'text/html', body: '<h1>Host unchanged</h1>' });
    });
    const open = async (url = problem.url) => {
      await page.goto(url); await openCurrentProblem(page);
      await page.getByLabel('Markdown内容').waitFor();
    };
    const button = (name) => page.getByRole('button', { name, exact: true });
    const markdown = '# 思路\n\n- **哈希表**\n\n> 时间复杂度\n\n```python\nprint("你好")\n```\n\n[参考](https://example.com)\n\n<script>window.pwned=1</script>\n\n[危险](javascript:alert(1))\n\n![图片](https://example.com/tracker.png)';
    await open();
    await page.getByLabel('Markdown内容').fill(markdown);
    await button('预览笔记').click();
    const preview = page.getByLabel('Markdown预览');
    await preview.getByRole('heading', { name: '思路' }).waitFor();
    assert.equal(await preview.locator('pre code').textContent(), 'print("你好")\n');
    assert.equal(await preview.locator('script, img').count(), 0);
    assert.equal(await preview.getByRole('link', { name: '危险' }).count(), 0);
    assert.equal(await page.evaluate(() => window.pwned), undefined);
    await preview.scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(resultDir, 'notes-preview.png') });
    // Parent failure rolls back both the new note and automatic bookmark.
    await worker.evaluate(() => { globalThis.oldAdd = IDBObjectStore.prototype.add; IDBObjectStore.prototype.add = function (...args) { if (this.name === 'problems') throw new Error('injected'); return globalThis.oldAdd.apply(this, args); }; });
    await button('保存笔记').click();
    await page.getByRole('alert').filter({ hasText: '本地存储暂时不可用' }).waitFor();
    assert.equal((await get()).data, null);
    assert.equal((await send({ action: 'problems.get', id: problem.id })).data, null);
    await worker.evaluate(() => { IDBObjectStore.prototype.add = globalThis.oldAdd; });
    await button('保存笔记').click();
    await page.getByText('笔记已保存到本机。', { exact: true }).waitFor();
    assert.equal((await get()).data.markdown, markdown);
    assert.equal((await send({ action: 'problems.get', id: problem.id })).data.id, problem.id);
    await open('https://leetcode.com/problems/two-sum/');
    assert.equal(await page.getByLabel('Markdown内容').inputValue(), markdown);
    await page.getByLabel('Markdown内容').fill('本地未保存');
    assert.equal((await send({ action: 'notes.save', problem, markdown: '其他页面的新内容', revision: 1 })).ok, true);
    await button('保存笔记').click();
    await page.getByRole('alert').filter({ hasText: '笔记已在其他页面更新' }).waitFor();
    assert.equal(await page.getByLabel('Markdown内容').inputValue(), '本地未保存');
    await button('读取最新笔记').click(); await button('继续编辑').click();
    assert.equal(await page.getByLabel('Markdown内容').inputValue(), '本地未保存');
    await button('读取最新笔记').click(); await button('放弃修改并读取').click();
    await page.waitForFunction(() => document.getElementById('codevault-root')?.shadowRoot?.querySelector('.note-editor')?.value === '其他页面的新内容');
    await page.getByLabel('Markdown内容').fill('切题前草稿');
    await page.evaluate(() => history.pushState({}, '', '/problems/other/'));
    await page.getByRole('link', { name: 'other', exact: true }).waitFor();
    assert.equal(await page.getByLabel('Markdown内容').inputValue(), '');
    await page.getByLabel('Markdown内容').fill('第二题'); await button('保存笔记').click();
    await page.getByText('笔记已保存到本机。', { exact: true }).waitFor();
    assert.equal((await get()).data.markdown, '其他页面的新内容');
    assert.equal((await send({ action: 'notes.get', problemId: 'leetcode:2' })).data.markdown, '第二题');
    assert.deepEqual(errors, []);
    await context.close(); context = await launch();
    await context.setOffline(true);
    popup = await context.newPage(); await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    assert.equal((await get()).data.markdown, '其他页面的新内容');
    assert.equal((await send({ action: 'notes.get', problemId: 'leetcode:2' })).data.markdown, '第二题');
  } finally { if (context) await context.close(); if (profile.startsWith(resultDir + sep)) await rm(profile, { recursive: true, force: true }); }
});
