import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

// Optional network-dependent smoke check against real public problem pages.
const extensionPath = resolve('dist');
const context = await chromium.launchPersistentContext('', {
  channel: process.env.CODEVAULT_BROWSER_CHANNEL || 'chromium', headless: true,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});
try {
  await mkdir('test-results', { recursive: true });
  for (const [host, title] of [['leetcode.cn', '两数之和'], ['leetcode.com', 'Two Sum']]) {
    const page = await context.newPage();
    const isMetadataRequest = (request) => request.postData()?.includes('CodeVaultProblem');
    page.on('response', (response) => {
      if (isMetadataRequest(response.request())) console.log(`${host}: metadata HTTP ${response.status()}`);
    });
    page.on('requestfailed', (request) => {
      if (isMetadataRequest(request)) console.log(`${host}: metadata request failed: ${request.failure()?.errorText}`);
    });
    await page.goto(`https://${host}/problems/two-sum/description/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.getByRole('button', { name: '展开 CodeVault' }).click();
    const panel = page.locator('#codevault-root');
    try {
      await panel.getByRole('link', { name: title, exact: true }).waitFor({ timeout: 15000 });
      assert.equal(await panel.locator('.difficulty').innerText(), '简单');
      assert.ok(await panel.locator('.tag').count() >= 2);
      console.log(`${host}: title, canonical URL, difficulty and tags loaded`);
      assert.equal(await panel.getByRole('link', { name: title, exact: true }).getAttribute('href'), `https://${host}/problems/two-sum/`);
    } finally {
      await page.screenshot({ path: `test-results/live-${host}.png` });
    }
    await page.close();
  }
} finally {
  await context.close();
}
