import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { assetHash,toWireDocument,fromWireDocument } from '../../src/sync/assets.ts';
import { canonical,validateDocument } from '../../src/sync/protocol.ts';
import { names,validateTarget } from './target.mjs';
const target=validateTarget(JSON.parse(await readFile(new URL('../.cloud-target.json',import.meta.url),'utf8')));
const origin='https://'+names.domain;
const file=name=>new URL('../.cloud-'+name+'.json',import.meta.url);
async function save(name,value){await writeFile(file(name),JSON.stringify(value),{mode:0o600});}
async function response(path,{method='GET',body,token,raw=false}={}){
 return fetch(origin+path,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':raw?'image/png':'application/json'}:{})},...(body?{body:raw?new Uint8Array(body).buffer:JSON.stringify(body)}:{})});
}
async function api(path,options){const r=await response(path,options);if(!r.ok)throw Error('Pilot request failed: HTTP '+r.status);return r.json();}
const action=process.argv[2];
if(action==='request-code'){
 const email=target.testEmails[0];const challenge=await api('/v1/auth/request-code',{method:'POST',body:{email,locale:'zh'}});
 await save('challenge',{...challenge,email,origin,expiresAt:Date.now()+challenge.expiresIn*1000});
 console.log('CodeVault test code requested; expires in '+challenge.expiresIn+' seconds. No library uploaded.');
}else if(action==='verify'){
 if(process.stdin.isTTY)process.stdin.setRawMode(true);
 const input=createInterface({input:process.stdin,terminal:false});console.log('Waiting for verification code via secure stdin.');
 for await(const line of input){
  const code=JSON.parse(line).code;if(!/^\d{6}$/.test(code))throw Error('Six digits required');
  const challenge=JSON.parse(await readFile(file('challenge'),'utf8'));if(challenge.expiresAt<Date.now())throw Error('Code expired');
  const auth=await api('/v1/auth/verify-code',{method:'POST',body:{email:challenge.email,challengeId:challenge.challengeId,code}});
  assert.equal(auth.user.email,challenge.email);await save('session',{...auth,origin});
  if(process.stdin.isTTY&&!process.stdin.destroyed)process.stdin.setRawMode(false);input.close();process.stdin.pause();console.log('Real email-code sign-in verified. Session saved privately; no token displayed.');break;
 }
}else if(action==='smoke'){
 const auth=JSON.parse(await readFile(file('session'),'utf8')),token=auth.token;
 assert.equal((await api('/v1/auth/session',{token})).user.id,auth.user.id);
 const png=new Uint8Array(await readFile(new URL('../../public/icons/icon-16.png',import.meta.url))),hash=await assetHash(png),assetId='22222222-2222-4222-8222-222222222222';
 const id='leetcode:99999999999999999999';let fixture;
 try{fixture=JSON.parse(await readFile(file('smoke'),'utf8'));assert.equal(fixture.owner,auth.user.id);}catch(error){if(error.code!=='ENOENT')throw error;
  const local={problems:[{id,platform:'leetcode',slug:'codevault-cloud-qa',url:'https://leetcode.cn/problems/codevault-cloud-qa/',title:'CodeVault cloud QA demonstration',difficulty:'Easy',tags:['CodeVault QA'],createdAt:Date.now(),updatedAt:Date.now()}],solutions:[],notes:[{problemId:id,blocks:[{id:'33333333-3333-4333-8333-333333333333',type:'image',assetId}],images:{[assetId]:'data:image/png;base64,'+Buffer.from(png).toString('base64')},markdown:'',revision:1,updatedAt:Date.now()}]};
  fixture={owner:auth.user.id,id,hash,local,wire:(await toWireDocument(id,local)).document,mutationId:crypto.randomUUID()};await save('smoke',fixture);
 }
 await api('/v1/sync/assets/'+hash,{method:'PUT',body:png,token,raw:true});
 const saved=await api('/v1/sync/records',{method:'PUT',token,body:{id,baseRevision:0,mutationId:fixture.mutationId,document:fixture.wire}});assert.equal(saved.record.revision,1);
 const page=await api('/v1/sync/records?after=leetcode%3A99999999999999999998',{token});assert.equal(page.records[0].id,id);
 const hydrated=await fromWireDocument(id,page.records[0].document,async digest=>{const r=await response('/v1/sync/assets/'+digest,{token});assert.equal(r.status,200);return new Uint8Array(await r.arrayBuffer());});
 assert.equal(canonical(hydrated),canonical(validateDocument(id,fixture.local)));
 assert.equal((await response('/v1/sync/records',{method:'PUT',token,body:{id,baseRevision:0,mutationId:crypto.randomUUID(),document:fixture.wire}})).status,409);
 console.log('Real cloud D1/R2 round trip, PNG integrity, idempotent upload and stale-write rejection verified.');
}else if(action==='cleanup'){
 const auth=JSON.parse(await readFile(file('session'),'utf8')),fixture=JSON.parse(await readFile(file('smoke'),'utf8'));
 assert.equal(fixture.owner,auth.user.id);
 const page=await api('/v1/sync/records?after=leetcode%3A99999999999999999998',{token:auth.token});const current=page.records[0];
 assert.equal(current.id,fixture.id);assert.equal(canonical(current.document),canonical(fixture.wire));
 await api('/v1/sync/records',{method:'PUT',token:auth.token,body:{id:fixture.id,baseRevision:current.revision,mutationId:crypto.randomUUID(),document:null}});
 const discarded=await response('/v1/sync/assets/'+fixture.hash,{method:'DELETE',token:auth.token});assert.ok([202,409].includes(discarded.status));
 console.log('Only the QA fixture was removed. Account/local data retained; unshared QA image queued for private cleanup.');
}else throw Error('Choose request-code/verify/smoke/cleanup');
