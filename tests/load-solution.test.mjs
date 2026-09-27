import { openCurrentProblem } from './helpers.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

test('load replaces only matching current editor, preserves undo and rejects stale or unsafe writes', { timeout: 90000 }, async () => {
  const extension = resolve('dist');
  const context = await chromium.launchPersistentContext('', { channel: process.env.CODEVAULT_BROWSER_CHANNEL || 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
    const problem = { id: 'leetcode:1', platform: 'leetcode', slug: 'two-sum', url: 'https://leetcode.cn/problems/two-sum/', title: '两数之和', difficulty: 'Easy', tags: [] };
    const code = 'def solve():\r\n    return "你好"\r\n';
    const solution = { id: crypto.randomUUID(), name: '已保存版本', code, language: 'python', source: 'own', sourceUrl: problem.url, note: '' };
    assert.equal((await popup.evaluate((data) => chrome.runtime.sendMessage({ channel: 'codevault', action: 'solutions.save', ...data }), { problem, solution })).ok, true);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.fixture = { code: 'unsaved original\n', language: 'python', version: 1, readonly: false, fail: false, ambiguous: false, edits: 0, stops: 0, history: [], mutate: '' };
      const makeModel = () => ({ getValue: () => window.fixture.code, getLanguageId: () => window.fixture.language, getVersionId: () => window.fixture.version,
        getFullModelRange: () => ({ startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 1 }) });
      window.fixtureModel = makeModel();
      const editor = { getDomNode: () => document.querySelector('#editor'), getRawOptions: () => ({ readOnly: window.fixture.readonly }), getModel: () => window.fixtureModel,
        pushUndoStop: () => { window.fixture.stops++; return true; }, executeEdits: (_source, edits) => {
          if (window.fixture.fail) return false;
          window.fixture.history.push(window.fixture.code); window.fixture.code = edits[0].text.replace(/\r\n?/g, '\n'); window.fixture.version++; window.fixture.edits++; return true;
        } };
      window.monaco = { editor: { getEditors: () => window.fixture.ambiguous ? [editor, editor] : [editor] } };
      window.addEventListener('message', (event) => {
        if (event.data?.channel !== 'codevault-editor' || !event.data.ticket || event.data.type !== 'result') return;
        const mode = window.fixture.mutate;
        window.fixture.mutate = '';
        if (mode === 'code') { window.fixture.code = 'new user edit'; window.fixture.version++; }
        if (mode === 'model') window.fixtureModel = makeModel();
        if (mode === 'language') window.fixture.language = 'cpp';
        if (mode === 'navigate') history.pushState({}, '', '/problems/other/');
      });
    });
    await page.route('https://leetcode.*/**', (route) => {
      if (new URL(route.request().url()).pathname === '/graphql/') {
        const slug = route.request().postDataJSON().variables.titleSlug;
        return route.fulfill({ json: { data: { question: { questionId: slug === 'two-sum' ? '1' : '2', titleSlug: slug, title: slug, translatedTitle: slug === 'two-sum' ? '两数之和' : '另一题', difficulty: 'Easy', topicTags: [] } } } });
      }
      return route.fulfill({ contentType: 'text/html', body: '<div id="editor" class="monaco-editor" style="width:600px;height:300px">Editor</div>' });
    });
    const open = async (host = 'leetcode.cn') => {
      await page.goto(`https://${host}/problems/two-sum/`);
      await openCurrentProblem(page);
      await page.locator('summary').filter({ hasText: '已保存版本' }).click();
    };
    const clickLoad = () => page.getByRole('button', { name: '加载到编辑器', exact: true }).click();
    const load = async () => {
      await clickLoad();
      await page.waitForFunction(() => {
        const root = document.querySelector('#codevault-root').shadowRoot;
        return root.querySelector('[role=alertdialog]') || root.querySelector('.solutions [role=alert]') ||
          [...root.querySelectorAll('[role=status]')].some((node) => node.textContent.startsWith('已加载')) || location.pathname.includes('/other/');
      });
      const confirm = page.getByRole('button', { name: '继续加载', exact: true });
      if (await confirm.isVisible()) await confirm.click();
    };
    const state = () => page.evaluate(() => window.fixture);
    await open();
    await clickLoad();
    await page.getByRole('alertdialog').waitFor();
    assert.equal((await state()).edits, 0);
    await page.getByRole('button', { name: '取消加载' }).click();
    assert.equal((await state()).code, 'unsaved original\n');
    await clickLoad();
    await page.getByRole('alertdialog').waitFor();
    await page.evaluate(() => { window.fixture.code = 'edit while confirming'; window.fixture.version++; });
    await page.getByRole('button', { name: '继续加载' }).click();
    await page.getByRole('alert').filter({ hasText: '编辑器内容已变化' }).waitFor();
    assert.equal((await state()).code, 'edit while confirming');
    assert.equal((await state()).edits, 0);
    await page.evaluate(() => { window.fixture.code = 'unsaved original\n'; window.fixture.version++; });
    await load();
    await page.getByText('已加载：已保存版本。可在编辑器按 Ctrl+Z 撤销。', { exact: true }).waitFor();
    assert.equal((await state()).code, code.replaceAll('\r\n', '\n'));
    assert.equal((await state()).edits, 1);
    assert.equal((await state()).stops, 2);
    await load();
    await page.getByText('已加载：已保存版本。可在编辑器按 Ctrl+Z 撤销。', { exact: true }).waitFor();
    assert.equal((await state()).edits, 1); // Same code does not add an undo entry.
    await page.evaluate(() => { window.fixture.code = window.fixture.history.pop(); window.fixture.version++; });
    assert.equal((await state()).code, 'unsaved original\n');
    await page.evaluate(() => { window.fixture.code = ''; window.fixture.version++; });
    await load();
    await page.getByText('已加载：已保存版本。可在编辑器按 Ctrl+Z 撤销。', { exact: true }).waitFor();
    assert.equal((await state()).code, code.replaceAll('\r\n', '\n'));

    for (const [patch, expected] of [
      [{ language: 'cpp' }, '语言不匹配'], [{ language: 'python', readonly: true }, '未找到可读取'],
      [{ readonly: false, ambiguous: true }, '发现多个代码编辑器'],
      [{ ambiguous: false, mutate: 'code' }, '编辑器内容已变化'],
      [{ mutate: 'model' }, '编辑器内容已变化'], [{ mutate: 'language' }, '编辑器语言已变化'],
      [{ language: 'python', fail: true, code: 'leave unchanged' }, '编辑器拒绝加载'],
    ]) {
      await page.evaluate((value) => Object.assign(window.fixture, value), patch);
      const before = await state();
      await load();
      await page.getByRole('alert').filter({ hasText: expected }).waitFor();
      const after = await state();
      assert.equal(after.edits, before.edits);
      assert.equal(after.code, patch.mutate === 'code' ? 'new user edit' : before.code);
    }
    await page.evaluate(() => { window.fixture.fail = false; window.fixture.mutate = 'navigate'; });
    const beforeNavigation = await state();
    await load();
    await page.getByRole('link', { name: '另一题', exact: true }).waitFor();
    assert.equal((await state()).edits, beforeNavigation.edits);
    assert.equal(await page.getByRole('button', { name: '加载到编辑器', exact: true }).count(), 0);
    await open('leetcode.com');
    await load();
    await page.getByText('已加载：已保存版本。可在编辑器按 Ctrl+Z 撤销。', { exact: true }).waitFor();
    assert.equal((await state()).code, code.replaceAll('\r\n', '\n'));
    const stored = await popup.evaluate(() => chrome.runtime.sendMessage({ channel: 'codevault', action: 'solutions.list', problemId: 'leetcode:1' }));
    assert.equal(stored.data.length, 1);
    assert.equal(stored.data[0].code, code);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: resolve('test-results/load-solution.png') });
  } finally { await context.close(); }
});
