import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import { parseBackup } from '../src/database/backupFormat.ts';

const problem = { id: 'leetcode:1', platform: 'leetcode', slug: 'two-sum', url: 'https://leetcode.cn/problems/two-sum/', title: '两数之和', difficulty: 'Easy', tags: ['数组'] };
const second = { ...problem, id: 'leetcode:2', slug: 'add-two-numbers', url: 'https://leetcode.cn/problems/add-two-numbers/', title: '两数相加' };
const id = '11111111-1111-4111-8111-111111111111';
const imageId = '22222222-2222-4222-8222-222222222222';
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';

test('trash confirms, preserves data across restart, rejects stale restores/writes, purges atomically and backs up trash', { timeout: 90000 }, async () => {
  const root = resolve('test-results'); await mkdir(root, { recursive: true });
  const profile = await mkdtemp(resolve(root, 'trash-profile-'));
  const downloads = resolve(profile, 'downloads'); await mkdir(downloads);
  const extension = resolve('dist');
  const launch = () => chromium.launchPersistentContext(profile, { locale: 'zh-CN', channel: process.env.CODEVAULT_BROWSER_CHANNEL || 'chromium', headless: true, acceptDownloads: true, downloadsPath: downloads,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  let context, worker, options, popup;
  const start = async () => {
    context = await launch(); worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    options = await context.newPage(); await options.goto(`chrome-extension://${extensionId}/options.html`);
    popup = await context.newPage(); await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  };
  const send = message => options.evaluate(data => chrome.runtime.sendMessage({ channel: 'codevault', ...data }), message);
  const getNote = async () => (await send({ action: 'notes.get', problemId: problem.id })).data;
  const getTrash = async () => (await send({ action: 'trash.list' })).data;
  const active = async () => (await send({ action: 'library.list' })).data;
  const snapshot = () => worker.evaluate(() => new Promise(resolve => { const r=indexedDB.open('codevault',5);r.onsuccess=()=>{const db=r.result,tx=db.transaction(['problems','solutions','notes']);const q=['problems','solutions','notes'].map(n=>tx.objectStore(n).getAll());tx.oncomplete=()=>{db.close();resolve(q.map(x=>x.result));};};}));
  const refresh = async () => { await popup.reload(); await popup.getByRole('heading', { name: /^我的收藏/ }).waitFor(); };
  const move = async () => {
    await popup.getByRole('button', { name: `移入回收站：${problem.title}`, exact: true }).click();
    await popup.getByRole('button', { name: '确认移入回收站', exact: true }).click();
    await popup.getByRole('status').filter({ hasText: '题目已移入回收站' }).waitFor();
  };
  const openTrash = async () => { await popup.getByRole('button', { name: '回收站（1）', exact: true }).click(); await popup.getByRole('button', { name: `恢复题目：${problem.title}` }).waitFor(); };
  const exportFile = async (readDownload = false) => {
    await options.evaluate(readDownload => {
      globalThis.originalObjectURL = URL.createObjectURL;
      URL.createObjectURL = blob => { globalThis.exportedBackupBlob = blob; return globalThis.originalObjectURL(blob); };
      globalThis.originalAnchorClick = HTMLAnchorElement.prototype.click;
      if (!readDownload) HTMLAnchorElement.prototype.click = function() { if (!this.download) globalThis.originalAnchorClick.call(this); };
    }, readDownload);
    const downloading = readDownload ? options.waitForEvent('download') : undefined;
    await options.getByRole('button', { name: '导出备份', exact: true }).click();
    await options.waitForFunction(() => !!globalThis.exportedBackupBlob);
    const content = await options.evaluate(async () => { URL.createObjectURL = globalThis.originalObjectURL; HTMLAnchorElement.prototype.click = globalThis.originalAnchorClick; return await globalThis.exportedBackupBlob.text(); });
    // The first export validates the real download. After a persistent-profile restart,
    // inspect the actual emitted Blob; Edge/Playwright may invalidate download artifacts.
    if (readDownload) assert.equal(await readFile(await (await downloading).path(), 'utf8'), content);
    return content;
  };
  try {
    await start();
    await send({ action: 'problems.save', problem }); await send({ action: 'problems.save', problem: second });
    const draft = { id, name: '保留解法', code: '  def solve():\r\n\treturn 1\r\n', language: 'python', source: 'own', sourceUrl: problem.url, note: '备注保留' };
    await send({ action: 'solutions.save', problem, solution: draft });
    await send({ action: 'solutions.analysis.save', problemId: problem.id, id, revision: 0, analysis: '### 已保存分析' });
    await send({ action: 'notes.save', problem, markdown: `# 旧笔记\n![图](codevault-image:${imageId})`, images: { [imageId]: png }, revision: 0 });
    const blocks = [{ id: crypto.randomUUID(), type: 'text', content: '最新笔记内容' }, { id: crypto.randomUUID(), type: 'image', assetId: imageId }];
    await send({ action: 'notes.saveBlocks', problem, blocks, images: { [imageId]: png }, revision: 1, sessionId: crypto.randomUUID() });
    const before = await snapshot(), oldNote = await getNote();
    await refresh();
    await popup.getByRole('button', { name: `移入回收站：${problem.title}`, exact: true }).click();
    await popup.getByRole('button', { name: '取消', exact: true }).click(); assert.deepEqual(await snapshot(), before);
    await move(); const firstToken = (await getTrash())[0].trashToken;
    assert.equal((await active()).length, 1);
    assert.deepEqual((await snapshot()).slice(1), before.slice(1));
    for (const message of [{ action: 'problems.save', problem }, { action: 'solutions.save', problem, solution: { ...draft, id: crypto.randomUUID() } },
      { action: 'notes.saveBlocks', problem, blocks, images: oldNote.images, revision: oldNote.revision, sessionId: crypto.randomUUID() },
      { action: 'solutions.analysis.save', problemId: problem.id, id, revision: 1, analysis: '不应写入' }]) {
      const reply = await send(message); assert.equal(reply.ok, false); assert.match(reply.error, /回收站/);
    }
    const backupText = await exportFile(true), backup = parseBackup(backupText);
    assert.equal(backup.version, 2); assert.equal(backup.problems.find(p=>p.id===problem.id).trashToken, firstToken);
    assert.equal(backup.notes[0].legacy.images[imageId], png);
    await context.close(); context = undefined; await start(); await openTrash();
    assert.equal((await getTrash())[0].trashToken, firstToken);
    await popup.getByRole('button', { name: `恢复题目：${problem.title}` }).click();
    await popup.getByRole('status').filter({ hasText: '题目已恢复' }).waitFor(); assert.deepEqual(await snapshot(), before);
    await popup.getByRole('button', { name: '返回收藏' }).click(); await move(); const token = (await getTrash())[0].trashToken;
    assert.notEqual(token, firstToken);
    for(const action of ['trash.restore','trash.purge']) { const reply=await send({action,id:problem.id,token:firstToken});assert.equal(reply.ok,false);assert.match(reply.error,/已变化/); }
    await openTrash();
    await worker.evaluate(() => { globalThis.oldPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='notes')throw new Error('injected');return globalThis.oldPut.apply(this,args);}; });
    const archived = await snapshot();
    await popup.getByRole('button', { name: `永久删除题目：${problem.title}` }).click();
    await popup.getByRole('button', { name: '取消', exact: true }).click(); assert.deepEqual(await snapshot(), archived);
    await popup.getByRole('button', { name: `永久删除题目：${problem.title}` }).click();
    await popup.getByRole('button', { name: '确认永久删除题目' }).click(); await popup.getByRole('alert').waitFor(); assert.deepEqual(await snapshot(), archived);
    await worker.evaluate(() => { IDBObjectStore.prototype.put=globalThis.oldPut; });
    await popup.getByRole('button', { name: '确认永久删除题目' }).click(); await popup.getByRole('status').filter({ hasText: '已永久删除' }).waitFor();
    await popup.getByText('回收站是空的。').waitFor();
    assert.equal((await send({action:'problems.get',id:problem.id})).data,null);
    assert.deepEqual((await send({action:'solutions.list',problemId:problem.id})).data,[]);
    const fence = await getNote(); assert.equal(fence.markdown,'');assert.deepEqual(fence.images,{});assert.equal(fence.legacy,undefined);assert.ok(fence.revision>oldNote.revision);
    assert.equal((await active())[0].id,second.id);
    const afterPurge = parseBackup(await exportFile());assert.equal(afterPurge.problems.length,1);assert.equal(afterPurge.notes.length,0);
    assert.equal((await send({action:'notes.saveBlocks',problem,blocks,images:oldNote.images,revision:oldNote.revision,sessionId:crypto.randomUUID()})).ok,false);
    await send({action:'problems.save',problem});
    assert.equal((await send({action:'notes.saveBlocks',problem,blocks,images:oldNote.images,revision:oldNote.revision,sessionId:crypto.randomUUID()})).ok,false);
    assert.equal((await send({action:'notes.saveBlocks',problem,blocks:[{id:crypto.randomUUID(),type:'text',content:'重新收藏后的新笔记'}],images:{},revision:fence.revision,sessionId:crypto.randomUUID()})).ok,true);
    await send({action:'problems.trash',id:problem.id});const nextToken=(await getTrash())[0].trashToken;await send({action:'trash.purge',id:problem.id,token:nextToken});
    await options.getByLabel('选择数据备份').setInputFiles({name:'with-trash.json',mimeType:'application/json',buffer:Buffer.from(backupText)});
    await options.getByRole('button',{name:'确认合并导入'}).click();await options.getByRole('status').filter({hasText:'导入完成'}).waitFor();
    assert.equal((await getTrash()).length,1);assert.equal((await getNote()).legacy.images[imageId],png);
    assert.ok((await getNote()).revision>oldNote.revision);
    await refresh();await openTrash();await popup.setViewportSize({width:520,height:600});
    await popup.getByRole('searchbox',{name:'搜索回收站'}).fill('不存在');await popup.getByText('没有匹配的回收站题目。').waitFor();
    await popup.getByRole('searchbox',{name:'搜索回收站'}).fill('保留解法');await popup.getByRole('button',{name:`恢复题目：${problem.title}`}).waitFor();
    await popup.getByRole('searchbox',{name:'搜索回收站'}).fill('');
    assert.equal(await popup.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
    await popup.screenshot({path:'test-results/trash.png'});
  } finally { await context?.close(); assert.ok(profile.startsWith(root+sep));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:250}); }
});
