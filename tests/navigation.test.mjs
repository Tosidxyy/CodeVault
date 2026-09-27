import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

test('v3 library migration, search, visits, navigation restore and popup tab reuse', { timeout: 90000 }, async () => {
  const extension = resolve('dist');
  const context = await chromium.launchPersistentContext('', { channel: process.env.CODEVAULT_BROWSER_CHANNEL || 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    const rows = Array.from({ length: 20 }, (_, i) => ({ id: `leetcode:${i + 1}`, platform: 'leetcode', slug: `problem-${i + 1}`, url: `https://leetcode.cn/problems/problem-${i + 1}/`, title: `题目 ${i + 1}`, difficulty: 'Easy', tags: [i === 0 ? '独特标签' : '数组'], createdAt: 100 + i, updatedAt: 100 + i }));
    await worker.evaluate((rows) => new Promise((resolve, reject) => {
      const request = indexedDB.open('codevault', 3);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('problems', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
        request.result.createObjectStore('solutions', { keyPath: 'id' }).createIndex('problemId', 'problemId');
        request.result.createObjectStore('notes', { keyPath: 'problemId' });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(['problems', 'solutions', 'notes'], 'readwrite');
        rows.forEach((row) => tx.objectStore('problems').put(row));
        tx.objectStore('solutions').put({ id: 'legacy-solution', problemId: rows[0].id, name: '双指针旧解法', code: 'legacy code preserved', language: 'python', createdAt: 1 });
        tx.objectStore('notes').put({ problemId: rows[0].id, markdown: '旧笔记', images: { retained: 'legacy image preserved' }, revision: 2, updatedAt: 10 });
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
      };
    }), rows);
    await context.route('https://leetcode.cn/**', (route) => {
      if (new URL(route.request().url()).pathname === '/graphql/') {
        const slug = route.request().postDataJSON().variables.titleSlug;
        const number = slug.split('-')[1];
        return route.fulfill({ json: { data: { question: { questionId: number, titleSlug: slug, title: `题目 ${number}`, difficulty: 'Easy', topicTags: [] } } } });
      }
      return route.fulfill({ contentType: 'text/html', body: '<h1>Navigation fixture</h1>' });
    });
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.getByRole('heading', { name: '我的收藏（20）' }).waitFor();
    const send = (message) => popup.evaluate((message) => chrome.runtime.sendMessage({ channel: 'codevault', ...message }), message);
    const summary = (await send({ action: 'library.list' })).data.find((row) => row.id === rows[0].id);
    assert.equal(summary.favoriteAt, 100); assert.equal(summary.lastOpenedAt, null);
    assert.equal(summary.solutionCount, 1); assert.equal(summary.hasNote, true);
    assert.equal(JSON.stringify(summary).includes('legacy code'), false);
    assert.equal((await send({ action: 'solutions.list', problemId: rows[0].id })).data[0].code, 'legacy code preserved');
    assert.equal((await send({ action: 'notes.get', problemId: rows[0].id })).data.images.retained, 'legacy image preserved');
    const query = popup.getByRole('searchbox');
    for (const value of ['独特标签', '双指针旧解法', '题目 1']) {
      await query.fill(value); await popup.getByRole('link', { name: '题目 1', exact: true }).waitFor();
    }
    await query.fill('不存在'); await popup.getByText('没有匹配的收藏题目。').waitFor();
    await query.fill('双指针');
    // No LeetCode tab exists: selecting a favorite creates one.
    const created = context.waitForEvent('page');
    await popup.getByRole('link', { name: '题目 1', exact: true }).click();
    const page = await created;
    await page.getByRole('button', { name: '返回题库', exact: false }).waitFor();
    await page.locator('.problem h3').getByText('题目 1', { exact: true }).waitFor();
    await page.getByRole('button', { name: '返回题库', exact: false }).click();
    assert.equal(await page.getByRole('searchbox').inputValue(), '双指针');
    await page.getByRole('button', { name: '题目 1', exact: true }).waitFor();
    await page.getByRole('searchbox').fill('题目');
    await page.locator('.library-scroll').evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await page.getByRole('link', { name: '题目 1', exact: true }).click();
    await page.getByRole('button', { name: '返回题库', exact: false }).click();
    assert.ok(await page.locator('.library-scroll').evaluate((element) => element.scrollTop) > 100);
    // A different favorite reloads the existing tab, restoring the panel and search.
    await query.fill('题目 2');
    const count = context.pages().length;
    await popup.getByRole('link', { name: '题目 2', exact: true }).click();
    await page.waitForURL(rows[1].url);
    await page.locator('.problem h3').getByText('题目 2', { exact: true }).waitFor();
    assert.equal(context.pages().length, count);
    await page.getByRole('button', { name: '返回题库', exact: false }).click();
    assert.equal(await page.getByRole('searchbox').inputValue(), '题目 2');
    await page.evaluate(() => history.pushState({}, '', '/problems/problem-3/'));
    await page.locator('.problem h3').getByText('题目 3', { exact: true }).waitFor();
    assert.equal((await send({ action: 'problems.visit', id: 'leetcode:999' })).data, null);
    assert.equal((await send({ action: 'problems.list' })).data.length, 20);
    await page.getByRole('button', { name: '返回题库', exact: false }).click();
    await page.getByRole('searchbox').fill('');
    await page.screenshot({ path: 'test-results/library-v02.png' });
    await page.goto('https://leetcode.cn/problemset/');
    await page.getByRole('searchbox').waitFor();
    await page.evaluate(() => history.pushState({}, '', '/problems/problem-4/'));
    await page.locator('.problem h3').getByText('题目 4', { exact: true }).waitFor();
  } finally { await context.close(); }
});
