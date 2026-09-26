import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, access, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const extensionPath = resolve('dist');

test('manifest references packaged extension entries', async () => {
  const manifest = JSON.parse(await readFile(resolve(extensionPath, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.type, 'module');
  assert.deepEqual(manifest.content_scripts[0].matches, ['https://leetcode.com/*', 'https://leetcode.cn/*']);
  assert.equal(manifest.content_scripts[1].world, 'MAIN');
  for (const entry of [manifest.action.default_popup, manifest.options_page, manifest.background.service_worker, ...manifest.content_scripts.flatMap((script) => script.js)]) {
    await access(resolve(extensionPath, entry));
  }
});

test('extension loads; popup renders; panel opens without changing host styles', async () => {
  const context = await chromium.launchPersistentContext('', {
    channel: process.env.CODEVAULT_BROWSER_CHANNEL || 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    const errors = [];
    const popup = await context.newPage();
    popup.on('pageerror', (error) => errors.push(error.message));
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.getByRole('heading', { name: '🚀 CodeVault' }).waitFor();
    assert.equal(await popup.getByRole('link', { name: '打开 LeetCode' }).getAttribute('href'), 'https://leetcode.cn/problemset/');
    assert.equal(await popup.locator('main').evaluate((element) => getComputedStyle(element).width), '360px');

    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://leetcode.cn/**', (route) => route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<html><head><style>button{background:rgb(255,0,0);font-size:30px}body{margin:8px}</style></head><body><h1>Host page fixture</h1><button id="host-button">宿主按钮</button></body></html>',
    }));
    await page.goto('https://leetcode.cn/problems/two-sum/');
    const launcher = page.getByRole('button', { name: '展开 CodeVault' });
    await launcher.waitFor();
    assert.equal(await page.locator('#codevault-root').count(), 1);
    await launcher.click();
    await page.getByRole('region', { name: 'CodeVault 面板' }).waitFor();
    assert.equal(await page.locator('#host-button').evaluate((element) => getComputedStyle(element).backgroundColor), 'rgb(255, 0, 0)');
    assert.equal(await page.locator('.launcher').evaluate((element) => getComputedStyle(element).fontSize), '22px');
    await mkdir('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/panel.png' });
    await popup.screenshot({ path: 'test-results/popup.png' });
    await page.getByRole('button', { name: '关闭面板' }).click();
    assert.equal(await page.getByRole('region', { name: 'CodeVault 面板' }).count(), 0);
    await launcher.click();
    await page.getByRole('button', { name: '收起 CodeVault' }).press('Escape');
    assert.equal(await launcher.getAttribute('aria-expanded'), 'false');
    await page.setViewportSize({ width: 320, height: 568 });
    await launcher.click();
    const panelBox = await page.getByRole('region', { name: 'CodeVault 面板' }).boundingBox();
    assert.ok(panelBox.x >= 0 && panelBox.x + panelBox.width <= 320);
    await popup.goto(`chrome-extension://${extensionId}/options.html`);
    await popup.getByText('CodeVault v0.1.0', { exact: false }).waitFor();
    await page.route('https://leetcode.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<h1>International site fixture</h1>' }));
    await page.goto('https://leetcode.com/problems/two-sum/');
    await page.getByRole('button', { name: '展开 CodeVault' }).waitFor();
    await page.route('https://example.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<h1>Unrelated site</h1>' }));
    await page.goto('https://example.com/');
    assert.equal(await page.locator('#codevault-root').count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
