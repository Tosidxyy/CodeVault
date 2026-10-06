import { openCurrentProblem } from './helpers.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import { validateProblem, validProblemId } from '../src/database/validation.ts';

const problem = { id: 'leetcode:1', platform: 'leetcode', slug: 'two-sum', url: 'https://leetcode.cn/problems/two-sum/', title: '两数之和', difficulty: 'Easy', tags: ['数组', '哈希表'] };

test('storage validation rejects unsafe and oversized records and strips extra fields', () => {
  assert.equal(validProblemId('leetcode:1'), true);
  assert.equal(validProblemId('other:1'), false);
  assert.deepEqual(validateProblem({ ...problem, title: ' 两数之和 ', extra: 'not stored', tags: ['数组', '数组'] }), { ...problem, tags: ['数组'] });
  for (const change of [{ url: 'javascript:alert(1)' }, { url: 'https://evil.com/problems/two-sum/' }, { slug: 'other' }, { id: 'leetcode:bad' }, { title: 'x'.repeat(501) }, { tags: [null] }, { tags: Array(51).fill('数组') }, { difficulty: 'Unknown' }]) {
    assert.throws(() => validateProblem({ ...problem, ...change }));
  }
});

test('bookmarks persist in extension IDB, deduplicate, rollback failures and survive browser restart offline', { timeout: 90000 }, async () => {
  const resultDir = resolve('test-results');
  await mkdir(resultDir, { recursive: true });
  const profile = await mkdtemp(resolve(resultDir, 'storage-profile-'));
  const extensionPath = resolve('dist');
  const launch = () => chromium.launchPersistentContext(profile, { locale: 'zh-CN',
    channel: process.env.CODEVAULT_BROWSER_CHANNEL || 'chromium', headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  let context;
  try {
    context = await launch();
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.getByText('还没有收藏。', { exact: false }).waitFor();
    const message = (request) => popup.evaluate((value) => chrome.runtime.sendMessage({ channel: 'codevault', ...value }), request);
    const page = await context.newPage();
    await page.route('https://leetcode.cn/**', (route) => {
      if (new URL(route.request().url()).pathname === '/graphql/') {
        const slug = route.request().postDataJSON().variables.titleSlug;
        return route.fulfill({ json: { data: { question: {
          questionId: slug === 'two-sum' ? '1' : '2', titleSlug: slug, title: slug,
          translatedTitle: slug === 'two-sum' ? '两数之和' : '两数相加', difficulty: 'Easy', topicTags: [{ name: 'Array', translatedName: '数组' }],
        } } } });
      }
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<h1>Storage fixture</h1>' });
    });
    await page.goto(problem.url);
    await openCurrentProblem(page);
    await page.getByRole('button', { name: '收藏题目', exact: true }).waitFor();
    // Wait for the asynchronous saved-state read to enable the control.
    await page.getByRole('button', { name: '收藏题目', exact: true }).click();
    await page.getByText('已收藏 · 保存在本机', { exact: true }).waitFor();
    const first = (await message({ action: 'problems.get', id: problem.id })).data;
    assert.equal(first.title, problem.title);
    assert.ok(first.createdAt > 0 && first.updatedAt >= first.createdAt);
    await page.getByRole('button', { name: '更新收藏' }).click();
    await page.getByRole('button', { name: '更新收藏' }).waitFor();
    const second = (await message({ action: 'problems.get', id: problem.id })).data;
    assert.equal(second.createdAt, first.createdAt);
    assert.ok(second.updatedAt > first.updatedAt);
    assert.equal((await message({ action: 'problems.list' })).data.length, 1);
    assert.equal(await page.evaluate(async () => (await indexedDB.databases()).some((db) => db.name === 'codevault')), false);
    assert.equal(await worker.evaluate(async () => (await indexedDB.databases()).some((db) => db.name === 'codevault')), true);
    await page.reload();
    await openCurrentProblem(page);
    await page.getByText('已收藏 · 保存在本机', { exact: true }).waitFor();

    // Concurrent saves must keep a single row and the original creation time.
    const writes = await Promise.all(Array.from({ length: 5 }, () => message({ action: 'problems.save', problem })));
    assert.ok(writes.every((response) => response.ok && response.data.createdAt === first.createdAt));
    assert.equal((await message({ action: 'problems.list' })).data.length, 1);
    assert.equal((await message({ action: 'problems.save', problem: { ...problem, url: 'javascript:alert(1)' } })).ok, false);
    assert.equal((await message({ action: 'problems.get', id: 'wrong' })).ok, false);
    assert.equal((await message({ action: 'unknown' })).ok, false);

    await worker.evaluate(() => {
      globalThis.originalTransaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function () { throw new DOMException('Test read failure', 'InvalidStateError'); };
    });
    await page.getByRole('button', { name: '关闭面板' }).click();
    await openCurrentProblem(page);
    await page.getByRole('button', { name: '重试读取收藏' }).waitFor();
    await worker.evaluate(() => { IDBDatabase.prototype.transaction = globalThis.originalTransaction; });
    await page.getByRole('button', { name: '重试读取收藏' }).click();
    await page.getByText('已收藏 · 保存在本机', { exact: true }).waitFor();

    // Simulate disk/quota failure at the real worker's transaction boundary.
    await worker.evaluate(() => {
      globalThis.originalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function () { throw new DOMException('Test quota failure', 'QuotaExceededError'); };
    });
    assert.equal((await message({ action: 'problems.save', problem: { ...problem, title: 'Must not overwrite' } })).ok, false);
    assert.equal((await message({ action: 'problems.get', id: problem.id })).data.title, problem.title);
    await page.evaluate(() => history.pushState({}, '', '/problems/add-two-numbers/'));
    await page.getByRole('button', { name: '收藏题目', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByRole('alert').innerText(), '本地存储暂时不可用，请重试。');
    assert.equal(await page.getByText('已收藏 · 保存在本机', { exact: true }).count(), 0);
    assert.equal((await message({ action: 'problems.get', id: 'leetcode:2' })).data, null);
    await worker.evaluate(() => { IDBObjectStore.prototype.put = globalThis.originalPut; });
    await page.getByRole('button', { name: '收藏题目', exact: true }).click();
    await page.getByText('已收藏 · 保存在本机', { exact: true }).waitFor();
    const list = (await message({ action: 'problems.list' })).data;
    assert.equal(list.length, 2);
    assert.equal(list[0].id, 'leetcode:2');
    await popup.getByRole('button', { name: '刷新收藏' }).click();
    await popup.getByRole('link', { name: '两数相加', exact: true }).waitFor();
    await popup.screenshot({ path: resolve(resultDir, 'saved-problems.png') });
    await page.screenshot({ path: resolve(resultDir, 'saved-panel.png') });

    await context.close();
    context = await launch();
    await context.setOffline(true);
    const restored = await context.newPage();
    await restored.goto(`chrome-extension://${extensionId}/popup.html`);
    await restored.getByRole('link', { name: '两数之和', exact: true }).waitFor();
    await restored.getByRole('link', { name: '两数相加', exact: true }).waitFor();
    await restored.getByRole('heading', { name: '我的收藏（2）' }).waitFor();
    assert.equal(await restored.getByRole('link', { name: '两数之和', exact: true }).getAttribute('href'), problem.url);
  } finally {
    await context?.close();
    if (profile.startsWith(resultDir + sep)) await rm(profile, { recursive: true, force: true });
  }
});
