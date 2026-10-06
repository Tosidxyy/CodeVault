import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { parseBackup, validateBackup } from '../src/database/backupFormat.ts';

const problem = { id: 'leetcode:1', platform: 'leetcode', slug: 'two-sum', url: 'https://leetcode.cn/problems/two-sum/', title: '两数之和', difficulty: 'Easy', tags: ['数组'], createdAt: 100, updatedAt: 101 };
const id = '11111111-1111-4111-8111-111111111111';
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';
const solution = { id, problemId: problem.id, name: '解法一', code: '  def solve():\n\treturn 1\n', language: 'python', source: 'template', sourceUrl: 'https://example.com/reference', note: '备注', createdAt: 100, analysis: '### 思路\n保存的分析' };
const note = { problemId: problem.id, blocks: [{ id, type: 'text', content: '笔记' }, { id: '22222222-2222-4222-8222-222222222222', type: 'image', assetId: id }], images: { [id]: png }, markdown: '旧文字', legacy: { markdown: '# 原文', images: { [id]: png } }, revision: 2, updatedAt: 102 };
const sample = () => ({ format: 'codevault-backup', version: 1, exportedAt: '2026-10-06T00:00:00.000Z', problems: [problem], solutions: [solution], notes: [note] });

test('backup format preserves code, analysis, note images/legacy and rejects unsafe or incomplete records', () => {
  const parsed = validateBackup({ ...sample(), apiKey: 'must-not-export', settings: { key: 'secret' } });
  assert.equal(JSON.stringify(parsed).includes('secret'), false);
  assert.equal(parsed.solutions[0].code, solution.code);
  assert.equal(parsed.solutions[0].analysis, solution.analysis);
  assert.deepEqual(parsed.notes[0].legacy, note.legacy);
  assert.deepEqual(parseBackup(JSON.stringify(parsed)), parsed);
  for (const patch of [{ version: 2 }, { problems: [problem, problem] }, { problems: [] }, { notes: [{ ...note, images: {} }] },
    { solutions: [{ ...solution, sourceUrl: 'javascript:alert(1)' }] }, { solutions: [{ ...solution, revision: Number.MAX_SAFE_INTEGER }] },
    { notes: [{ ...note, legacy: { markdown: 'x', images: { [id]: 'https://evil.com/img.png' } } }] }]) assert.throws(() => validateBackup({ ...sample(), ...patch }));
  assert.throws(() => parseBackup('{broken'));
});

test('settings backup downloads, previews/cancels, restores atomically, keeps conflicts and excludes AI credentials', { timeout: 90000 }, async () => {
  const extension = resolve('dist');
  const context = await chromium.launchPersistentContext('', { channel: process.env.CODEVAULT_BROWSER_CHANNEL || 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const options = await context.newPage(); await options.goto(`chrome-extension://${new URL(worker.url()).host}/options.html`);
    const send = (message) => options.evaluate(data => chrome.runtime.sendMessage({ channel: 'codevault', ...data }), message);
    assert.equal((await send({ action: 'problems.save', problem })).ok, true);
    assert.equal((await send({ action: 'solutions.save', problem, solution: { ...solution, source: 'own', sourceUrl: problem.url } })).ok, true);
    assert.equal((await send({ action: 'solutions.analysis.save', problemId: problem.id, id, revision: 0, analysis: solution.analysis })).ok, true);
    assert.equal((await send({ action: 'notes.saveBlocks', problem, blocks: note.blocks, images: note.images, revision: 0, sessionId: crypto.randomUUID() })).ok, true);
    await worker.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open('codevault-settings', 1);
      request.onsuccess = () => { const db = request.result, tx = db.transaction('settings', 'readwrite'); tx.objectStore('settings').put({ apiKey: 'private-test-key', endpoint: 'https://example.com/v1/chat/completions', model: 'fixture', revision: 'fixture' }, 'ai'); tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error); };
    }));
    const section = options.getByRole('region', { name: '数据备份', exact: true });
    const downloadEvent = options.waitForEvent('download'); await section.getByRole('button', { name: '导出备份', exact: true }).click();
    const download = await downloadEvent, file = await download.path(), text = await readFile(file, 'utf8'), exported = parseBackup(text);
    assert.equal(text.includes('private-test-key'), false); assert.equal(exported.problems.length, 1);
    assert.equal(exported.solutions[0].code, solution.code); assert.equal(exported.solutions[0].analysis, solution.analysis); assert.equal(exported.notes[0].images[id], png);
    const snapshot = () => worker.evaluate(() => new Promise(resolve => { const r = indexedDB.open('codevault', 5); r.onsuccess = () => { const db=r.result, tx=db.transaction(['problems','solutions','notes']); const q=['problems','solutions','notes'].map(n=>tx.objectStore(n).getAll()); tx.oncomplete=()=>{ db.close(); resolve(q.map(x=>x.result)); }; }; }));
    const clear = () => worker.evaluate(() => new Promise(resolve => { const r=indexedDB.open('codevault',5);r.onsuccess=()=>{const db=r.result,tx=db.transaction(['problems','solutions','notes'],'readwrite');for(const n of ['problems','solutions','notes'])tx.objectStore(n).clear();tx.oncomplete=()=>{db.close();resolve();};};}));
    const choose = (content) => options.getByLabel('选择数据备份').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(content) });
    await clear(); await choose(text); await section.getByRole('group', { name: '导入确认' }).waitFor();
    await section.getByRole('button', { name: '取消导入' }).click(); assert.deepEqual(await snapshot(), [[], [], []]);
    await choose(text);
    await section.getByRole('button', { name: '确认合并导入' }).click(); await section.getByRole('status').filter({ hasText: '导入完成' }).waitFor();
    const restored = await snapshot(); assert.deepEqual(restored, [exported.problems, exported.solutions, exported.notes]);
    await choose(text); await section.getByRole('button', { name: '确认合并导入' }).click(); await section.getByRole('status').filter({ hasText: '跳过 3 条' }).waitFor();
    assert.deepEqual(await snapshot(), restored);
    const conflict = structuredClone(exported); conflict.solutions[0].code = 'old backup';
    await choose(JSON.stringify(conflict)); await section.getByRole('button', { name: '确认合并导入' }).click(); await section.getByRole('status').filter({ hasText: '跳过 3 条' }).waitFor(); assert.deepEqual(await snapshot(), restored);
    await choose(JSON.stringify({ ...exported, notes: [{ ...exported.notes[0], images: {} }] })); await section.getByRole('alert').waitFor(); assert.deepEqual(await snapshot(), restored);
    await clear(); await choose(text);
    await options.evaluate(() => { globalThis.originalAdd = IDBObjectStore.prototype.add; IDBObjectStore.prototype.add = function(...args) { if(this.name==='notes') throw new Error('injected'); return globalThis.originalAdd.apply(this,args); }; });
    await section.getByRole('button', { name: '确认合并导入' }).click(); await section.getByRole('alert').filter({ hasText: '已回滚' }).waitFor(); assert.deepEqual(await snapshot(), [[], [], []]);
    await options.evaluate(() => { IDBObjectStore.prototype.add = globalThis.originalAdd; });
    await section.getByRole('button', { name: '确认合并导入' }).click(); await section.getByRole('status').filter({ hasText: '导入完成' }).waitFor();
    assert.deepEqual(await snapshot(), restored);
    await options.reload(); await section.getByRole('button', { name: '导出备份', exact: true }).waitFor();
    assert.deepEqual(await snapshot(), restored);
    await options.setViewportSize({ width: 360, height: 640 }); await section.scrollIntoViewIfNeeded();
    assert.equal(await options.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await mkdir('test-results', { recursive: true }); await options.screenshot({ path: 'test-results/data-backup.png' });
    const config = await options.evaluate(async () => (await chrome.runtime.sendMessage({ channel: 'codevault-ai', action: 'status' })).data);
    assert.equal(config.model, 'fixture');
  } finally { await context.close(); }
});
