import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import worker, { hashToken } from '../src/worker.ts';
import { database } from './helpers.mjs';

const email='learner@example.test';
async function setup(t){
 const {db,adapter}=await database();t.after(()=>db.close());
 const mail=[];let deliveryStatus=200;
 const transport=mock.method(globalThis,'fetch',async(url,options)=>{
   assert.equal(url,'https://api.resend.com/emails');assert.equal(options.redirect,'manual');assert.ok(options.signal);
   const body=JSON.parse(options.body);const code=body.text.match(/\b\d{6}\b/)[0];
   assert.ok(!body.subject.includes(code));assert.match(options.headers['Idempotency-Key'],/^codevault-otp\//);
   mail.push({code,to:body.to[0],text:body.text});return new Response('{}',{status:deliveryStatus});
 });t.after(()=>transport.mock.restore());
 const env={DB:adapter,ALLOWED_ORIGINS:'chrome-extension://approved',AUTH_ENABLED:'true',AUTH_SECRET:'fixture-secret-never-used-outside-tests',RESEND_API_KEY:'fixture-resend-key',EMAIL_FROM:'signin@example.test'};
 const call=(path,body,token,method=body?'POST':'GET',ip='192.0.2.1',origin)=>worker.fetch(new Request('https://sync.example'+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{ }),...(ip===null?{}:{'CF-Connecting-IP':ip}),...(origin?{Origin:origin}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
 const requestCode=async(address=email,ip)=>{const r=await call('/v1/auth/request-code',{email:address,locale:'zh'},undefined,'POST',ip);assert.equal(r.status,202);const payload=await r.json();assert.ok(!JSON.stringify(payload).includes(mail.at(-1).code));return {email:address,challengeId:payload.challengeId,code:mail.at(-1).code};};
 const login=async(address=email)=>{const code=await requestCode(address);const r=await call('/v1/auth/verify-code',code);assert.equal(r.status,200);return r.json();};
 return {db,adapter,mail,env,call,requestCode,login,setDelivery:status=>deliveryStatus=status};
}

test('auth fails closed, rejects oversized/invalid bodies and disallowed origins without sending email',async t=>{
 const f=await setup(t);f.env.AUTH_ENABLED='false';assert.equal((await f.call('/v1/auth/request-code',{email})).status,503);f.env.AUTH_ENABLED='true';
 assert.equal((await f.call('/v1/auth/request-code',{email:'not-an-email'})).status,400);
 assert.equal((await f.call('/v1/auth/request-code',{email,locale:'xx'})).status,400);
 assert.equal((await f.call('/v1/auth/request-code',{email,user_id:'other'})).status,400);
 assert.equal((await f.call('/v1/auth/request-code',{email,padding:'x'.repeat(5000)})).status,400);
 assert.equal((await f.call('/v1/auth/request-code',{email},undefined,'POST','192.0.2.1','https://evil.test')).status,403);
 assert.equal(f.mail.length,0);assert.equal(f.db.prepare('SELECT count(*) n FROM auth_users').get().n,0);
 f.env.AUTH_ALLOWED_EMAILS='[]';assert.equal((await f.call('/v1/auth/request-code',{email})).status,503);
 f.env.AUTH_ALLOWED_EMAILS=JSON.stringify(['pilot@example.test']);assert.equal((await f.call('/v1/auth/request-code',{email})).status,403);assert.equal(f.mail.length,0);
});

test('OTP issues hashed session for verified email, restores identity and logout revokes sync access',async t=>{
 const f=await setup(t);const code=await f.requestCode(' Learner@Example.Test ');assert.equal(f.mail[0].to,email);
 const stored=f.db.prepare('SELECT * FROM auth_challenges').get();assert.notEqual(stored.code_hash,code.code);assert.equal(stored.delivered,1);assert.ok(f.mail[0].text.includes('5分钟'));
 const verified=await f.call('/v1/auth/verify-code',{...code,email});assert.equal(verified.status,200);assert.equal(verified.headers.get('Cache-Control'),'no-store');const session=await verified.json();
 assert.match(session.token,/^[a-f0-9]{64}$/);assert.equal(session.user.email,email);assert.ok(session.expiresAt>Date.now()+29*86400000);
 assert.equal(f.db.prepare('SELECT count(*) n FROM auth_challenges').get().n,0);
 const storedSession=f.db.prepare('SELECT * FROM sync_sessions').get();assert.equal(storedSession.token_hash,await hashToken(session.token));assert.ok(!JSON.stringify(storedSession).includes(session.token));
 const identity=await (await f.call('/v1/auth/session',undefined,session.token)).json();assert.equal(identity.user.id,session.user.id);assert.equal(identity.token,undefined);
 assert.equal((await f.call('/v1/sync/records',undefined,session.token)).status,200);
 assert.equal((await f.call('/v1/auth/verify-code',{...code,email})).status,401);
 assert.equal((await f.call('/v1/auth/logout',undefined,session.token,'POST')).status,200);
 assert.equal((await f.call('/v1/auth/session',undefined,session.token)).status,401);assert.equal((await f.call('/v1/sync/records',undefined,session.token)).status,401);
});

test('OTP cannot be guessed beyond three tries, reused after resend, used before accepted delivery or after expiry',async t=>{
 const f=await setup(t);const code=await f.requestCode();const wrong=code.code==='000000'?'111111':'000000';
 for(let i=0;i<3;i++)assert.equal((await f.call('/v1/auth/verify-code',{...code,code:wrong})).status,401);
 assert.equal((await f.call('/v1/auth/verify-code',code)).status,401);assert.equal(f.db.prepare('SELECT attempts FROM auth_challenges').get().attempts,3);
 assert.equal(f.db.prepare('SELECT count(*) n FROM auth_users').get().n,0);
 f.db.prepare("UPDATE auth_limits SET expires_at=0 WHERE key LIKE 'cooldown:%'").run();f.db.prepare('UPDATE auth_challenges SET created_at=created_at-60001').run();const replacement=await f.requestCode();assert.notEqual(code.challengeId,replacement.challengeId);
 assert.equal((await f.call('/v1/auth/verify-code',code)).status,401);
 f.db.prepare('UPDATE auth_challenges SET expires_at=0').run();assert.equal((await f.call('/v1/auth/verify-code',replacement)).status,401);
 f.setDelivery(503);assert.equal((await f.call('/v1/auth/request-code',{email:'failed@example.test'})).status,503);
 const failed=f.db.prepare('SELECT id FROM auth_challenges WHERE email=?').get('failed@example.test');
 assert.equal((await f.call('/v1/auth/verify-code',{email:'failed@example.test',challengeId:failed.id,code:f.mail.at(-1).code})).status,401);
 assert.equal(f.db.prepare('SELECT count(*) n FROM sync_sessions').get().n,0);
});

test('parallel verification consumes once; database failure rolls back consumption, account and session creation',async t=>{
 const f=await setup(t);const code=await f.requestCode();
 f.adapter.beforeRun=sql=>{if(sql.startsWith('INSERT INTO sync_sessions'))throw Error('private SQL failure');};
 const failed=await f.call('/v1/auth/verify-code',code);assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('private SQL'));
 assert.equal(f.db.prepare('SELECT attempts FROM auth_challenges').get().attempts,0);assert.equal(f.db.prepare('SELECT count(*) n FROM auth_users').get().n,0);
 f.adapter.beforeRun=undefined;
 const result=await Promise.all([f.call('/v1/auth/verify-code',code),f.call('/v1/auth/verify-code',code)]);assert.deepEqual(result.map(r=>r.status).sort(),[200,401]);
 assert.equal(f.db.prepare('SELECT count(*) n FROM sync_sessions').get().n,1);
});

test('persistent email cooldown/hour quotas and IP/global quotas bound mail costs',async t=>{
 const f=await setup(t);await f.requestCode();assert.equal((await f.call('/v1/auth/request-code',{email})).status,429);assert.equal(f.mail.length,1);
 f.db.prepare("UPDATE auth_limits SET expires_at=0 WHERE key LIKE 'cooldown:%'").run();f.db.prepare('UPDATE auth_challenges SET created_at=0').run();await f.requestCode();f.db.prepare("UPDATE auth_limits SET expires_at=0 WHERE key LIKE 'cooldown:%'").run();f.db.prepare('UPDATE auth_challenges SET created_at=0').run();assert.equal((await f.call('/v1/auth/request-code',{email})).status,429);
 assert.equal(f.mail.length,2);assert.ok(!JSON.stringify(f.db.prepare('SELECT key FROM auth_limits').all()).includes(email));
 for(const [scope,maximum] of [['send-ip',20],['send-global',300]]){
   f.db.prepare('UPDATE auth_limits SET hits=? WHERE key LIKE ?').run(maximum,scope+':%');
   const r=await f.call('/v1/auth/request-code',{email:scope+'@example.test'});assert.equal(r.status,429);assert.equal(r.headers.get('Retry-After'),'60');
 }
 assert.equal(f.mail.length,2);
});

test('missing IP shares a bounded verification bucket and scheduled cleanup removes expired secrets only',async t=>{
 const f=await setup(t);
 const body={email,challengeId:'d'.repeat(64),code:'123456'};
 for(let i=0;i<60;i++)assert.equal((await f.call('/v1/auth/verify-code',body,undefined,'POST',null)).status,401);
 assert.equal((await f.call('/v1/auth/verify-code',body,undefined,'POST',null)).status,429);
 assert.equal(f.mail.length,0);
 const session=await f.login('retained@example.test');
 const pending=await f.requestCode('pending@example.test');
 f.db.prepare('INSERT INTO sync_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run('expired-hash',session.user.id,0);
 f.db.prepare('INSERT INTO auth_challenges(id,email,code_hash,created_at,expires_at) VALUES(?,?,?,?,?)').run('expired-challenge','expired@example.test','hash',0,0);
 f.db.prepare('INSERT INTO auth_limits VALUES(?,?,?)').run('expired-limit',1,0);
 await worker.scheduled({},f.env);
 assert.equal(f.db.prepare('SELECT count(*) n FROM sync_sessions WHERE token_hash=?').get('expired-hash').n,0);
 assert.equal(f.db.prepare('SELECT count(*) n FROM auth_challenges WHERE id=?').get('expired-challenge').n,0);
 assert.equal(f.db.prepare('SELECT count(*) n FROM auth_limits WHERE key=?').get('expired-limit').n,0);
 assert.equal(f.db.prepare('SELECT count(*) n FROM auth_challenges WHERE id=?').get(pending.challengeId).n,1);
 assert.equal((await f.call('/v1/auth/session',undefined,session.token)).status,200);
});

test('sync insert/update rechecks the live session at the SQL write boundary',async t=>{
 const f=await setup(t);const session=await f.login();
 const doc={problems:[{id:'leetcode:1',platform:'leetcode',slug:'two-sum',url:'https://leetcode.cn/problems/two-sum/',title:'两数之和',difficulty:'Easy',tags:[],createdAt:1,updatedAt:1}],solutions:[],notes:[]};
 const change={id:'leetcode:1',baseRevision:0,mutationId:crypto.randomUUID(),document:doc};
 assert.equal((await f.call('/v1/sync/records',change,session.token,'PUT')).status,200);
 f.adapter.beforeRun=sql=>{if(sql.startsWith('UPDATE sync_documents'))f.db.prepare('DELETE FROM sync_sessions WHERE user_id=?').run(session.user.id);};
 assert.equal((await f.call('/v1/sync/records',{...change,baseRevision:1,document:null,mutationId:crypto.randomUUID()},session.token,'PUT')).status,409);
 assert.equal(f.db.prepare('SELECT revision FROM sync_documents WHERE user_id=?').get(session.user.id).revision,1);
 f.adapter.beforeRun=undefined;
 const other=await f.login('insert@example.test');
 f.adapter.beforeRun=sql=>{if(sql.startsWith('INSERT INTO sync_documents')){
   f.db.prepare('DELETE FROM sync_sessions WHERE user_id=?').run(other.user.id);
   f.db.prepare('DELETE FROM auth_users WHERE id=?').run(other.user.id);
 }};
 assert.equal((await f.call('/v1/sync/records',change,other.token,'PUT')).status,409);
 assert.equal(f.db.prepare('SELECT count(*) n FROM sync_documents WHERE user_id=?').get(other.user.id).n,0);
});

test('all-device logout, session expiry and recent explicit cloud account deletion isolate other users',async t=>{
 const f=await setup(t);const first=await f.login();
 f.db.prepare("UPDATE auth_limits SET expires_at=0 WHERE key LIKE 'cooldown:%'").run();f.db.prepare('UPDATE auth_challenges SET created_at=0').run(); // consumed rows are absent
 const second=await f.login();assert.equal(first.user.id,second.user.id);
 const other=await f.login('other@example.test');
 assert.equal((await f.call('/v1/auth/logout-all',undefined,first.token,'POST')).status,200);
 assert.equal((await f.call('/v1/auth/session',undefined,second.token)).status,401);assert.equal((await f.call('/v1/auth/session',undefined,other.token)).status,200);
 // A new account identity, no reliance on a synthetic session for deletion.
 const owner=await f.login('delete@example.test');
 f.db.prepare('INSERT INTO sync_documents VALUES(?,?,?,?,?,?)').run(owner.user.id,'leetcode:1',1,'null',crypto.randomUUID(),Date.now());
 assert.equal((await f.call('/v1/auth/account',{confirmation:'wrong'},owner.token,'DELETE')).status,400);
 f.db.prepare('UPDATE sync_sessions SET issued_at=0 WHERE token_hash=?').run(await hashToken(owner.token));
 assert.equal((await f.call('/v1/auth/account',{confirmation:'DELETE'},owner.token,'DELETE')).status,403);
 f.db.prepare('UPDATE sync_sessions SET issued_at=? WHERE token_hash=?').run(Date.now(),await hashToken(owner.token));
 f.adapter.beforeRun=sql=>{if(sql.startsWith('DELETE FROM sync_sessions WHERE user_id IN'))throw Error('failure during deletion');};
 assert.equal((await f.call('/v1/auth/account',{confirmation:'DELETE'},owner.token,'DELETE')).status,503);
 assert.equal(f.db.prepare('SELECT count(*) n FROM sync_documents WHERE user_id=?').get(owner.user.id).n,1);
 assert.equal((await f.call('/v1/auth/session',undefined,owner.token)).status,200);f.adapter.beforeRun=undefined;
 assert.equal((await f.call('/v1/auth/account',{confirmation:'DELETE'},owner.token,'DELETE')).status,200);
 assert.equal(f.db.prepare('SELECT count(*) n FROM auth_users WHERE id=?').get(owner.user.id).n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM sync_documents WHERE user_id=?').get(owner.user.id).n,0);
 assert.equal((await f.call('/v1/auth/session',undefined,owner.token)).status,401);assert.equal((await f.call('/v1/auth/session',undefined,other.token)).status,200);
 f.db.prepare('UPDATE sync_sessions SET expires_at=0 WHERE user_id=?').run(other.user.id);assert.equal((await f.call('/v1/auth/session',undefined,other.token)).status,401);
});
