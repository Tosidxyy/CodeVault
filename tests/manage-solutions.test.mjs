import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { validateMetadata } from '../src/database/validation.ts';

test('solution metadata accepts only bounded fields and safe source links', () => {
  const metadata = { name: ' 名称 ', note: '', source: 'reference', sourceUrl: 'https://example.com/article' };
  assert.deepEqual(validateMetadata({ ...metadata, code: 'cannot change code' }), { ...metadata, name: '名称' });
  for (const patch of [{ name: ' ' }, { name: 'x'.repeat(101) }, { note: 'x'.repeat(5001) }, { source: 'unknown' },
    { sourceUrl: 'javascript:alert(1)' }, { sourceUrl: 'file:///a' }, { sourceUrl: 'https://user:password@example.com' }, { sourceUrl: '' }]) {
    assert.throws(() => validateMetadata({ ...metadata, ...patch }));
  }
});

test('solution management persists metadata, confirms deletion and rejects stale writes atomically', { timeout: 90000 }, async () => {
  const extension = resolve('dist');
  const context = await chromium.launchPersistentContext('', { channel: process.env.CODEVAULT_BROWSER_CHANNEL || 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
    const send = (data) => popup.evaluate((message) => chrome.runtime.sendMessage({ channel: 'codevault', ...message }), data);
    const problem = { id: 'leetcode:1', platform: 'leetcode', slug: 'two-sum', url: 'https://leetcode.cn/problems/two-sum/', title: '两数之和', difficulty: 'Easy', tags: [] };
    const solution = { id: crypto.randomUUID(), name: '原版本', code: 'print("你好")\r\n', language: 'python', source: 'own', sourceUrl: problem.url, note: '' };
    const saved = (await send({ action: 'solutions.save', problem, solution })).data;
    const sibling = { ...solution, id: crypto.randomUUID(), name: '保留版本' };
    assert.equal((await send({ action: 'solutions.save', problem, solution: sibling })).ok, true);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://leetcode.cn/**', (route) => new URL(route.request().url()).pathname === '/graphql/'
      ? route.fulfill({ json: { data: { question: { questionId: '1', titleSlug: 'two-sum', title: 'Two Sum', translatedTitle: '两数之和', difficulty: 'Easy', topicTags: [] } } } })
      : route.fulfill({ contentType: 'text/html', body: '<h1>Host page intact</h1>' }));
    const open = async (name) => {
      await page.goto(problem.url);
      await page.getByRole('button', { name: '展开 CodeVault' }).click();
      await page.locator('summary').filter({ hasText: name }).click();
    };
    const button = (name) => page.getByRole('button', { name, exact: true });
    await open('原版本');
    await button('编辑信息').filter({ visible: true }).click();
    await page.getByLabel('修改名称').fill('放弃的名称');
    await button('取消修改').click();
    assert.equal((await send({ action: 'solutions.list', problemId: problem.id })).data.find((s) => s.id === solution.id).name, '原版本');
    await button('编辑信息').filter({ visible: true }).click();
    await page.getByLabel('修改名称').fill('参考版本');
    await page.getByLabel('修改备注').fill('记录参考思路');
    await page.getByLabel('来源类型').selectOption('reference');
    await page.getByLabel('来源链接').fill('https://example.com/algorithm');
    await page.screenshot({ path: resolve('test-results/edit-solution.png') });
    await button('保存修改').click();
    await page.getByText('解法信息已更新。', { exact: true }).waitFor();
    await open('参考版本');
    await page.getByRole('link', { name: '查看来源' }).filter({ visible: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: '查看来源' }).filter({ visible: true }).getAttribute('href'), 'https://example.com/algorithm');
    const list = () => send({ action: 'solutions.list', problemId: problem.id });
    const updated = (await list()).data.find((s) => s.id === solution.id);
    assert.equal(updated.code, solution.code); assert.equal(updated.language, solution.language);
    assert.equal(updated.createdAt, saved.createdAt); assert.equal(updated.revision, 1);
    assert.equal(updated.note, '记录参考思路'); assert.equal(updated.source, 'reference');
    const target = { id: solution.id, problemId: problem.id, revision: 1 };
    const metadata = { name: '并发修改', note: '', source: 'template', sourceUrl: problem.url };
    for (const action of ['solutions.update', 'solutions.delete']) {
      assert.equal((await send({ action, ...target, revision: 0, metadata })).ok, false);
      assert.equal((await send({ action, ...target, problemId: 'leetcode:2', metadata })).ok, false);
    }
    // A failed put must preserve the entire existing record.
    await worker.evaluate(() => { globalThis.originalPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (...args) { if (this.name === 'solutions') throw new Error('injected'); return globalThis.originalPut.apply(this, args); }; });
    assert.equal((await send({ action: 'solutions.update', ...target, metadata })).ok, false);
    await worker.evaluate(() => { IDBObjectStore.prototype.put = globalThis.originalPut; });
    assert.deepEqual((await list()).data.find((s) => s.id === solution.id), updated);
    await button('编辑信息').filter({ visible: true }).click();
    assert.equal((await send({ action: 'solutions.update', ...target, metadata })).ok, true);
    await page.getByLabel('修改名称').fill('过期表单');
    await button('保存修改').click();
    await page.getByRole('alert').filter({ hasText: '解法已变化' }).waitFor();
    await button('刷新解法').click();
    const refreshed = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: '并发修改' }) });
    await refreshed.waitFor();
    if (await refreshed.getAttribute('open') === null) await refreshed.locator('summary').click();
    await button('删除解法').filter({ visible: true }).click();
    await button('取消删除').click();
    assert.equal((await list()).data.length, 2);
    await button('删除解法').filter({ visible: true }).click();
    await worker.evaluate(() => { globalThis.originalDelete = IDBObjectStore.prototype.delete; IDBObjectStore.prototype.delete = function (...args) { if (this.name === 'solutions') throw new Error('injected'); return globalThis.originalDelete.apply(this, args); }; });
    await button('确认删除').click();
    await page.getByRole('alert').filter({ hasText: '本地存储暂时不可用' }).waitFor();
    assert.equal((await list()).data.length, 2);
    await worker.evaluate(() => { IDBObjectStore.prototype.delete = globalThis.originalDelete; });
    await button('确认删除').click();
    await page.getByText('已删除：并发修改', { exact: true }).waitFor();
    await open('保留版本');
    assert.equal((await list()).data.length, 1);
    assert.equal((await list()).data[0].id, sibling.id);
    assert.equal((await send({ action: 'problems.get', id: problem.id })).data.id, problem.id);
    assert.equal((await send({ action: 'solutions.update', ...target, revision: 2, metadata })).ok, false);
    assert.equal(await page.getByRole('heading', { name: 'Host page intact' }).count(), 1);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: resolve('test-results/manage-solutions.png') });
  } finally { await context.close(); }
});

