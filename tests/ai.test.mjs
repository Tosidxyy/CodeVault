import { openCurrentProblem } from './helpers.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { providers, validateConfig, validateEndpoint } from '../src/ai/types.ts';
import { analyzeCode, testConnection } from '../src/ai/provider.ts';

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
  const context = await chromium.launchPersistentContext('', { locale: 'zh-CN', channel: process.env.CODEVAULT_BROWSER_CHANNEL || 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const base = `chrome-extension://${new URL(worker.url()).host}`;
    for (let i = 0; i < 250 && !await worker.evaluate(() => !!globalThis.chrome?.permissions); i++) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(await worker.evaluate(() => !!globalThis.chrome?.permissions), true);
    // Headless test doubles for the native permission prompt and external API only.
    await worker.evaluate(() => {
      globalThis.fixture = { allowed: true, requests: [], mode: 'success', aborted: 0 };
      chrome.permissions.contains = async () => globalThis.fixture.allowed;
      globalThis.fetch = async (url, options) => {
        globalThis.fixture.requests.push({ url, body: JSON.parse(options.body), auth: options.headers.Authorization, redirect: options.redirect });
        if (globalThis.fixture.mode === 'pending') return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => { globalThis.fixture.aborted++; reject(new Error('aborted')); }));
        if (globalThis.fixture.mode === '401') return new Response('private failure', { status: 401 });
        if (JSON.parse(options.body).stream) return new Response('data: ' + JSON.stringify({ choices: [{ delta: { content: '### 思路\n哈希表\n### 复杂度\n- 时间：O(n)\n### 关键点\n逐项查找\n### 易错点\n重复元素' } }] }) + '\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
        return Response.json({ choices: [{ message: { content: 'OK' } }] });
      };
    });
    const options = await context.newPage();
    await options.goto(`${base}/options.html`);
    await options.evaluate(() => { chrome.permissions.request = async (value) => { window.requestedOrigins = value.origins; return true; }; });
    await options.getByRole('button', { name: '自定义兼容接口', exact: true }).click();
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
    await options.getByRole('heading', { name: '连接你的 AI 助手' }).scrollIntoViewIfNeeded();
    await options.screenshot({ path: resolve('test-results/ai-settings.png') });
    await options.evaluate(() => { chrome.permissions.request = async () => true; });
    await options.getByRole('button', { name: '测试连接', exact: true }).click();
    await options.getByText('✓ API连接成功。测试不会自动保存配置。', { exact: true }).waitFor();
    const testRequests = await worker.evaluate(() => globalThis.fixture.requests);
    assert.equal(testRequests.length, 1);
    assert.equal(testRequests[0].body.messages[0].content, 'Reply with OK.');
    assert.equal(testRequests[0].body.max_tokens, 32);
    await worker.evaluate(() => { globalThis.fixture.requests = []; });
    const popup = await context.newPage(); await popup.goto(`${base}/popup.html`);
    const send = (action, value) => popup.evaluate(({ action, config }) => chrome.runtime.sendMessage({ channel: 'codevault-ai', action, config }), { action, config: value });
    assert.equal((await send('save', config)).ok, false);
    assert.equal((await send('test', config)).ok, false);
    assert.equal(JSON.stringify(await send('status')).includes(config.apiKey), false);
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.monaco = { editor: { getEditors: () => [{ getDomNode: () => document.querySelector('#editor'), getRawOptions: () => ({ readOnly: false }), getModel: () => ({ getValue: () => 'print(1)', getLanguageId: () => 'python' }) }] } };
    });
    await page.route('https://leetcode.cn/**', (route) => new URL(route.request().url()).pathname === '/graphql/'
      ? route.fulfill({ json: { data: { question: { questionId: '1', titleSlug: 'two-sum', title: 'Two Sum', difficulty: 'Easy', topicTags: [] } } } })
      : route.fulfill({ contentType: 'text/html', body: '<div id="editor" class="monaco-editor" style="width:600px;height:300px">Editor</div>' }));
    await page.goto(problem.url); await openCurrentProblem(page);
    const button = (name) => page.getByRole('button', { name, exact: true });
    await button('读取待分析代码').click();
    await button('发送并分析代码').waitFor();
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
    await button('重新生成').click(); await page.getByRole('alert').filter({ hasText: '拒绝访问' }).waitFor();
    await worker.evaluate(() => { globalThis.fixture.mode = 'pending'; });
    await button('发送并分析代码').click();
    await worker.evaluate(async () => { for (let i = 0; i < 100; i++) { if (globalThis.fixture.requests.length === 3) return; await new Promise((r) => setTimeout(r, 20)); } throw new Error('Request did not start'); });
    await button('停止生成').click(); await page.getByRole('alert').filter({ hasText: '已停止生成' }).waitFor();
    await worker.evaluate(async () => { for (let i = 0; i < 100; i++) { if (globalThis.fixture.aborted === 1) return; await new Promise((r) => setTimeout(r, 20)); } throw new Error('Request not aborted'); });
    await worker.evaluate(() => { globalThis.fixture.allowed = false; });
    await button('发送并分析代码').click(); await page.getByRole('alert').filter({ hasText: '站点权限已撤销' }).waitFor();
    assert.equal(await worker.evaluate(() => globalThis.fixture.requests.length), 3);
    await worker.evaluate(() => { globalThis.fixture.allowed = true; });
    await options.evaluate((config) => chrome.runtime.sendMessage({ channel: 'codevault-ai', action: 'save', config }), config);
    await button('发送并分析代码').click(); await page.getByRole('alert').filter({ hasText: 'AI 配置已变化' }).waitFor();
    assert.equal(await worker.evaluate(() => globalThis.fixture.requests.length), 3);
    await button('读取待分析代码').click(); await button('发送并分析代码').waitFor();
    await button('发送并分析代码').click();
    await worker.evaluate(async () => { for (let i = 0; i < 100; i++) { if (globalThis.fixture.requests.length === 4) return; await new Promise((r) => setTimeout(r, 20)); } throw new Error('Request did not start'); });
    await page.evaluate(() => history.pushState({}, '', '/problemset/'));
    await page.getByText('打开一道 LeetCode 题目，即可查看题目信息。', { exact: true }).waitFor();
    await worker.evaluate(async () => { for (let i = 0; i < 100; i++) { if (globalThis.fixture.aborted === 2) return; await new Promise((r) => setTimeout(r, 20)); } throw new Error('Route change did not abort request'); });
    assert.equal(await page.getByLabel('AI 分析结果').count(), 0);
    await page.goto(problem.url); await openCurrentProblem(page);
    await options.getByRole('button', { name: '清除 AI 配置' }).click();
    await options.getByText('AI 配置和 API Key 已清除。', { exact: true }).waitFor();
    assert.equal((await send('status')).data, null);
    await button('读取待分析代码').click(); await page.getByRole('alert').filter({ hasText: '请先打开 AI 设置' }).waitFor();
    // New presets keep custom URL controls out of the ordinary flow.
    await options.getByRole('button', { name: 'OpenAI', exact: true }).click();
    assert.equal(await options.getByLabel('完整接口地址').count(), 0);
    assert.equal(await options.getByLabel('模型', { exact: true }).inputValue(), 'gpt-4.1-mini');
    await options.getByLabel('API Key', { exact: true }).fill('temporary-key');
    await options.getByRole('button', { name: 'DeepSeek', exact: true }).click();
    assert.equal(await options.getByLabel('API Key', { exact: true }).inputValue(), '');
    await options.getByLabel('API Key', { exact: true }).fill('temporary-key');
    await worker.evaluate(() => { globalThis.fixture.mode = '401'; });
    await options.getByRole('button', { name: '测试连接', exact: true }).click();
    await options.getByRole('alert').filter({ hasText: '连接失败：AI 接口拒绝访问' }).waitFor();
    assert.equal((await send('status')).data, null);
    await worker.evaluate(() => { globalThis.fixture.mode = 'success'; });
    await options.getByRole('button', { name: '测试连接', exact: true }).click();
    await options.getByText('✓ API连接成功。测试不会自动保存配置。', { exact: true }).waitFor();
    assert.equal((await send('status')).data, null);
    await options.getByRole('heading', { name: '连接你的 AI 助手' }).scrollIntoViewIfNeeded();
    await options.screenshot({ path: resolve('test-results/ai-presets.png') });
    // Seed the v0.1 record without provider and verify read-time compatibility.
    await worker.evaluate(async (legacy) => {
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('codevault-settings', 1);
        request.onsuccess = () => {
          const db = request.result, tx = db.transaction('settings', 'readwrite');
          tx.objectStore('settings').put(legacy, 'ai');
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onabort = () => reject(new Error('seed failed'));
        };
      });
    }, config);
    await options.reload();
    await options.getByText(/API Key 已保存（不回显）/).waitFor();
    assert.equal(await options.getByRole('button', { name: '自定义兼容接口', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await options.getByLabel('完整接口地址').inputValue(), config.endpoint);
    assert.equal(await options.getByLabel('模型名称').inputValue(), config.model);
    assert.equal((await send('status')).data.revision, config.revision);
    assert.equal(JSON.stringify(await send('status')).includes(config.apiKey), false);
  } finally { await context.close(); }
});

test('provider presets enforce destinations and connection probes use each native protocol', async () => {
  const original = globalThis.fetch;
  try {
    for (const [provider, preset] of Object.entries(providers)) {
      const value = { provider, endpoint: preset.endpoint, model: preset.models[0], apiKey: 'fixture-key', revision: 'fixture' };
      assert.equal(validateConfig(value).provider, provider);
      assert.throws(() => validateConfig({ ...value, endpoint: config.endpoint }));
      assert.throws(() => validateConfig({ ...value, model: 'unknown' }));
      globalThis.fetch = async (url, options) => {
        assert.equal(url, preset.endpoint);
        const body = JSON.parse(options.body);
        assert.equal(body.messages.length, 1);
        assert.deepEqual(body.messages[0], { role: 'user', content: 'Reply with OK.' });
        assert.equal(body[provider === 'openai' ? 'max_completion_tokens' : 'max_tokens'], 32);
        if (provider === 'anthropic') {
          assert.equal(options.headers['x-api-key'], value.apiKey);
          assert.equal(options.headers['anthropic-version'], '2023-06-01');
          assert.equal(options.headers.Authorization, undefined);
          return Response.json({ content: [{ type: 'text', text: 'OK' }] });
        }
        assert.equal(options.headers.Authorization, 'Bearer fixture-key');
        if (provider === 'deepseek') assert.deepEqual(body.thinking, { type: 'disabled' });
        return Response.json({ choices: [{ message: { content: 'OK' } }] });
      };
      await testConnection(value, new AbortController().signal);
    }
    assert.equal(validateConfig(config).provider, 'custom');
    assert.throws(() => validateConfig({ ...config, provider: 'other' }));
    const claude = { ...config, provider: 'anthropic' };
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.match(body.system, /算法学习助手/);
      assert.equal(JSON.parse(body.messages[0].content).code, 'print(1)');
      assert.equal(body.max_tokens, 1200);
      return Response.json({ content: [{ type: 'thinking', thinking: 'hidden' }, { type: 'text', text: 'analysis fixture-key' }] });
    };
    assert.equal(await analyzeCode(claude, problem, 'print(1)', 'python', new AbortController().signal), 'analysis [API Key 已隐藏]');
  } finally { globalThis.fetch = original; }
});
