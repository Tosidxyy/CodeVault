import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

test('problem panel handles metadata, SPA navigation, stale requests, failures and retry', { timeout: 60000 }, async () => {
  const extensionPath = resolve('dist');
  const context = await chromium.launchPersistentContext('', {
    channel: process.env.CODEVAULT_BROWSER_CHANNEL || 'chromium', headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  let releaseSlow;
  const slowGate = new Promise((resolveGate) => { releaseSlow = resolveGate; });
  let slowStarted;
  const slowStart = new Promise((resolveStart) => { slowStarted = resolveStart; });
  let mode = 'success';
  const requests = [];
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://leetcode.*/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname !== '/graphql/') {
        await route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<h1>LeetCode fixture</h1>' });
        return;
      }
      const { variables } = route.request().postDataJSON();
      const slug = variables.titleSlug;
      requests.push(slug);
      if (slug === 'slow-problem') { slowStarted(); await slowGate; }
      if (mode === 'http-error') { await route.fulfill({ status: 503, body: 'Unavailable' }); return; }
      const question = {
        questionId: slug === 'two-sum' ? '1' : '2',
        titleSlug: mode === 'wrong-slug' ? 'wrong' : slug,
        title: slug === 'two-sum' ? 'Two Sum' : 'Add Two Numbers',
        translatedTitle: slug === 'two-sum' ? '两数之和' : '两数相加',
        difficulty: slug === 'two-sum' ? 'Easy' : 'Medium',
        topicTags: slug === 'two-sum' ? [{ name: 'Array', translatedName: '数组' }, { name: 'Hash Table', translatedName: '哈希表' }] : [],
      };
      await route.fulfill({ json: { data: { question } } }).catch(() => {});
    });
    await page.goto('https://leetcode.cn/problemset/');
    await page.getByRole('button', { name: '展开 CodeVault' }).click();
    await page.getByText('打开一道 LeetCode 题目，即可查看题目信息。').waitFor();
    assert.equal(requests.length, 0);
    const navigate = (path) => page.evaluate((next) => history.pushState({}, '', next), path);
    await navigate('/problems/two-sum/description/?envType=study-plan');
    await page.getByRole('link', { name: '两数之和', exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: '两数之和', exact: true }).getAttribute('href'), 'https://leetcode.cn/problems/two-sum/');
    assert.equal(await page.locator('.difficulty').innerText(), '简单');
    assert.deepEqual(await page.locator('.tag').allTextContents(), ['数组', '哈希表']);
    await navigate('/problems/two-sum/solutions/123/?orderBy=hot#code');
    await delay(650);
    assert.deepEqual(requests, ['two-sum']);

    await navigate('/problems/slow-problem/');
    await slowStart;
    await page.getByRole('status').waitFor();
    assert.equal(await page.getByRole('link', { name: '两数之和', exact: true }).count(), 0);
    await navigate('/problems/add-two-numbers/');
    await page.getByRole('link', { name: '两数相加', exact: true }).waitFor();
    releaseSlow();
    await delay(650);
    assert.equal(await page.getByRole('link', { name: '两数相加', exact: true }).getAttribute('href'), 'https://leetcode.cn/problems/add-two-numbers/');
    assert.equal(await page.locator('.difficulty').innerText(), '中等');
    await page.getByText('暂无标签', { exact: true }).waitFor();

    mode = 'http-error';
    await navigate('/problems/two-sum/');
    await page.getByRole('alert').waitFor();
    assert.equal(await page.locator('.problem h3').count(), 0);
    mode = 'success';
    await page.getByRole('button', { name: '重新识别' }).click();
    await page.getByRole('link', { name: '两数之和', exact: true }).waitFor();
    mode = 'wrong-slug';
    await navigate('/problems/add-two-numbers/');
    await page.getByRole('alert').waitFor();
    assert.equal(await page.locator('.problem h3').count(), 0);
    mode = 'success';
    await page.evaluate(() => history.back());
    await page.getByRole('link', { name: '两数之和', exact: true }).waitFor();
    await navigate('/problemset/');
    await page.getByText('打开一道 LeetCode 题目，即可查看题目信息。').waitFor();
    assert.equal(await page.locator('.problem h3').count(), 0);

    await page.goto('https://leetcode.com/problems/two-sum/');
    await page.getByRole('button', { name: '展开 CodeVault' }).click();
    await page.getByRole('link', { name: 'Two Sum', exact: true }).waitFor();
    assert.deepEqual(await page.locator('.tag').allTextContents(), ['Array', 'Hash Table']);
    assert.deepEqual(errors, []);
  } finally {
    releaseSlow();
    await context.close();
  }
});
