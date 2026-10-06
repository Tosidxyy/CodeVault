import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { openCurrentProblem } from './helpers.mjs';

const problem = { id: 'leetcode:1', title: 'Two Sum', slug: 'two-sum', url: 'https://leetcode.cn/problems/two-sum/', platform: 'leetcode', difficulty: 'Easy', tags: [] };
test('streamed analysis renders safely, stops, saves to one solution and rejects conflicts', { timeout: 90000 }, async () => {
  const extension = resolve('dist');
  const context = await chromium.launchPersistentContext('', { locale: 'zh-CN', channel: process.env.CODEVAULT_BROWSER_CHANNEL || 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    for (let i = 0; i < 250 && !await worker.evaluate(() => !!globalThis.chrome?.permissions); i++) await new Promise((r) => setTimeout(r, 20));
    const base = `chrome-extension://${new URL(worker.url()).host}`;
    const options = await context.newPage(); await options.goto(`${base}/options.html`);
    const send = (message) => options.evaluate((message) => chrome.runtime.sendMessage({ channel: 'codevault', ...message }), message);
    await worker.evaluate(() => {
      chrome.permissions.contains = async () => true;
      globalThis.fixture = { aborted: 0, requests: 0 };
      globalThis.fetch = async (_url, options) => {
        const body = JSON.parse(options.body);
        if (!body.stream) throw new Error('expected streaming');
        globalThis.fixture.requests++;
        return new Response(new ReadableStream({ start(controller) {
          const encode = (text) => new TextEncoder().encode(text);
          const chunk = (text) => controller.enqueue(encode('data: ' + JSON.stringify({ choices: [{ delta: { content: text } }] }) + '\n\n'));
          chunk('### 思路\n用**哈希表**查找。\n\n');
          globalThis.fixture.finish = () => { chunk('### 复杂度\n- 时间：O(n)\n- 空间：O(n)\n\n![remote](https://example.com/tracker.png)\n<script>alert(1)</script>\n\n[链接](javascript:alert(1))'); controller.enqueue(encode('data: [DONE]\n\n')); controller.close(); };
          options.signal.addEventListener('abort', () => { globalThis.fixture.aborted++; try { controller.error(new Error('aborted')); } catch {} });
        } }), { headers: { 'Content-Type': 'text/event-stream' } });
      };
    });
    assert.equal((await options.evaluate(() => chrome.runtime.sendMessage({ channel: 'codevault-ai', action: 'save', config: { provider: 'openai', endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4.1-mini', apiKey: 'fixture-secret' } }))).ok, true);
    const solution = { id: crypto.randomUUID(), name: '哈希解法', code: 'print(1)', language: 'python', source: 'own', sourceUrl: problem.url, note: '保留备注' };
    assert.equal((await send({ action: 'solutions.save', problem, solution })).ok, true);
    const sibling = { ...solution, id: crypto.randomUUID(), name: '其他解法' };
    assert.equal((await send({ action: 'solutions.save', problem, solution: sibling })).ok, true);
    const list = async () => (await send({ action: 'solutions.list', problemId: problem.id })).data;
    const current = async () => (await list()).find((row) => row.id === solution.id);
    const page = await context.newPage();
    await page.route('https://leetcode.cn/**', (route) => new URL(route.request().url()).pathname === '/graphql/' ? route.fulfill({ json: { data: { question: { questionId: '1', titleSlug: 'two-sum', title: 'Two Sum', difficulty: 'Easy', topicTags: [] } } } }) : route.fulfill({ contentType: 'text/html', body: '<h1>Host intact</h1>' }));
    await page.goto(problem.url); await openCurrentProblem(page);
    const section = page.getByRole('region', { name: 'AI 代码分析', exact: true });
    const button = (name) => section.getByRole('button', { name, exact: true });
    await section.getByLabel('分析对象').selectOption(solution.id);
    await button('读取待分析代码').click(); await button('发送并分析代码').click();
    await section.getByRole('heading', { name: '思路', exact: true }).waitFor();
    assert.equal(await button('保存分析').count(), 0);
    assert.equal(await button('停止生成').isVisible(), true);
    assert.equal((await current()).analysis, undefined);
    await button('停止生成').click();
    await section.getByRole('alert').filter({ hasText: '已停止生成' }).waitFor();
    assert.equal(await section.getByRole('heading', { name: '思路', exact: true }).isVisible(), true);
    assert.equal(await button('保存分析').count(), 0);
    await button('发送并分析代码').click();
    await section.getByRole('heading', { name: '思路', exact: true }).waitFor();
    await worker.evaluate(() => globalThis.fixture.finish());
    await button('保存分析').waitFor();
    assert.equal(await section.locator('strong').filter({ hasText: '哈希表' }).count(), 1);
    assert.equal(await section.locator('img,script,a').count(), 0);
    await button('保存分析').click(); await section.getByText('分析已保存到该解法。', { exact: true }).waitFor();
    const saved = await current();
    assert.match(saved.analysis, /复杂度/); assert.equal(saved.note, solution.note); assert.equal(saved.code, solution.code); assert.equal(saved.revision, 1);
    assert.equal((await list()).find((row) => row.id === sibling.id).analysis, undefined);
    await page.locator('summary').filter({ hasText: solution.name }).click();
    await page.getByLabel('已保存的 AI 分析').waitFor();
    await section.scrollIntoViewIfNeeded(); await page.screenshot({ path: resolve('test-results/ai-stream-saved.png') });
    await button('重新生成').click(); await section.getByRole('heading', { name: '思路', exact: true }).waitFor();
    await worker.evaluate(() => globalThis.fixture.finish()); await button('保存分析').waitFor();
    await button('保存分析').click(); await section.getByRole('alertdialog', { name: '覆盖分析确认' }).waitFor();
    await button('取消替换分析').click(); assert.equal((await current()).revision, 1);
    await button('保存分析').click(); await button('确认替换分析').click();
    await section.getByText('分析已保存到该解法。', { exact: true }).waitFor();
    assert.equal((await current()).revision, 2);
    // A different editor changes the solution while generation is in progress.
    await button('重新生成').click(); await section.getByRole('heading', { name: '思路', exact: true }).waitFor();
    const metadata = { name: '并发改名', note: '新的备注', source: 'own', sourceUrl: problem.url };
    assert.equal((await send({ action: 'solutions.update', problemId: problem.id, id: solution.id, revision: 2, metadata })).ok, true);
    await worker.evaluate(() => globalThis.fixture.finish()); await button('保存分析').waitFor();
    await button('保存分析').click(); await button('确认替换分析').click();
    await section.getByRole('alert').filter({ hasText: '解法已变化' }).waitFor();
    assert.equal((await current()).revision, 3); assert.equal((await current()).analysis, saved.analysis);
    // Invalid, wrong-parent and stale writes cannot attach an analysis elsewhere.
    for (const patch of [{ revision: 0 }, { problemId: 'leetcode:2' }, { analysis: '' }, { analysis: 'x'.repeat(12001) }]) {
      assert.equal((await send({ action: 'solutions.analysis.save', problemId: problem.id, id: solution.id, revision: 3, analysis: 'bad', ...patch })).ok, false);
    }
    // Failed IDB writes roll back without losing the prior analysis.
    await worker.evaluate(() => { globalThis.originalPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (...args) { if (this.name === 'solutions') throw new Error('fixture'); return globalThis.originalPut.apply(this, args); }; });
    assert.equal((await send({ action: 'solutions.analysis.save', problemId: problem.id, id: solution.id, revision: 3, analysis: 'replacement' })).ok, false);
    await worker.evaluate(() => { IDBObjectStore.prototype.put = globalThis.originalPut; });
    assert.equal((await current()).analysis, saved.analysis);
    await page.reload(); await openCurrentProblem(page);
    await page.locator('summary').filter({ hasText: '并发改名' }).click();
    await page.getByLabel('已保存的 AI 分析').getByRole('heading', { name: '复杂度' }).waitFor();
    assert.equal(await page.getByLabel('已保存的 AI 分析').locator('img,script,a').count(), 0);
    assert.equal(await page.getByRole('heading', { name: 'Host intact' }).isVisible(), true);
    assert.equal((await send({ action: 'solutions.delete', problemId: problem.id, id: solution.id, revision: 3 })).ok, true);
    assert.equal((await send({ action: 'solutions.analysis.save', problemId: problem.id, id: solution.id, revision: 3, analysis: 'bad' })).ok, false);
    assert.equal((await list()).length, 1);
  } finally { await context.close(); }
});
