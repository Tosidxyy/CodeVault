import assert from 'node:assert/strict';
import { openCurrentProblem } from '../tests/helpers.mjs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

// Optional network-dependent smoke check against real public problem pages.
const sites = [['leetcode.cn', '两数之和'], ['leetcode.com', 'Two Sum']].filter(([host]) => !process.env.CODEVAULT_LIVE_HOST || host === process.env.CODEVAULT_LIVE_HOST);
if (!sites.length) throw new Error('CODEVAULT_LIVE_HOST must be leetcode.cn or leetcode.com');
const extensionPath = resolve('dist');
const context = await chromium.launchPersistentContext('', {
  channel: process.env.CODEVAULT_BROWSER_CHANNEL || 'chromium', headless: true,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});
try {
  await mkdir('test-results', { recursive: true });
  for (const [host, title] of sites) {
    const page = await context.newPage();
    const isMetadataRequest = (request) => request.postData()?.includes('CodeVaultProblem');
    page.on('response', (response) => {
      if (isMetadataRequest(response.request())) console.log(`${host}: metadata HTTP ${response.status()}`);
    });
    page.on('requestfailed', (request) => {
      if (isMetadataRequest(request)) console.log(`${host}: metadata request failed: ${request.failure()?.errorText}`);
    });
    await page.goto(`https://${host}/problems/two-sum/description/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await openCurrentProblem(page);
    const panel = page.locator('#codevault-root');
    try {
      await panel.getByRole('link', { name: title, exact: true }).waitFor({ timeout: 15000 });
      assert.equal(await panel.locator('.problem .difficulty').innerText(), '简单');
      assert.ok(await panel.locator('.tag').count() >= 2);
      console.log(`${host}: title, canonical URL, difficulty and tags loaded`);
      assert.equal(await panel.getByRole('link', { name: title, exact: true }).getAttribute('href'), `https://${host}/problems/two-sum/`);
      await panel.getByRole('button', { name: /^(收藏题目|更新收藏)$/ }).click();
      await panel.getByText('已收藏 · 保存在本机', { exact: true }).waitFor();
      console.log(`${host}: bookmark committed to extension IndexedDB`);
      await page.waitForFunction(() => window.monaco?.editor?.getEditors?.().some((editor) => !editor.getRawOptions().readOnly && editor.getModel()?.getLanguageId() !== 'plaintext' && editor.getModel()?.getValue().trim()), undefined, { timeout: 45000 });
      await panel.getByRole('button', { name: '读取当前代码', exact: true }).click();
      await panel.getByLabel('代码预览', { exact: true }).waitFor();
      const captured = await panel.getByLabel('代码预览', { exact: true }).inputValue();
      assert.ok(captured.trim().length > 0);
      await panel.getByLabel('解法名称', { exact: true }).fill(`实测 ${host}`);
      await panel.getByRole('button', { name: '保存解法', exact: true }).click();
      await panel.getByText(`已保存：实测 ${host}`, { exact: true }).waitFor();
      console.log(`${host}: editor snapshot saved (${captured.length} characters)`);
      const unsaved = await page.evaluate(() => {
        const editor = window.monaco.editor.getEditors().find((e) => !e.getRawOptions().readOnly && e.getModel()?.getLanguageId() !== 'plaintext' && e.getDomNode()?.getBoundingClientRect().width > 0);
        window.codevaultTestEditor = editor;
        const text = '// CodeVault unsaved test draft\n' + editor.getModel().getValue();
        editor.pushUndoStop();
        editor.executeEdits('codevault.test.setup', [{ range: editor.getModel().getFullModelRange(), text }]);
        editor.pushUndoStop();
        return editor.getModel().getValue();
      });
      const details = panel.locator('details').filter({ hasText: `实测 ${host}` });
      await details.locator('summary').click();
      await details.getByRole('button', { name: '加载到编辑器', exact: true }).click();
      await panel.getByText(`已加载：实测 ${host}。可在编辑器按 Ctrl+Z 撤销。`, { exact: true }).waitFor();
      assert.equal((await page.evaluate(() => window.codevaultTestEditor.getModel().getValue())).replaceAll('\r\n', '\n'), captured);
      await page.evaluate(() => window.codevaultTestEditor.focus());
      await page.keyboard.press('Control+z');
      await page.waitForFunction((text) => window.codevaultTestEditor.getModel().getValue() === text, unsaved);
      console.log(`${host}: saved solution loaded and Ctrl+Z restored unsaved draft`);
    } finally {
      await page.screenshot({ path: `test-results/live-${host}.png` });
    }
    await page.close();
  }
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
  await popup.getByRole('heading', { name: '我的收藏（1）', exact: true }).waitFor();
  await popup.getByRole('link', { name: sites.at(-1)[1], exact: true }).waitFor();
  console.log('Popup displays saved problem metadata');
  const solutions = await popup.evaluate(() => chrome.runtime.sendMessage({ channel: 'codevault', action: 'solutions.list', problemId: 'leetcode:1' }));
  assert.equal(solutions.data.length, sites.length);
} finally {
  await context.close();
}
