import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, appendFile, mkdir, mkdtemp, cp, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { chromium } from 'playwright';

const resultRoot = resolve('test-results');
const baselineZip = resolve(process.env.CODEVAULT_BASELINE_ZIP || 'releases/CodeVault-v0.2.0.zip');
const probe = `\nchrome.runtime.onInstalled.addListener(details => {
  void chrome.storage.local.set({ _codevaultUpgradeTest: { reason: details.reason, previousVersion: details.previousVersion ?? null, version: chrome.runtime.getManifest().version } });
});\n`;
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';

test('published v0.2.0 upgrades in place with identical ID, preserved data/config and offline restart', { timeout: 120000 }, async () => {
  assert.equal(process.platform, 'win32', 'This upgrade verifier uses Windows PowerShell to extract the published ZIP.');
  let bytes;
  try { bytes = await readFile(baselineZip); } catch { throw new Error('Missing baseline ZIP. Set CODEVAULT_BASELINE_ZIP to the saved v0.2.0 release package.'); }
  const baselineHash = createHash('sha256').update(bytes).digest('hex');
  await mkdir(resultRoot, { recursive: true });
  const workspace = await mkdtemp(resolve(resultRoot, 'upgrade-'));
  const extension = resolve(workspace, 'extension'), profile = resolve(workspace, 'profile');
  const safeRemove = async target => {
    const full = resolve(target);
    assert.ok(full.startsWith(resultRoot + sep) && (full === workspace || full.startsWith(workspace + sep)), 'Cleanup must remain within the isolated test workspace');
    await rm(full, { recursive: true, force: true });
  };
  let context;
  const launch = () => chromium.launchPersistentContext(profile, { locale: 'zh-CN', channel: process.env.CODEVAULT_BROWSER_CHANNEL || 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const workerFor = async () => context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const snapshot = worker => worker.evaluate(async () => {
    const read = name => new Promise((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, names = Array.from(db.objectStoreNames), tx = db.transaction(names, 'readonly');
        const queries = names.map(n => tx.objectStore(n).getAll());
        tx.oncomplete = () => { const value = { version: db.version, stores: Object.fromEntries(names.map((n, i) => [n, queries[i].result])) }; db.close(); resolve(value); };
        tx.onabort = () => reject(tx.error);
      };
    });
    return { library: await read('codevault'), settings: await read('codevault-settings') };
  });
  try {
    // Validate all archive target paths and total size before extracting.
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `
      $ErrorActionPreference = 'Stop'
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      $zip = [System.IO.Compression.ZipFile]::OpenRead($env:CODEVAULT_UPGRADE_ZIP)
      try {
        $root = [System.IO.Path]::GetFullPath($env:CODEVAULT_UPGRADE_DIR) + [System.IO.Path]::DirectorySeparatorChar
        $total = 0
        foreach ($entry in $zip.Entries) {
          $target = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($root, $entry.FullName))
          if (-not $target.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe ZIP path' }
          $total += $entry.Length
        }
        if ($total -gt 67108864) { throw 'Baseline ZIP exceeds extraction limit' }
      } finally { $zip.Dispose() }
      [System.IO.Compression.ZipFile]::ExtractToDirectory($env:CODEVAULT_UPGRADE_ZIP, $env:CODEVAULT_UPGRADE_DIR)
    `], { env: { ...process.env, CODEVAULT_UPGRADE_ZIP: baselineZip, CODEVAULT_UPGRADE_DIR: extension }, stdio: 'pipe' });
    const oldManifest = JSON.parse(await readFile(resolve(extension, 'manifest.json'), 'utf8'));
    assert.equal(oldManifest.version, '0.2.0');
    await appendFile(resolve(extension, oldManifest.background.service_worker), probe);
    context = await launch();
    let worker = await workerFor();
    const extensionId = new URL(worker.url()).host;
    const options = await context.newPage(); await options.goto(`chrome-extension://${extensionId}/options.html`);
    const send = async message => {
      const response = await options.evaluate(data => chrome.runtime.sendMessage({ channel: 'codevault', ...data }), message);
      assert.equal(response.ok, true, response.error); return response.data;
    };
    await options.waitForFunction(async () => (await chrome.storage.local.get('_codevaultUpgradeTest'))._codevaultUpgradeTest?.reason === 'install');
    const problem = { id: 'leetcode:1', platform: 'leetcode', slug: 'two-sum', url: 'https://leetcode.cn/problems/two-sum/', title: '两数之和 / 原版收藏', difficulty: 'Easy', tags: ['数组', '哈希表'] };
    const second = { ...problem, id: 'leetcode:46', slug: 'permutations', url: 'https://leetcode.cn/problems/permutations/', title: '全排列', difficulty: 'Medium', tags: ['回溯'] };
    await send({ action: 'problems.save', problem }); await send({ action: 'problems.save', problem: second });
    await send({ action: 'problems.visit', id: problem.id });
    const code = Array.from({ length: 300 }, (_, i) => `  value_${i} = "中文-${i}"\t# retained`).join('\r\n') + '\r\n';
    const solutionId = '11111111-1111-4111-8111-111111111111';
    await send({ action: 'solutions.save', problem, solution: { id: solutionId, name: '原版解法', code, language: 'python', source: 'own', sourceUrl: problem.url, note: '原版备注\n不丢失换行' } });
    await send({ action: 'solutions.analysis.save', problemId: problem.id, id: solutionId, revision: 0, analysis: '### 思路\n原版已保存分析\n\n- 时间 O(n)' });
    await send({ action: 'solutions.save', problem: second, solution: { id: crypto.randomUUID(), name: '参考解法', code: 'def permute(nums):\n    return []', language: 'python', source: 'reference', sourceUrl: second.url + 'solutions/example/', note: '来源保留' } });
    const imageId = '22222222-2222-4222-8222-222222222222';
    await send({ action: 'notes.save', problem, markdown: `# 旧原文\n\n![原图](codevault-image:${imageId})`, images: { [imageId]: png }, revision: 0 });
    await send({ action: 'notes.saveBlocks', problem, blocks: [{ id: crypto.randomUUID(), type: 'text', content: '当前笔记\n思路和易错点' }, { id: crypto.randomUUID(), type: 'image', assetId: imageId }], images: { [imageId]: png }, revision: 1, sessionId: crypto.randomUUID() });
    // Permission is mocked only to save a fictitious key; no AI network request is made.
    await worker.evaluate(() => { chrome.permissions.contains = async () => true; });
    const configResponse = await options.evaluate(() => chrome.runtime.sendMessage({ channel: 'codevault-ai', action: 'save', config: { provider: 'custom', endpoint: 'https://api.example.com/v1/chat/completions', model: 'fixture-model', apiKey: 'upgrade-fixture-key-not-real' } }));
    assert.equal(configResponse.ok, true, configResponse.error);
    const before = await snapshot(worker);
    assert.equal(before.library.version, 5); assert.equal(before.settings.version, 1);
    assert.equal(before.library.stores.solutions.find(s => s.id === solutionId).code, code);
    assert.equal(before.library.stores.notes[0].legacy.images[imageId], png);
    assert.equal(before.settings.stores.settings[0].apiKey, 'upgrade-fixture-key-not-real');
    // Replace the entire package at exactly the same path; preserve the browser profile.
    await safeRemove(extension); await cp(resolve('dist'), extension, { recursive: true });
    const newManifest = JSON.parse(await readFile(resolve(extension, 'manifest.json'), 'utf8'));
    assert.equal(newManifest.manifest_version, oldManifest.manifest_version);
    assert.equal(newManifest.key, oldManifest.key);
    assert.deepEqual(newManifest.permissions, oldManifest.permissions);
    assert.deepEqual(newManifest.host_permissions, oldManifest.host_permissions);
    assert.deepEqual(newManifest.optional_host_permissions, oldManifest.optional_host_permissions);
    const oldNumbers = oldManifest.version.split('.').map(Number);
    const currentNumbers = newManifest.version.split('.').map(Number);
    const firstDifference = currentNumbers.findIndex((value, index) => value !== (oldNumbers[index] ?? 0));
    if (firstDifference < 0 || currentNumbers[firstDifference] < (oldNumbers[firstDifference] ?? 0)) {
      oldNumbers[oldNumbers.length - 1]++;
      newManifest.version = oldNumbers.join('.'); // fallback for a build not newer than the baseline
    }
    await writeFile(resolve(extension, 'manifest.json'), JSON.stringify(newManifest));
    await appendFile(resolve(extension, newManifest.background.service_worker), probe);
    const restartedWorker = context.waitForEvent('serviceworker', { predicate: candidate => candidate !== worker && new URL(candidate.url()).host === extensionId });
    await options.evaluate(() => { window.setTimeout(() => chrome.runtime.reload(), 0); });
    worker = await restartedWorker;
    assert.equal(new URL(worker.url()).host, extensionId);
    const updated = await context.newPage(); await updated.goto(`chrome-extension://${extensionId}/options.html`);
    await updated.waitForFunction(async () => (await chrome.storage.local.get('_codevaultUpgradeTest'))._codevaultUpgradeTest?.version === chrome.runtime.getManifest().version);
    const event = await updated.evaluate(async () => (await chrome.storage.local.get('_codevaultUpgradeTest'))._codevaultUpgradeTest);
    assert.deepEqual(event, { reason: 'update', previousVersion: '0.2.0', version: newManifest.version });
    assert.deepEqual(await snapshot(worker), before);
    await updated.getByText(/API Key 已保存（不回显）/).waitFor();
    assert.equal(await updated.getByLabel('API Key', { exact: true }).inputValue(), '');
    const backupSection = updated.getByRole('region', { name: '数据备份' });
    const downloading = updated.waitForEvent('download'); await backupSection.getByRole('button', { name: '导出备份', exact: true }).click();
    const backupFile = await (await downloading).path(), exportedText = await readFile(backupFile, 'utf8'), exported = JSON.parse(exportedText);
    assert.equal(exportedText.includes('upgrade-fixture-key-not-real'), false);
    assert.equal(exported.problems.length, 2); assert.equal(exported.solutions.length, 2);
    assert.equal(exported.solutions.find(s => s.id === solutionId).code, code);
    assert.equal(exported.notes[0].images[imageId], png); assert.equal(exported.notes[0].legacy.images[imageId], png);
    await context.close(); context = undefined;

    context = await launch(); await context.setOffline(true); worker = await workerFor();
    assert.equal(new URL(worker.url()).host, extensionId);
    const popup = await context.newPage(); await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.getByRole('link', { name: problem.title, exact: true }).waitFor(); await popup.getByRole('link', { name: second.title, exact: true }).waitFor();
    assert.deepEqual(await snapshot(worker), before);
    await writeFile(resolve(resultRoot, 'upgrade-preservation.json'), JSON.stringify({ baselineVersion: oldManifest.version, targetVersion: newManifest.version, baselineSHA256: baselineHash,
      extensionId, browser: process.env.CODEVAULT_BROWSER_CHANNEL || 'chromium', updateEvent: event, sameProfile: true, identicalDataAfterUpdate: true, identicalDataAfterOfflineRestart: true,
      counts: { problems: 2, solutions: 2, notes: 1 }, preserved: ['metadata/timestamps', 'exact code/language/source/remarks', 'analysis', 'note blocks/images/legacy', 'AI endpoint/model/key/revision'],
      scope: 'Local unpacked extension update; not a signed Chrome Web Store distribution test. No real AI requests.' }, null, 2));
  } finally {
    await context?.close(); await safeRemove(workspace);
  }
});
