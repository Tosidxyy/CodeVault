import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import backend from '../../backend/src/worker.ts';
import { database } from '../../backend/tests/helpers.mjs';

// Browser plugin not available. Real extension + real Worker handler/crypto/SQL;
// local HTTP transport bridge, mocked email/R2, no cloud or real email accounts.
test('two isolated devices sign in, bind, sync images, resolve conflicts and replay a durable outbox after restart', {timeout:150000},async t=>{
 const {db,adapter}=await database();const mail=[];const objects=new Map();const originalFetch=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');mail.push(JSON.parse(options.body));return Response.json({id:crypto.randomUUID()});};
 const env={DB:adapter,AUTH_ENABLED:'true',AUTH_SECRET:'fixture-independent-auth-secret-32-chars',RESEND_API_KEY:'fake-cloud-test-key',EMAIL_FROM:'signin@example.test',ALLOWED_ORIGINS:'',ASSETS:{async put(key,data){objects.set(key,new Uint8Array(data));return {key};},async get(key){const data=objects.get(key);return data?{body:new Response(data).body,size:data.length}:null;},async delete(key){objects.delete(key);},async list(){return {objects:[],truncated:false};}}};
 const server=createServer(async(req,res)=>{
  try{
   if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,PUT,POST,DELETE,OPTIONS'});res.end();return;}
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
   const headers=new Headers();for(const [key,value]of Object.entries(req.headers))if(value&&key!=='origin')headers.set(key,Array.isArray(value)?value.join(','):value);
   const request=new Request('https://sync.example'+req.url,{method:req.method,headers,...(body.length?{body}:{} )});const response=await backend.fetch(request,env);
   const outgoing=Object.fromEntries(response.headers);outgoing['Access-Control-Allow-Origin']='*';res.writeHead(response.status,outgoing);res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500);res.end();}
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const bridge='http://127.0.0.1:'+server.address().port;
 const root=resolve('test-results');await mkdir(root,{recursive:true});const profiles=await mkdtemp(resolve(root,'cloud-sync-'));let a,b;
 t.after(async()=>{await a?.page.screenshot({path:'test-results/cloud-a-last.png'}).catch(()=>{});await b?.page.screenshot({path:'test-results/cloud-b-last.png'}).catch(()=>{});await a?.context.close();await b?.context.close();server.closeAllConnections();await new Promise(r=>server.close(r));globalThis.fetch=originalFetch;db.close();assert.ok(profiles.startsWith(root+sep));await rm(profiles,{recursive:true,force:true,maxRetries:5,retryDelay:300});});
 const launch=async(name)=>{

  const context=await chromium.launchPersistentContext(resolve(profiles,name),{headless:true,channel:process.env.CODEVAULT_BROWSER_CHANNEL||'chromium',locale:'zh-CN',args:[`--disable-extensions-except=${resolve('dist')}`,`--load-extension=${resolve('dist')}`]});

  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
  const page=await context.newPage();await page.goto(`chrome-extension://${id}/options.html`);await page.evaluate(()=>{chrome.permissions.request=async()=>true;});
  await worker.evaluate(bridge=>{chrome.permissions.contains=async()=>true;const realFetch=globalThis.fetch;globalThis.fetch=async(url,options)=>{const parsed=new URL(url);if(parsed.origin!=='https://sync.example')throw Error('Unexpected network request');const response=await realFetch(bridge+parsed.pathname+parsed.search,options);if(globalThis.dropNextCloudAck&&options?.method==='PUT'&&parsed.pathname==='/v1/sync/records'){globalThis.dropNextCloudAck=false;await response.body?.cancel();throw Error('fixture lost acknowledgement');}return response;};},bridge);

  const call=async(action,fields={})=>{const r=await page.evaluate(data=>chrome.runtime.sendMessage({channel:'codevault-sync',...data}),{action,...fields});assert.equal(r.ok,true,r.error);return r.data;};
  const storage=async(action,fields={})=>{const r=await page.evaluate(data=>chrome.runtime.sendMessage({channel:'codevault',...data}),{action,...fields});assert.equal(r.ok,true,r.error);return r.data;};
  const sync=async()=>{const operation=await call('start');for(let tries=0;tries<500;tries++){const status=await call('status');if(!status.busy&&status.completedRun>=operation.runId)return status;await page.waitForTimeout(50);}throw Error('Sync operation timed out');};
  return {context,worker,page,call,storage,sync};
 };
 const signIn=async(device)=>{
  const p=device.page;await p.getByLabel('云同步服务地址',{exact:true}).fill('https://sync.example');await p.getByLabel('登录邮箱',{exact:true}).fill('learner@example.test');const before=mail.length;
  await p.getByRole('button',{name:'获取登录验证码',exact:true}).click();await p.getByLabel('邮箱验证码',{exact:true}).waitFor();assert.equal(mail.length,before+1);
  const code=mail.at(-1).text.match(/\b\d{6}\b/)[0];await p.getByLabel('邮箱验证码',{exact:true}).fill(code);await p.getByRole('button',{name:'登录云同步',exact:true}).click();
  await p.getByRole('button',{name:'确认绑定并启用同步',exact:true}).waitFor();assert.equal((await device.call('status')).bound,false);
  await p.getByLabel('我同意将当前知识库上传到此账号的服务，并启用自动同步。',{exact:true}).check();await p.getByRole('button',{name:'确认绑定并启用同步',exact:true}).click();
  await p.getByRole('button',{name:'立即同步',exact:true}).waitFor();await device.call('auto',{enabled:false});
 };
 const problem={id:'leetcode:1',platform:'leetcode',slug:'two-sum',url:'https://leetcode.cn/problems/two-sum/',title:'两数之和',difficulty:'Easy',tags:['数组']};
 const imageId=crypto.randomUUID(),image='data:image/png;base64,'+(await readFile('public/icons/icon-16.png')).toString('base64');
 const edit=async(device,text)=>{
  const old=await device.storage('notes.get',{problemId:problem.id});
  return device.storage('notes.saveBlocks',{problem,revision:old?.revision??0,sessionId:device.noteSession??=crypto.randomUUID(),blocks:[{id:crypto.randomUUID(),type:'text',content:text},{id:crypto.randomUUID(),type:'image',assetId:imageId}],images:{[imageId]:image}});
 };
 a=await launch('a');await a.storage('problems.save',{problem});
 await a.storage('solutions.save',{problem,solution:{id:crypto.randomUUID(),name:'哈希表',note:'先查后存',language:'python',source:'own',sourceUrl:problem.url,code:'def solve():\r\n    return "中文"\r\n'}});await edit(a,'初始笔记');
 await signIn(a);let status=await a.sync();assert.equal(status.error,'');assert.equal(objects.size,1);assert.equal(db.prepare('SELECT revision FROM sync_documents').get().revision,1);
 assert.ok(!db.prepare('SELECT document FROM sync_documents').get().document.includes('base64'));
 db.prepare("UPDATE auth_limits SET expires_at=0 WHERE key LIKE 'cooldown:%'").run();
 b=await launch('b');await signIn(b);status=await b.sync();assert.equal(status.error,'');
 let note=await b.storage('notes.get',{problemId:problem.id});assert.equal(note.blocks[0].content,'初始笔记');assert.equal(note.images[imageId],image);
 assert.equal((await b.storage('solutions.list',{problemId:problem.id}))[0].code,'def solve():\r\n    return "中文"\r\n');
 await b.sync();assert.equal(db.prepare('SELECT revision FROM sync_documents').get().revision,1); // no revision-echo loop
 // Storage failure must not advance the baseline or partially apply a download.
 await edit(a,'用于事务故障验证');await a.sync();
 await b.worker.evaluate(()=>{const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='notes'){IDBObjectStore.prototype.put=original;throw Error('fixture local write failure');}return original.apply(this,args);};});
 status=await b.sync();assert.ok(status.error);assert.equal((await b.storage('notes.get',{problemId:problem.id})).blocks[0].content,'初始笔记');
 assert.equal((await b.sync()).error,'');assert.equal((await b.storage('notes.get',{problemId:problem.id})).blocks[0].content,'用于事务故障验证');
 // Queue a local edit immediately ahead of the atomic remote-application transaction.
 await edit(a,'云端并发验证');await a.sync();
 await b.worker.evaluate(()=>{const original=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(...args){if(Array.isArray(args[0])&&args[0].includes('sync')&&args[0].includes('notes')&&args[1]==='readwrite'){
  IDBDatabase.prototype.transaction=original;const tx=original.call(this,['notes'],'readwrite'),store=tx.objectStore('notes'),read=store.get('leetcode:1');read.onsuccess=()=>store.put({...read.result,revision:read.result.revision+1,blocks:read.result.blocks.map(block=>block.type==='text'?{...block,content:'下载落地前的新编辑'}:block)});
 }return original.apply(this,args);};});
 status=await b.sync();assert.ok(status.error);assert.equal((await b.storage('notes.get',{problemId:problem.id})).blocks[0].content,'下载落地前的新编辑');
 status=await b.sync();assert.equal(status.conflicts.length,1);await b.call('resolve',{id:problem.id,revision:status.conflicts[0].revision,choice:'remote'});
 await edit(a,'设备A的新内容');await edit(b,'设备B的离线内容');assert.equal((await a.sync()).error,'');
 status=await b.sync();assert.equal(status.conflicts.length,1);await b.page.getByRole('button',{name:'采用云端版本',exact:true}).waitFor();
 await b.page.getByRole('button',{name:'采用云端版本',exact:true}).click();await b.page.waitForFunction(async()=>!(await chrome.runtime.sendMessage({channel:'codevault-sync',action:'status'})).data.conflicts.length);
 note=await b.storage('notes.get',{problemId:problem.id});assert.equal(note.blocks[0].content,'设备A的新内容');
 assert.ok(JSON.stringify(await b.call('export-conflicts')).includes('设备B的离线内容'));
 // Old-page revisions cannot overwrite a downloaded note.
 const stale=await b.page.evaluate(({problem,imageId,image})=>chrome.runtime.sendMessage({channel:'codevault',action:'notes.saveBlocks',problem,revision:1,sessionId:crypto.randomUUID(),blocks:[{id:crypto.randomUUID(),type:'text',content:'stale'}],images:{[imageId]:image}}),{problem,imageId,image});assert.equal(stale.ok,false);
 await edit(b,'网络断开后的持久内容');await b.worker.evaluate(()=>{globalThis.dropNextCloudAck=true;});status=await b.sync();assert.equal(status.pending,1);assert.ok(status.error);
 const revision=db.prepare('SELECT revision FROM sync_documents').get().revision;
 assert.equal((await b.worker.evaluate(()=>chrome.alarms.get('codevault-sync-periodic'))).periodInMinutes,5);
 await b.context.close();b=undefined;b=await launch('b');assert.equal((await b.call('status')).pending,1);assert.equal((await b.worker.evaluate(()=>chrome.alarms.get('codevault-sync-periodic'))).periodInMinutes,5);
 assert.equal((await b.sync()).error,'');assert.equal((await b.call('status')).pending,0);assert.equal(db.prepare('SELECT revision FROM sync_documents').get().revision,revision);
 await a.sync();assert.equal((await a.storage('notes.get',{problemId:problem.id})).blocks[0].content,'网络断开后的持久内容');
 const auth=await b.worker.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('codevault',6);r.onsuccess=()=>{const q=r.result.transaction('sync').objectStore('sync').get('auth');q.onsuccess=()=>resolve(q.result.value);};}));assert.ok(!JSON.stringify(await b.call('status')).includes(auth.token));
 await b.page.setViewportSize({width:360,height:760});assert.equal(await b.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await b.page.waitForFunction(()=>{const text=document.querySelector('.cloud-settings')?.textContent||'';return /待同步\s*:\s*0/.test(text)&&!text.includes('无法连接');});await b.page.getByRole('region',{name:'云同步',exact:true}).screenshot({path:'test-results/cloud-sync-mobile.png'});
 const popup=await b.context.newPage();await popup.goto(b.page.url().replace('options.html','popup.html'));assert.equal((await popup.evaluate(()=>chrome.runtime.sendMessage({channel:'codevault-sync',action:'status'}))).ok,false);await popup.close();
 await b.call('logout');assert.equal((await b.call('status')).user,undefined);assert.equal((await b.storage('notes.get',{problemId:problem.id})).blocks[0].content,'网络断开后的持久内容');
});
