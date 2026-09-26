import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { validateConfig, validateEndpoint } from '../src/ai/types.ts';
import { analyzeCode } from '../src/ai/provider.ts';

const config = { endpoint: 'https://api.example.com/v1/chat/completions', model: 'fixture-model', apiKey: 'fixture-key', revision: 'fixture' };
const problem = { id: 'leetcode:1', title: 'Two Sum', slug: 'two-sum', url: 'https://leetcode.cn/problems/two-sum/', platform: 'leetcode', difficulty: 'Easy', tags: [] };

test('AI config and provider validate endpoints, protocol, responses and bounded errors', async () => {
  assert.equal(validateConfig(config).model, config.model);
  for (const endpoint of ['http://localhost/chat/completions', 'https://user:pass@example.com/chat/completions', 'https://example.com/chat/completions?key=x', 'javascript:alert(1)', 'https://example.com/v1']) assert.throws(() => validateEndpoint(endpoint));
  assert.throws(() => validateConfig({ ...config, apiKey: 'a\nb' }));
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, config.endpoint); assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit');
      assert.equal(options.headers.Authorization, 'Bearer fixture-key');
      const body = JSON.parse(options.body);
      assert.equal(body.stream, false); assert.equal(body.model, config.model);
      assert.deepEqual(JSON.parse(body.messages[1].content), { title: problem.title, url: problem.url, difficulty: 'Easy', language: 'python', code: 'print(1)' });
      return Response.json({ choices: [{ message: { content: '思路：测试 fixture-key' } }] });
    };
    assert.equal(await analyzeCode(config, problem, 'print(1)', 'python', new AbortController().signal), '思路：测试 [API Key 已隐藏]');
    for (const [response, expected] of [[new Response('secret', { status: 401 }), /API Key/], [new Response('secret', { status: 429 }), /限流/], [new Response('bad'), /JSON/], [Response.json({ choices: [] }), /有效分析/], [new Response('x'.repeat(512001)), /过大/]]) {
      globalThis.fetch = async () => response;
      await assert.rejects(analyzeCode(config, problem, 'print(1)', 'python', new AbortController().signal), expected);
    }
    globalThis.fetch = async () => { throw new Error('private network detail'); };
    await assert.rejects(analyzeCode(config, problem, 'print(1)', 'python', AbortSignal.abort()), /取消或超时/);
  } finally { globalThis.fetch = original; }
});

test('AI settings hide keys; analysis is explicit, cancelable and bound to configuration', { timeout: 90000 }, async () => {
  const extension = resolve('dist');
  const context = await chromium.launchPersistentContext('', { channel: process.env.CODEVAULT_BROWSER_CHANNEL || 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const base = `chrome-extension://${new URL(worker.url()).host}`;
    // Headless test doubles for the native permission prompt and external API only.
    await worker.evaluate(() => {
      globalThis.fixture = { allowed: true, requests: [], mode: 'success', aborted: 0 };
      chrome.permissions.contains = async () => globalThis.fixture.allowed;
      globalThis.fetch = async (url, options) => {
        globalThis.fixture.requests.push({ url, body: JSON.parse(options.body), auth: options.headers.Authorization, redirect: options.redirect });
        if (globalThis.fixture.mode === 'pending') return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => { globalThis.fixture.aborted++; reject(new Error('aborted')); }));
        if (globalThis.fixture.mode === '401') return new Response('private failure', { status: 401 });
        return Response.json({ choices: [{ message: { content: '思路：哈希表\n复杂度：O(n)\n面试表达：逐项查找\n易错点：重复元素' } }] });
      };
    });
    const options = await context.newPage();
    await options.goto(`${base}/options.html`);
    await options.evaluate(() => { chrome.permissions.request = async (value) => { window.requestedOrigins = value.origins; return true; }; });
    await options.getByLabel('完整接口地址').fill(config.endpoint);
    await options.getByLabel('模型名称').fill(config.model);
    await options.getByLabel('API Key', { exact: true }).fill(config.apiKey);
    await options.getByRole('button', { name: '授权并保存 AI 配置' }).click();
    await options.getByText('AI 配置已保存。', { exact: true }).waitFor();
    assert.deepEqual(await options.evaluate(() => window.requestedOrigins), ['https://api.example.com/*']);
    assert.equal(await options.getByLabel('API Key', { exact: true }).inputValue(), '');
    await options.reload();
    await options.getByText(/API Key 已保存（不回显）/).waitFor();
    assert.equal(await options.getByLabel('API Key', { exact: true }).inputValue(), '');
    await options.getByRole('heading', { name: 'AI 设置' }).scrollIntoViewIfNeeded();
    await options.screenshot({ path: resolve('test-results/ai-settings.png') });
    const popup = await context.newPage(); await popup.goto(`${base}/popup.html`);
    const send = (action, value) => popup.evaluate(({ action, config }) => chrome.runtime.sendMessage({ channel: 'codevault-ai', action, config }), { action, config: value });
    assert.equal((await send('save', config)).ok, false);
    assert.equal(JSON.stringify(await send('status')).includes(config.apiKey), false);
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.monaco = { editor: { getEditors: () => [{ getDomNode: () => document.querySelector('#editor'), getRawOptions: () => ({ readOnly: false }), getModel: () => ({ getValue: () => 'print(1)', getLanguageId: () => 'python' }) }] } };
    });
    await page.route('https://leetcode.cn/**', (route) => new URL(route.request().url()).pathname === '/graphql/'
      ? route.fulfill({ json: { data: { question: { questionId: '1', titleSlug: 'two-sum', title: 'Two Sum', difficulty: 'Easy', topicTags: [] } } } })
      : route.fulfill({ contentType: 'text/html', body: '<div id="editor" class="monaco-editor" style="width:600px;height:300px">Editor</div>' }));
    await page.goto(problem.url); await page.getByRole('button', { name: '展开 CodeVault' }).click();
    const button = (name) => page.getByRole('button', { name, exact: true });
    await button('读取待分析代码').click();
    await page.getByRole('textbox', { name: '待分析代码' }).waitFor();
    assert.equal(await worker.evaluate(() => globalThis.fixture.requests.length), 0);
    await button('发送并分析代码').click();
    await page.getByLabel('AI 分析结果').waitFor();
    assert.match(await page.getByLabel('AI 分析结果').textContent(), /复杂度/);
    const requests = await worker.evaluate(() => globalThis.fixture.requests);
    assert.equal(requests.length, 1); assert.equal(requests[0].url, config.endpoint);
    assert.equal(requests[0].auth, 'Bearer fixture-key');
    assert.equal(JSON.parse(requests[0].body.messages[1].content).code, 'print(1)');
    await page.getByLabel('AI 分析结果').scrollIntoViewIfNeeded(); await page.screenshot({ path: resolve('test-results/ai-analysis.png') });
    await worker.evaluate(() => { globalThis.fixture.mode = '401'; });
    await button('发送并分析代码').click(); await page.getByRole('alert').filter({ hasText: '拒绝访问' }).waitFor();
    await worker.evaluate(() => { globalThis.fixture.mode = 'pending'; });
    await button('发送并分析代码').click();
    await worker.evaluate(async () => { for (let i = 0; i < 100; i++) { if (globalThis.fixture.requests.length === 3) return; await new Promise((r) => setTimeout(r, 20)); } throw new Error('Request did not start'); });
    await button('取消分析').click(); await page.getByRole('alert').filter({ hasText: '已取消分析' }).waitFor();
    await worker.evaluate(async () => { for (let i = 0; i < 100; i++) { if (globalThis.fixture.aborted === 1) return; await new Promise((r) => setTimeout(r, 20)); } throw new Error('Request not aborted'); });
    await worker.evaluate(() => { globalThis.fixture.allowed = false; });
    await button('发送并分析代码').click(); await page.getByRole('alert').filter({ hasText: '站点权限已撤销' }).waitFor();
    assert.equal(await worker.evaluate(() => globalThis.fixture.requests.length), 3);
    await worker.evaluate(() => { globalThis.fixture.allowed = true; });
    await options.evaluate((config) => chrome.runtime.sendMessage({ channel: 'codevault-ai', action: 'save', config }), config);
    await button('发送并分析代码').click(); await page.getByRole('alert').filter({ hasText: 'AI 配置已变化' }).waitFor();
    assert.equal(await worker.evaluate(() => globalThis.fixture.requests.length), 3);
    await button('读取待分析代码').click(); await page.getByRole('textbox', { name: '待分析代码' }).waitFor();
    await button('发送并分析代码').click();
    await worker.evaluate(async () => { for (let i = 0; i < 100; i++) { if (globalThis.fixture.requests.length === 4) return; await new Promise((r) => setTimeout(r, 20)); } throw new Error('Request did not start'); });
    await page.evaluate(() => history.pushState({}, '', '/problemset/'));
    await page.getByText('打开一道 LeetCode 题目，即可查看题目信息。', { exact: true }).waitFor();
    assert.equal(await worker.evaluate(() => globalThis.fixture.aborted), 2);
    assert.equal(await page.getByLabel('AI 分析结果').count(), 0);
    await page.goto(problem.url); await button('展开 CodeVault').click();
    await options.getByRole('button', { name: '清除 AI 配置' }).click();
    await options.getByText('AI 配置和 API Key 已清除。', { exact: true }).waitFor();
    assert.equal((await send('status')).data, null);
    await button('读取待分析代码').click(); await page.getByRole('alert').filter({ hasText: '请先打开 AI 设置' }).waitFor();
  } finally { await context.close(); }
});
