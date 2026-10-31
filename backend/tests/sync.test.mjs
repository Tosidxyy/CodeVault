import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import worker, { hashToken } from '../src/worker.ts';
import { canonical, validateDocument, planSync } from '../../src/sync/protocol.ts';

const id='leetcode:1';
const document=(title='两数之和')=>({problems:[{id,platform:'leetcode',slug:'two-sum',url:'https://leetcode.cn/problems/two-sum/',title,difficulty:'Easy',tags:['数组'],createdAt:1,updatedAt:1,favoriteAt:1,lastOpenedAt:null}],solutions:[],notes:[]});
const cloud=(doc,revision=1)=>({id,revision,document:doc});
const plan=(base,local,remote)=>planSync('alice',{accountId:'alice',records:base},new Map(local),remote);

test('sync three-way merge preserves first-login collisions, offline edits, deletions and both conflict versions',()=>{
 const a=document(), b=document('本地编辑'), c=document('远端编辑');
 assert.equal(plan([],[[id,a]],[]).uploads[0].baseRevision,0);
 assert.deepEqual(plan([],[],[cloud(a)]).downloads,[cloud(a)]);
 assert.equal(plan([],[[id,a]],[cloud(b)]).conflicts.length,1);
 assert.deepEqual(plan([cloud(a)],[[id,b]],[cloud(a)]).uploads,[{id,baseRevision:1,document:b}]);
 assert.deepEqual(plan([cloud(a)],[[id,a]],[cloud(b,2)]).downloads,[cloud(b,2)]);
 const collision=plan([cloud(a)],[[id,b]],[cloud(c,2)]).conflicts[0];assert.deepEqual(collision.local,b);assert.deepEqual(collision.remote,cloud(c,2));
 assert.deepEqual(plan([cloud(a)],[[id,null]],[cloud(a)]).uploads,[{id,baseRevision:1,document:null}]);
 assert.equal(plan([cloud(a)],[[id,b]],[cloud(null,2)]).conflicts.length,1);
 assert.equal(plan([cloud(a)],[[id,null]],[cloud(b,2)]).conflicts.length,1);
 assert.equal(plan([cloud(a)],[[id,a]],[cloud(null,2)]).downloads[0].document,null);
 assert.deepEqual(plan([cloud(a)],[[id,b]],[cloud(b,2)]),{uploads:[],downloads:[],conflicts:[]});
 assert.throws(()=>planSync('bob',{accountId:'alice',records:[]},new Map(),[]),/account/);
 assert.throws(()=>plan([cloud(a)],[],[cloud(a)]),/incomplete/);
 assert.throws(()=>plan([cloud(a)],[[id,a]],[]),/incomplete/);
 assert.throws(()=>plan([cloud(a,3)],[[id,a]],[cloud(b,2)]),/history/);
 assert.throws(()=>plan([cloud(a)],[[id,a]],[cloud(b)]),/history/);
 assert.throws(()=>plan([],[],[cloud(a),cloud(a)]),/duplicate/);
});

test('sync validation retains original code/images and strips settings, keys and arbitrary fields',()=>{
 const raw=document();raw.apiKey='never-sync-me';raw.problems[0].apiKey='never-sync-me';
 raw.solutions=[{id:'11111111-1111-4111-8111-111111111111',problemId:id,name:'解法',note:'原文',code:'def solve():\r\n    return "中文"\r\n',language:'python',source:'own',sourceUrl:raw.problems[0].url,createdAt:1,revision:0,updatedAt:1}];
 const imageId='22222222-2222-4222-8222-222222222222';const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';
 raw.notes=[{problemId:id,blocks:[{id:'33333333-3333-4333-8333-333333333333',type:'image',assetId:imageId}],images:{[imageId]:png},markdown:'',revision:1,updatedAt:1}];
 const clean=validateDocument(id,raw);assert.equal(clean.solutions[0].code,raw.solutions[0].code);assert.equal(clean.notes[0].images[imageId],png);assert.ok(!JSON.stringify(clean).includes('never-sync-me'));
 assert.equal(canonical({a:1,b:2}),canonical({b:2,a:1}));
 assert.throws(()=>validateDocument('leetcode:2',raw));assert.throws(()=>validateDocument(id,{...raw,problems:[]}));
 assert.throws(()=>validateDocument(id,{...raw,notes:[{...raw.notes[0],problemId:'leetcode:2'}]}));
});

test('sync Worker uses session owners, atomic CAS, exact retries, persistent tombstones and bounded requests',async()=>{
 const db=new DatabaseSync(':memory:');db.exec(await readFile(new URL('../migrations/0001_sync.sql',import.meta.url),'utf8'));
 const adapter={prepare(sql){let args=[];const statement={bind(...values){args=values;return statement;},async first(){return db.prepare(sql).get(...args)??null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};return statement;}};
 const alice='a'.repeat(64),bob='b'.repeat(64),expired='c'.repeat(64);
 for(const [token,user,expires] of [[alice,'alice',Date.now()+60000],[bob,'bob',Date.now()+60000],[expired,'alice',0]])db.prepare('INSERT INTO sync_sessions VALUES(?,?,?)').run(await hashToken(token),user,expires);
 const env={DB:adapter,ALLOWED_ORIGINS:'chrome-extension://approved'};
 const request=(method='GET',body,token=alice,path='/v1/sync/records',extra={})=>worker.fetch(new Request('https://sync.example'+path,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})}),env);
 const write=(baseRevision,doc,mutationId=crypto.randomUUID())=>({id,baseRevision,document:doc,mutationId});
 try{
  assert.equal((await request('GET',undefined,'')).status,401);assert.equal((await request('GET',undefined,expired)).status,401);
  assert.equal((await request('GET',undefined,alice,'/v1/sync/records',{'Origin':'https://evil.example'})).status,403);
  assert.equal((await request('GET',undefined,alice,'/v1/sync/records?user_id=bob')).status,400);
  const first=write(0,document());let r=await request('PUT',first);assert.equal(r.status,200);assert.equal((await r.json()).record.revision,1);
  r=await request('PUT',first);assert.equal(r.status,200);assert.equal((await r.json()).record.revision,1);
  assert.equal((await request('PUT',{...first,document:document('changed replay')})).status,409);
  assert.equal((await request('PUT',write(0,document('stale')))).status,409);
  assert.deepEqual((await (await request('GET',undefined,bob)).json()).records,[]);
  assert.equal((await request('PUT',{...write(1,document()),userId:'bob'})).status,400);
  r=await request('PUT',write(1,document('new')));assert.equal(r.status,200);assert.equal((await r.json()).record.revision,2);
  assert.equal((await request('PUT',first)).status,409);
  const race=await Promise.all([request('PUT',write(2,document('device A'))),request('PUT',write(2,document('device B')))]);
  assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
  const deletion=write(3,null);assert.equal((await request('PUT',deletion)).status,200);
  assert.equal((await request('PUT',write(2,document('offline resurrection')))).status,409);
  const listing=await (await request()).json();assert.equal(listing.records[0].document,null);assert.equal(listing.records[0].revision,4);
  assert.equal((await request('PUT',write(0,document()),bob)).status,200);
  assert.equal((await (await request('GET',undefined,bob)).json()).records[0].revision,1);
  const after=await (await request('GET',undefined,alice,'/v1/sync/records?after=leetcode%3A1')).json();assert.equal(after.next,null);
  assert.equal((await request('PUT',{...write(3,document()),padding:'x'.repeat(800*1024)})).status,400);
  const allowed=await request('GET',undefined,alice,'/v1/sync/records',{'Origin':'chrome-extension://approved'});assert.equal(allowed.headers.get('Access-Control-Allow-Origin'),'chrome-extension://approved');
  const unavailable=await worker.fetch(new Request('https://sync.example/v1/sync/records',{headers:{Authorization:`Bearer ${alice}`}}),{DB:{prepare(){throw Error('private db details');}},ALLOWED_ORIGINS:''});assert.equal(unavailable.status,503);assert.ok(!(await unavailable.text()).includes('private db'));
 }finally{db.close();}
});
