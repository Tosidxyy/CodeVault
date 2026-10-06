import { openCurrentProblem } from './helpers.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import { validateSolution } from '../src/database/validation.ts';

const problem = { id: 'leetcode:1', platform: 'leetcode', slug: 'two-sum', url: 'https://leetcode.cn/problems/two-sum/', title: '两数之和', difficulty: 'Easy', tags: ['数组'] };
const draft = { id: '11111111-1111-4111-8111-111111111111', name: '版本一', language: 'python', code: '  def solve():\n\treturn 1\n', source: 'own', sourceUrl: problem.url, note: '' };

test('solution validation preserves exact code and rejects empty, oversized or mismatched drafts', () => {
  assert.equal(validateSolution(draft, problem).code, draft.code);
  assert.equal(validateSolution({ ...draft, name: ' ' }, problem).name, '');
  for (const patch of [{ id: 'bad' }, { name: 'a'.repeat(101) }, { code: '\n ' }, { code: 'a'.repeat(500001) }, { language: 'plaintext' }, { source: 'unknown' }, { sourceUrl: 'https://leetcode.cn/problems/other/' }, { note: 'a'.repeat(5001) }]) {
    assert.throws(() => validateSolution({ ...draft, ...patch }, problem));
  }
});

test('v1 migration, hover capture, multiple versions, atomic rollback, idempotent retry and restart', { timeout: 90000 }, async () => {
  const resultDir = resolve('test-results');
  await mkdir(resultDir, { recursive: true });
  const profile = await mkdtemp(resolve(resultDir, 'solution-profile-'));
  const extension = resolve('dist');
  const launch = () => chromium.launchPersistentContext(profile, { locale: 'zh-CN', channel: process.env.CODEVAULT_BROWSER_CHANNEL || 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  let context;
  try {
    context = await launch();
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    await worker.evaluate((p) => new Promise((resolveOpen, reject) => {
      const request = indexedDB.open('codevault', 1);
      request.onupgradeneeded = () => { const store = request.result.createObjectStore('problems', { keyPath: 'id' }); store.createIndex('updatedAt', 'updatedAt'); };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('problems', 'readwrite');
        tx.objectStore('problems').put({ ...p, createdAt: 123, updatedAt: 123 });
        tx.oncomplete = () => { db.close(); resolveOpen(); };
      };
    }), problem);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.getByRole('link', { name: problem.title, exact: true }).waitFor();
    const send = (message) => popup.evaluate((value) => chrome.runtime.sendMessage({ channel: 'codevault', ...value }), message);
    assert.equal((await send({ action: 'problems.get', id: problem.id })).data.createdAt, 123);
    assert.equal(await worker.evaluate(async () => (await indexedDB.databases()).find((db) => db.name === 'codevault').version), 5);

    const code = Array.from({ length: 150 }, (_, i) => `  line_${i} = "数据"\t# preserved`).join('\r\n') + '\r\n';
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(({ code }) => {
      window.fixtureCode = code;
      window.fixtureLanguage = 'python';
      window.extraEditor = false;
      window.monaco = { editor: { getEditors: () => [
        { getDomNode: () => document.querySelector('#code-editor'), getRawOptions: () => ({ readOnly: false }), getModel: () => ({ getValue: () => window.fixtureCode, getLanguageId: () => window.fixtureLanguage }) },
        { getDomNode: () => document.querySelector('#test-editor'), getRawOptions: () => ({ readOnly: false }), getModel: () => ({ getValue: () => '[1,2,3]', getLanguageId: () => 'plaintext' }) },
        ...(window.extraEditor ? [{ getDomNode: () => document.querySelector('#test-editor'), getRawOptions: () => ({ readOnly: false }), getModel: () => ({ getValue: () => 'wrong editor', getLanguageId: () => 'cpp' }) }] : []),
      ] } };
    }, { code });
    await page.route('https://leetcode.*/**', (route) => {
      if (new URL(route.request().url()).pathname === '/graphql/') {
        const slug = route.request().postDataJSON().variables.titleSlug;
        return route.fulfill({ json: { data: { question: { questionId: slug === 'two-sum' ? '1' : '2', titleSlug: slug, title: slug, translatedTitle: slug === 'two-sum' ? '两数之和' : '两数相加', difficulty: 'Easy', topicTags: [] } } } });
      }
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<div id="code-editor" class="monaco-editor" style="width:600px;height:350px;background:#eee">Only first visible line</div><div id="test-editor" class="monaco-editor" style="width:600px;height:100px">Test input</div>' });
    });
    await page.goto(problem.url);
    await page.locator('#code-editor').hover();
    await page.getByRole('button', { name: '🚀 添加至 CodeVault', exact: true }).click();
    await page.getByLabel('解法名称', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('代码预览', { exact: true }).count(), 0);
    await page.getByLabel('解法名称', { exact: true }).fill('完整代码快照');
    await page.getByLabel('备注（可选）', { exact: true }).fill('保留缩进与换行');
    await page.getByRole('button', { name: '保存解法', exact: true }).click();
    await page.getByText('已保存：完整代码快照', { exact: true }).waitFor();
    const first = (await send({ action: 'solutions.list', problemId: problem.id })).data[0];
    assert.equal(first.code, code);
    assert.equal(first.language, 'python');
    assert.equal(first.source, 'own');
    assert.equal(first.problemId, problem.id);
    assert.equal(await page.evaluate(() => window.fixtureCode), code);
    assert.equal((await send({ action: 'problems.get', id: problem.id })).data.createdAt, 123);

    await page.evaluate(() => { window.fixtureCode = 'class Solution {};\n'; window.fixtureLanguage = 'cpp'; });
    await page.getByRole('button', { name: '读取当前代码', exact: true }).click();
    await page.getByLabel('解法名称', { exact: true }).fill('C++版本');
    await page.getByRole('button', { name: '保存解法', exact: true }).click();
    await page.getByText('已保存：C++版本', { exact: true }).waitFor();
    assert.equal((await send({ action: 'solutions.list', problemId: problem.id })).data.length, 2);

    await page.evaluate(() => { window.extraEditor = true; });
    await page.getByRole('button', { name: '读取当前代码', exact: true }).click();
    await page.getByText('发现多个代码编辑器，请使用目标编辑器的添加按钮。', { exact: true }).waitFor();
    await page.getByRole('button', { name: '关闭面板' }).click();
    await page.locator('#code-editor').hover();
    await page.getByRole('button', { name: '🚀 添加至 CodeVault', exact: true }).click();
    await page.getByLabel('解法名称', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('代码预览', { exact: true }).count(), 0);
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await page.evaluate(() => { window.extraEditor = false; window.fixtureCode = ''; });
    await page.getByRole('button', { name: '读取当前代码', exact: true }).click();
    await page.getByText('编辑器代码为空。', { exact: true }).waitFor();

    // An unsaved snapshot must not follow the user to another problem.
    await page.evaluate(() => { window.fixtureCode = 'print(1)\n'; window.fixtureLanguage = 'python'; });
    await page.getByRole('button', { name: '读取当前代码', exact: true }).click();
    await page.getByLabel('解法名称', { exact: true }).fill('不得串题');
    await page.evaluate(() => history.pushState({}, '', '/problems/add-two-numbers/'));
    await page.getByRole('link', { name: '两数相加', exact: true }).waitFor();
    assert.equal(await page.getByLabel('代码预览', { exact: true }).count(), 0);
    assert.deepEqual((await send({ action: 'solutions.list', problemId: 'leetcode:2' })).data, []);

    const otherProblem = { ...problem, id: 'leetcode:2', slug: 'add-two-numbers', url: 'https://leetcode.cn/problems/add-two-numbers/', title: '两数相加' };
    const secondDraft = { ...draft, sourceUrl: otherProblem.url };
    // Abort after the solution add has been queued, while adding its parent.
    await worker.evaluate(() => {
      globalThis.originalAdd = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function (...args) { if (this.name === 'problems') throw new DOMException('Test quota', 'QuotaExceededError'); return globalThis.originalAdd.apply(this, args); };
    });
    assert.equal((await send({ action: 'solutions.save', problem: otherProblem, solution: secondDraft })).ok, false);
    assert.equal((await send({ action: 'problems.get', id: otherProblem.id })).data, null);
    assert.deepEqual((await send({ action: 'solutions.list', problemId: otherProblem.id })).data, []);
    await worker.evaluate(() => { IDBObjectStore.prototype.add = globalThis.originalAdd; });
    assert.equal((await send({ action: 'solutions.save', problem: otherProblem, solution: secondDraft })).ok, true);
    assert.equal((await send({ action: 'solutions.save', problem: otherProblem, solution: secondDraft })).ok, true);
    assert.equal((await send({ action: 'solutions.list', problemId: otherProblem.id })).data.length, 1);
    assert.equal((await send({ action: 'solutions.save', problem: otherProblem, solution: { ...secondDraft, code: 'changed' } })).ok, false);
    assert.deepEqual(errors, []);
    await page.evaluate(() => history.pushState({}, '', '/problems/two-sum/'));
    await page.getByText('C++版本', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('代码预览', { exact: true }).count(), 0);
    await page.screenshot({ path: resolve(resultDir, 'solutions-panel.png') });

    await page.goto('https://leetcode.com/problems/two-sum/');
    await openCurrentProblem(page);
    await page.getByRole('button', { name: '读取当前代码', exact: true }).click();
    await page.getByLabel('解法名称', { exact: true }).fill('国际站版本');
    await page.getByRole('button', { name: '保存解法', exact: true }).click();
    await page.getByText('已保存：国际站版本', { exact: true }).waitFor();
    assert.equal((await send({ action: 'solutions.list', problemId: problem.id })).data.find((row) => row.name === '国际站版本').sourceUrl, 'https://leetcode.com/problems/two-sum/');

    const analysisTarget = (await send({ action: 'solutions.list', problemId: problem.id })).data.find((row) => row.name === '完整代码快照');
    assert.equal((await send({ action: 'solutions.analysis.save', problemId: problem.id, id: analysisTarget.id, revision: analysisTarget.revision ?? 0, analysis: '### 思路\n离线保留分析' })).ok, true);
    await context.close();
    context = await launch();
    await context.setOffline(true);
    const restored = await context.newPage();
    await restored.goto(`chrome-extension://${extensionId}/popup.html`);
    const rows = await restored.evaluate((id) => chrome.runtime.sendMessage({ channel: 'codevault', action: 'solutions.list', problemId: id }), problem.id);
    assert.equal(rows.data.length, 3);
    assert.equal(rows.data.find((row) => row.name === '完整代码快照').analysis, '### 思路\n离线保留分析');
    assert.equal(rows.data.find((row) => row.name === '完整代码快照').code, code);
  } finally {
    await context?.close();
    if (profile.startsWith(resultDir + sep)) await rm(profile, { recursive: true, force: true });
  }
});
