import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare,convertV4MiniflareOptions } from 'miniflare';
import { toWireDocument,assetHash } from '../../../src/sync/assets.ts';

test('real local Workers runtime executes D1 OTP transactions, R2 image sync and scheduled cleanup', {timeout:60000},async()=>{
 const root=fileURLToPath(new URL('../../',import.meta.url));
 const compiled=await build({entryPoints:[root+'src/worker.ts'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',logLevel:'silent'});
 const secret='local-runtime-fixture-secret-at-least-32-chars';let sentCode;

 const mf=new Miniflare(convertV4MiniflareOptions({script:compiled.outputFiles[0].text,modules:true,compatibilityDate:'2026-10-30',d1Databases:{DB:'codevault-local-runtime'},r2Buckets:{ASSETS:'codevault-local-runtime-assets'},d1Persist:false,r2Persist:false,bindings:{AUTH_ENABLED:'true',AUTH_SECRET:secret,RESEND_API_KEY:'fixture-not-real',EMAIL_FROM:'signin@example.test',ALLOWED_ORIGINS:''},outboundService:async request=>{assert.equal(request.url,'https://api.resend.com/emails');const body=await request.json();sentCode=body.text.match(/\b\d{6}\b/)[0];return Response.json({id:'local-runtime-email'});}}));
 try{
  const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('ASSETS');
  for(const name of ['0001_sync.sql','0002_auth.sql','0003_assets.sql'])for(const sql of (await readFile(root+'migrations/'+name,'utf8')).split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
  const email='runtime@example.test';
  const delivery=await mf.dispatchFetch('https://worker.test/v1/auth/request-code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
  assert.equal(delivery.status,202);const challenge=(await delivery.json()).challengeId;const code=sentCode;assert.match(code,/^\d{6}$/);
  const login=await mf.dispatchFetch('https://worker.test/v1/auth/verify-code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,challengeId:challenge,code})});
  assert.equal(login.status,200);const auth=await login.json();assert.match(auth.token,/^[a-f0-9]{64}$/);
  const png=new Uint8Array(await readFile(root+'../public/icons/icon-16.png')),digest=await assetHash(png),assetId='22222222-2222-4222-8222-222222222222';
  const upload=await mf.dispatchFetch('https://worker.test/v1/sync/assets/'+digest,{method:'PUT',headers:{Authorization:'Bearer '+auth.token,'Content-Type':'image/png'},body:png});assert.equal(upload.status,200);
  const local={problems:[{id:'leetcode:1',platform:'leetcode',slug:'two-sum',url:'https://leetcode.cn/problems/two-sum/',title:'Two Sum',difficulty:'Easy',tags:[],createdAt:1,updatedAt:1}],solutions:[],notes:[{problemId:'leetcode:1',blocks:[{id:'33333333-3333-4333-8333-333333333333',type:'image',assetId}],images:{[assetId]:'data:image/png;base64,'+Buffer.from(png).toString('base64')},markdown:'',revision:1,updatedAt:1}]};
  const document=(await toWireDocument('leetcode:1',local)).document;
  const saved=await mf.dispatchFetch('https://worker.test/v1/sync/records',{method:'PUT',headers:{Authorization:'Bearer '+auth.token,'Content-Type':'application/json'},body:JSON.stringify({id:'leetcode:1',baseRevision:0,mutationId:crypto.randomUUID(),document})});assert.equal(saved.status,200);assert.equal((await saved.json()).record.revision,1);
  assert.equal((await bucket.list()).objects.length,1);
  const image=await mf.dispatchFetch('https://worker.test/v1/sync/assets/'+digest,{headers:{Authorization:'Bearer '+auth.token}});assert.deepEqual(new Uint8Array(await image.arrayBuffer()),png);
  const removed=await mf.dispatchFetch('https://worker.test/v1/auth/account',{method:'DELETE',headers:{Authorization:'Bearer '+auth.token,'Content-Type':'application/json'},body:JSON.stringify({confirmation:'DELETE'})});assert.equal(removed.status,200);
  assert.equal((await bucket.list()).objects.length,1);
  const worker=await mf.getWorker();await worker.scheduled({cron:'*/15 * * * *'});
  assert.equal((await bucket.list()).objects.length,0);
  assert.equal((await db.prepare('SELECT count(*) AS count FROM auth_users').first()).count,0);
 }finally{await mf.dispose();}
});
