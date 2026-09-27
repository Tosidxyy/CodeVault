import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

test('article capture preserves code and source; blank names are atomic and retryable', { timeout: 90000 }, async () => {
  const extension = resolve('dist');
  const context = await chromium.launchPersistentContext('', { channel: process.env.CODEVAULT_BROWSER_CHANNEL || 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
    const send = (message) => popup.evaluate((message) => chrome.runtime.sendMessage({ channel: 'codevault', ...message }), message);
    const problem = { id: 'leetcode:1', platform: 'leetcode', slug: 'two-sum', url: 'https://leetcode.cn/problems/two-sum/', title: '两数之和', difficulty: 'Easy', tags: [] };
    const code = 'def solve(nums):\n    # 完整缩进\n    return nums[0] < 3\n';
    const page = await context.newPage();
    await page.route('https://leetcode.*/**', (route) => new URL(route.request().url()).pathname === '/graphql/'
      ? route.fulfill({ json: { data: { question: { questionId: '1', titleSlug: 'two-sum', title: 'Two Sum', difficulty: 'Easy', topicTags: [] } } } })
      : route.fulfill({ contentType: 'text/html', body: '<article><pre id="known" style="width:600px;height:180px"><code class="language-python3"></code></pre><pre id="unknown" style="width:600px;height:180px"><code>int main() { return 0; }\n</code></pre></article>' }));
    const url = `${problem.url}solutions/123/example/`;
    await page.goto(url);
    await page.locator('#known code').evaluate((node, code) => { node.textContent = code; }, code);
    await page.locator('#known').hover();
    await page.getByRole('button', { name: '🚀 添加至 CodeVault', exact: true }).click();
    await page.getByLabel('解法名称', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('代码语言', { exact: true }).inputValue(), 'python');
    assert.equal(await page.locator('#codevault-root').locator('pre').count(), 0);
    assert.equal(await page.getByLabel('代码预览', { exact: true }).count(), 0);
    await page.getByRole('button', { name: '保存解法', exact: true }).click();
    await page.getByText('已保存：解法 1', { exact: true }).waitFor();
    const first = (await send({ action: 'solutions.list', problemId: problem.id })).data[0];
    assert.equal(first.name, '解法 1'); assert.equal(first.code, code); assert.equal(first.source, 'reference'); assert.equal(first.sourceUrl, url);
    assert.equal((await send({ action: 'problems.get', id: problem.id })).data.id, problem.id);
    assert.equal(await page.locator('#known code').textContent(), code);
    await page.getByRole('button', { name: '关闭面板' }).click();
    await page.locator('#unknown').hover();
    await page.getByRole('button', { name: '🚀 添加至 CodeVault', exact: true }).click();
    await page.getByRole('button', { name: '保存解法', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '请选择代码语言' }).waitFor();
    assert.equal((await send({ action: 'solutions.list', problemId: problem.id })).data.length, 1);
    await page.getByLabel('代码语言', { exact: true }).selectOption('cpp');
    await page.getByRole('button', { name: '保存解法', exact: true }).click();
    await page.getByText('已保存：解法 2', { exact: true }).waitFor();
    const drafts = Array.from({ length: 3 }, () => ({ id: crypto.randomUUID(), name: '', code: 'print(1)', language: 'python', source: 'own', sourceUrl: problem.url, note: '' }));
    const responses = await Promise.all(drafts.map((solution) => send({ action: 'solutions.save', problem, solution })));
    assert.ok(responses.every((response) => response.ok));
    assert.deepEqual(responses.map((response) => response.data.name).sort(), ['解法 3', '解法 4', '解法 5']);
    assert.equal((await send({ action: 'solutions.save', problem, solution: drafts[0] })).data.id, drafts[0].id);
    assert.equal((await send({ action: 'solutions.list', problemId: problem.id })).data.length, 5);
    await page.screenshot({ path: 'test-results/solution-summary-v02.png' });
    await page.getByRole('button', { name: '关闭面板' }).click();
    // Ordinary problem statement code examples are not article captures.
    await page.evaluate(() => history.pushState({}, '', '/problems/two-sum/description/'));
    await page.locator('#known').hover();
    assert.equal(await page.getByRole('button', { name: '🚀 添加至 CodeVault', exact: true }).count(), 0);
    await page.goto('https://leetcode.com/problems/two-sum/solutions/123/example/');
    await page.locator('#unknown').hover();
    await page.getByRole('button', { name: '🚀 添加至 CodeVault', exact: true }).click();
    await page.getByLabel('代码语言', { exact: true }).selectOption('cpp');
    await page.getByLabel('解法名称', { exact: true }).fill('国际站参考');
    await page.getByRole('button', { name: '保存解法', exact: true }).click();
    await page.getByText('已保存：国际站参考', { exact: true }).waitFor();
    const saved = (await send({ action: 'solutions.list', problemId: problem.id })).data.find((row) => row.name === '国际站参考');
    assert.equal(saved.source, 'reference'); assert.match(saved.sourceUrl, /^https:\/\/leetcode.com\//);
  } finally { await context.close(); }
});
