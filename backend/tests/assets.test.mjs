import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import worker, { hashToken } from '../src/worker.ts';
import { cleanupAssets } from '../src/assets.ts';
import { assetHash, validatePng, toWireDocument, fromWireDocument, validateWireDocument } from '../../src/sync/assets.ts';
import { canonical, validateDocument } from '../../src/sync/protocol.ts';
import { database } from './helpers.mjs';

const png=new Uint8Array(await readFile(new URL('../../public/icons/icon-16.png',import.meta.url)));
const otherPng=new Uint8Array(await readFile(new URL('../../public/icons/icon-32.png',import.meta.url)));
const hash=await assetHash(png), imageId='22222222-2222-4222-8222-222222222222';
const local=()=>({problems:[{id:'leetcode:1',platform:'leetcode',slug:'two-sum',url:'https://leetcode.cn/problems/two-sum/',title:'两数之和',difficulty:'Easy',tags:[],createdAt:1,updatedAt:1}],solutions:[],notes:[{problemId:'leetcode:1',blocks:[{id:'33333333-3333-4333-8333-333333333333',type:'image',assetId:imageId}],images:{[imageId]:'data:image/png;base64,'+Buffer.from(png).toString('base64')},markdown:'',revision:1,updatedAt:1}]});
class MemoryBucket {
 objects=new Map(); puts=0; failDelete=false; beforePut=undefined; afterPut=undefined;
 async put(key,bytes,options){this.puts++;assert.equal(options.httpMetadata.contentType,'image/png');await this.beforePut?.(key);this.objects.set(key,new Uint8Array(bytes));await this.afterPut?.(key);return {key};}
 async get(key){const bytes=this.objects.get(key);return bytes?{size:bytes.length,body:new Response(bytes).body}:null;}
 async delete(key){if(this.failDelete)throw Error('fixture R2 delete failure');this.objects.delete(key);}
 async list({prefix,limit,cursor=''}){const all=[...this.objects.keys()].filter(k=>k.startsWith(prefix)&&k>cursor).sort();const keys=all.slice(0,limit);return {objects:keys.map(key=>({key})),truncated:all.length>limit,...(all.length>limit?{cursor:keys.at(-1)}:{})};}
}
async function setup(t){
 const {db,adapter}=await database();t.after(()=>db.close());const bucket=new MemoryBucket();
 const tokens={alice:'a'.repeat(64),bob:'b'.repeat(64)};
 for(const name of ['alice','bob']){
  db.prepare('INSERT INTO auth_users(id,email,created_at) VALUES(?,?,?)').run(name,name+'@example.test',Date.now());
  db.prepare('INSERT INTO sync_sessions(token_hash,user_id,expires_at,issued_at) VALUES(?,?,?,?)').run(await hashToken(tokens[name]),name,Date.now()+60000,Date.now());
 }
 const env={DB:adapter,ASSETS:bucket,ALLOWED_ORIGINS:''};
 const call=(path,method='GET',body,owner='alice',type)=>worker.fetch(new Request('https://sync.example'+path,{method,headers:{Authorization:`Bearer ${tokens[owner]??''}`,...(body?{'Content-Type':type||'application/json'}:{})},...(body?{body:type==='image/png'?new Uint8Array(body):JSON.stringify(body)}:{})}),env);
 const upload=(owner='alice',bytes=png,digest=hash)=>call('/v1/sync/assets/'+digest,'PUT',bytes,owner,'image/png');
 const commit=async(document,baseRevision=0,owner='alice',mutationId=crypto.randomUUID())=>call('/v1/sync/records','PUT',{id:'leetcode:1',baseRevision,mutationId,document},owner);
 return {db,adapter,bucket,env,tokens,call,upload,commit};
}

test('wire format extracts/deduplicates images including legacy backups and verifies exact bytes on hydration',async()=>{
 const original=local();original.notes[0].legacy={markdown:'old',images:{[imageId]:original.notes[0].images[imageId]}};
 const wire=await toWireDocument('leetcode:1',original);assert.equal(wire.assets.size,1);assert.ok(!canonical(wire.document).includes('base64'));
 const restored=await fromWireDocument('leetcode:1',wire.document,async h=>wire.assets.get(h));assert.equal(canonical(restored),canonical(validateDocument('leetcode:1',original)));
 assert.throws(()=>validateWireDocument('leetcode:1',original));
 await assert.rejects(fromWireDocument('leetcode:1',wire.document,async()=>otherPng),/integrity/);
 await assert.rejects(fromWireDocument('leetcode:1',wire.document,async()=>{throw Error('missing image');}),/missing/);
 assert.equal((await toWireDocument('leetcode:1',null)).document,null);
 validatePng(png);const corrupt=new Uint8Array(png);corrupt[corrupt.length-1]^=1;assert.throws(()=>validatePng(corrupt));
 assert.throws(()=>validatePng(new Uint8Array([...png,0])));assert.throws(()=>validatePng(new TextEncoder().encode('<svg/>')));
});

test('asset uploads authenticate, validate PNG/hash/size and isolate identical content between accounts',async t=>{
 const f=await setup(t);
 assert.equal((await f.upload('unknown')).status,401);
 assert.equal((await f.upload('alice',png,'0'.repeat(64))).status,400);
 assert.equal((await f.upload('alice',new TextEncoder().encode('<svg/>'))).status,400);
 assert.equal((await f.upload('alice',new Uint8Array(2097153))).status,413);
 assert.equal((await f.upload()).status,200);assert.equal((await f.upload()).status,200);assert.equal(f.bucket.puts,1);
 assert.equal((await f.call('/v1/sync/assets/'+hash,'GET',undefined,'bob')).status,404);
 assert.equal((await f.upload('bob')).status,200);assert.equal(f.bucket.puts,2);
 const rows=f.db.prepare('SELECT * FROM asset_objects').all();assert.notEqual(rows[0].object_key,rows[1].object_key);
 const image=await f.call('/v1/sync/assets/'+hash);assert.equal(image.headers.get('Content-Type'),'image/png');assert.equal(image.headers.get('X-Content-Type-Options'),'nosniff');assert.match(image.headers.get('Cache-Control'),/no-store/);assert.deepEqual(new Uint8Array(await image.arrayBuffer()),png);
 f.bucket.objects.delete(rows.find(r=>r.user_id==='alice').object_key);assert.equal((await f.call('/v1/sync/assets/'+hash)).status,503);
 assert.equal((await f.upload()).status,200);assert.equal((await f.call('/v1/sync/assets/'+hash)).status,200);
});

test('document references commit atomically, trash retains pictures and permanent deletion uses a grace period',async t=>{
 const f=await setup(t),wire=(await toWireDocument('leetcode:1',local())).document;
 assert.equal((await f.commit(wire)).status,409);assert.equal((await f.upload()).status,200);
 assert.equal((await f.commit(wire,0,'bob')).status,409);
 const mutation=crypto.randomUUID();
 assert.equal((await f.commit(wire,0,'alice',mutation)).status,200);assert.equal(f.db.prepare('SELECT count(*) n FROM sync_asset_refs').get().n,1);
 assert.equal((await f.commit(null,0,'alice',mutation)).status,409);assert.equal(f.db.prepare('SELECT count(*) n FROM sync_asset_refs').get().n,1);
 assert.equal((await f.commit(wire,0,'alice',mutation)).status,200);
 const listing=await (await f.call('/v1/sync/records')).json();assert.equal(listing.protocol,2);
 const restored=await fromWireDocument('leetcode:1',listing.records[0].document,async h=>new Uint8Array(await (await f.call('/v1/sync/assets/'+h)).arrayBuffer()));assert.equal(canonical(restored),canonical(validateDocument('leetcode:1',local())));
 assert.equal((await f.call('/v1/sync/assets/'+hash,'DELETE')).status,409);
 f.db.prepare('UPDATE asset_objects SET touched_at=0').run();await cleanupAssets(f.env);assert.equal(f.bucket.objects.size,1);
 const trash=structuredClone(wire);trash.problems[0].deletedAt=Date.now();trash.problems[0].trashToken=crypto.randomUUID();
 assert.equal((await f.commit(trash,1)).status,200);await cleanupAssets(f.env);assert.equal(f.bucket.objects.size,1);
 assert.equal((await f.commit(null,2)).status,200);assert.equal(f.db.prepare('SELECT count(*) n FROM sync_asset_refs').get().n,0);
 await cleanupAssets(f.env);assert.equal(f.bucket.objects.size,1);
 f.db.prepare('UPDATE asset_objects SET touched_at=0').run();await cleanupAssets(f.env);assert.equal(f.bucket.objects.size,0);
});

test('removing one problem cannot reclaim an image referenced by another problem',async t=>{
 const f=await setup(t),wire=(await toWireDocument('leetcode:1',local())).document;await f.upload();await f.commit(wire);
 const second=structuredClone(wire);second.problems[0]={...second.problems[0],id:'leetcode:2',slug:'add-two-numbers',url:'https://leetcode.cn/problems/add-two-numbers/',title:'两数相加'};second.notes[0].problemId='leetcode:2';
 assert.equal((await f.call('/v1/sync/records','PUT',{id:'leetcode:2',baseRevision:0,mutationId:crypto.randomUUID(),document:second})).status,200);
 assert.equal((await f.commit(null,1)).status,200);f.db.prepare('UPDATE asset_objects SET touched_at=0').run();await cleanupAssets(f.env);
 assert.equal(f.bucket.objects.size,1);assert.equal(f.db.prepare('SELECT count(*) n FROM sync_asset_refs').get().n,1);
});

test('orphan reconciliation is bounded, resumes its cursor and never scans outside its dedicated prefix',async t=>{
 const f=await setup(t);
 for(let i=0;i<11;i++)f.bucket.objects.set('v1/orphan/'+String(i).padStart(4,'0'),png);
 f.bucket.objects.set('unrelated-prefix/keep',png);await cleanupAssets(f.env);
 assert.equal(f.bucket.objects.size,2);f.bucket.objects.set('v1/000-late-object',png);
 await cleanupAssets(f.env);assert.equal(f.bucket.objects.size,2);
 await cleanupAssets(f.env);assert.equal(f.bucket.objects.size,1);assert.ok(f.bucket.objects.has('unrelated-prefix/keep'));
});

test('GC cannot race document reference publication and a failed reference transaction rolls all document writes back',async t=>{
 const f=await setup(t),wire=(await toWireDocument('leetcode:1',local())).document;await f.upload();
 f.adapter.beforeRun=sql=>{if(sql.startsWith('INSERT INTO sync_documents'))f.db.prepare("UPDATE asset_objects SET state='deleting'").run();};
 assert.equal((await f.commit(wire)).status,409);assert.equal(f.db.prepare('SELECT count(*) n FROM sync_documents').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM sync_asset_refs').get().n,0);
 f.adapter.beforeRun=undefined;await cleanupAssets(f.env);await f.upload();
 f.adapter.beforeRun=sql=>{if(sql.startsWith('INSERT OR IGNORE INTO sync_asset_refs'))throw Error('fixture reference failure');};
 assert.equal((await f.commit(wire)).status,503);assert.equal(f.db.prepare('SELECT count(*) n FROM sync_documents').get().n,0);
 f.adapter.beforeRun=undefined;assert.equal((await f.commit(wire)).status,200);
});

test('interrupted uploads and late object writes remain reclaimable, quota reservations bound storage',async t=>{
 const f=await setup(t);
 f.bucket.beforePut=async()=>{f.db.prepare('UPDATE asset_objects SET touched_at=0').run();await cleanupAssets(f.env);};
 assert.equal((await f.upload()).status,409);assert.equal(f.bucket.objects.size,1); // external write finished after its journal cleanup
 f.bucket.beforePut=undefined;await cleanupAssets(f.env);assert.equal(f.bucket.objects.size,0);
 f.bucket.afterPut=async()=>{throw Error('fixture interrupted acknowledgment');};assert.equal((await f.upload()).status,503);
 assert.equal(f.db.prepare('SELECT state FROM asset_objects').get().state,'deleting');f.bucket.afterPut=undefined;await cleanupAssets(f.env);assert.equal(f.bucket.objects.size,0);
 for(let i=0;i<50;i++)f.db.prepare('INSERT INTO asset_objects VALUES(?,?,?,?,?,?)').run('v1/quota/'+i,'alice',i.toString(16).padStart(64,'0'),2097152,'deleting',Date.now());
 const puts=f.bucket.puts;assert.equal((await f.upload()).status,409);assert.equal(f.bucket.puts,puts);
});

test('note byte totals count repeated image slots and sessions revoked during upload cannot publish images',async t=>{
 const f=await setup(t),wire=(await toWireDocument('leetcode:1',local())).document;await f.upload();
 f.db.prepare('UPDATE asset_objects SET byte_size=2097152').run();
 wire.notes[0].images={};wire.notes[0].blocks=[];
 for(let i=0;i<4;i++){const image=crypto.randomUUID();wire.notes[0].images[image]='codevault-asset:'+hash;wire.notes[0].blocks.push({id:crypto.randomUUID(),type:'image',assetId:image});}
 assert.equal((await f.commit(wire)).status,409);
 f.bucket.beforePut=async()=>{f.db.prepare("DELETE FROM sync_sessions WHERE user_id='bob'").run();};
 assert.equal((await f.upload('bob')).status,409);assert.equal(f.db.prepare("SELECT count(*) n FROM asset_objects WHERE user_id='bob' AND state='ready'").get().n,0);
});

test('cloud account deletion queues object cleanup durably and R2 failures preserve retries and other users',async t=>{
 const f=await setup(t);await f.upload();await f.upload('bob');const alice=f.db.prepare("SELECT object_key FROM asset_objects WHERE user_id='alice'").get().object_key;
 const deleted=await f.call('/v1/auth/account','DELETE',{confirmation:'DELETE'});assert.equal(deleted.status,200);assert.equal((await deleted.json()).attachmentCleanup,'queued');
 assert.equal((await f.call('/v1/sync/assets/'+hash)).status,401);
 f.bucket.failDelete=true;await assert.rejects(cleanupAssets(f.env));assert.ok(f.bucket.objects.has(alice));assert.equal(f.db.prepare("SELECT state FROM asset_objects WHERE object_key=?").get(alice).state,'deleting');
 f.bucket.failDelete=false;await cleanupAssets(f.env);assert.ok(!f.bucket.objects.has(alice));assert.equal((await f.call('/v1/sync/assets/'+hash,'GET',undefined,'bob')).status,200);
});
