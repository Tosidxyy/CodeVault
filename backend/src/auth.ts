import type { Database } from './db.ts';
import { json, readBody } from './http.ts';

export interface AuthEnv {
  DB: Database;
  AUTH_ENABLED?: string;
  AUTH_SECRET?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  AUTH_ALLOWED_EMAILS?: string;
}
export interface Session { user_id: string; email: string; expires_at: number; issued_at: number; tokenHash: string }
const minute = 60_000, hour = minute * 60, day = hour * 24;
const bytesHex = (bytes: Uint8Array) => [...bytes].map(n => n.toString(16).padStart(2,'0')).join('');
const randomToken = () => bytesHex(crypto.getRandomValues(new Uint8Array(32)));
export async function hashToken(token: string): Promise<string> {
  return bytesHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))));
}
async function keyedHash(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  return bytesHex(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))));
}
function email(value: unknown): string {
  if (typeof value !== 'string' || value.length > 254) throw new Error('Invalid email');
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(normalized) || normalized.split('@')[0].length > 64) throw new Error('Invalid email');
  return normalized;
}
function code(): string {
  let number: number;
  do { number = crypto.getRandomValues(new Uint32Array(1))[0]; } while (number >= Math.floor(2 ** 32 / 1_000_000) * 1_000_000);
  return String(number % 1_000_000).padStart(6, '0');
}
export async function getSession(request: Request, env: AuthEnv): Promise<Session | null> {
  const token = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) return null;
  const tokenHash = await hashToken(token);
  const session = await env.DB.prepare(`SELECT s.user_id,u.email,s.expires_at,s.issued_at FROM sync_sessions s
    JOIN auth_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.deletion_nonce IS NULL`)
    .bind(tokenHash,Date.now()).first<Omit<Session,'tokenHash'>>();
  return session ? {...session,tokenHash} : null;
}
async function limited(env: AuthEnv, scope: string, value: string, window: number, maximum: number): Promise<boolean> {
  const start = Math.floor(Date.now() / window) * window;
  const key = scope + ':' + await keyedHash(env.AUTH_SECRET!, value) + ':' + start;
  const result = await env.DB.prepare(`INSERT INTO auth_limits(key,hits,expires_at) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET hits=auth_limits.hits+1 WHERE auth_limits.hits < ?`).bind(key,start+window,maximum).run();
  return result.meta.changes === 1;
}
export async function cleanupAuth(env: AuthEnv): Promise<void> {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sync_sessions WHERE expires_at<=?').bind(now),
    env.DB.prepare('DELETE FROM auth_challenges WHERE expires_at<=?').bind(now),
    env.DB.prepare('DELETE FROM auth_limits WHERE expires_at<=?').bind(now),
  ]);
}
async function cooldown(env: AuthEnv, address: string): Promise<boolean> {
  const now = Date.now(), key = 'cooldown:' + await keyedHash(env.AUTH_SECRET!,address);
  return (await env.DB.prepare('INSERT INTO auth_limits(key,hits,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=1,expires_at=excluded.expires_at WHERE auth_limits.expires_at<=?').bind(key,now+minute,now).run()).meta.changes === 1;
}
const rateLimited = () => { const response=json({error:'Please wait before trying again'},429);response.headers.set('Retry-After','60');return response; };
export function configured(env: AuthEnv): boolean {
  try { return env.AUTH_ENABLED === 'true' && !!env.AUTH_SECRET && env.AUTH_SECRET.length >= 32 && !!env.RESEND_API_KEY && !!env.EMAIL_FROM && email(env.EMAIL_FROM) === env.EMAIL_FROM; }
  catch { return false; }
}
async function deliver(env: AuthEnv, address: string, otp: string, challengeId: string, locale: string): Promise<void> {
  const text = locale === 'zh'
    ? `你的 CodeVault 登录验证码为：${otp}\n\n验证码在5分钟内有效，只能使用一次。请勿向任何人透露。\n如果不是你本人发起的登录，请忽略此邮件。`
    : `Your CodeVault sign-in code is: ${otp}\n\nThis code expires in 5 minutes and can be used once. Do not share it.\nIf you did not request this, ignore this email.`;
  const response = await fetch('https://api.resend.com/emails', {
    method:'POST',redirect:'manual',signal:AbortSignal.timeout(10_000),
    headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`codevault-otp/${challengeId}`},
    body:JSON.stringify({from:`CodeVault <${env.EMAIL_FROM}>`,to:[address],subject:locale==='zh'?'CodeVault 登录验证码':'Your CodeVault sign-in code',text}),
  });
  // Provider acceptance is not proof of inbox delivery. Do not reflect its errors.
  if (!response.ok) { await response.body?.cancel(); throw new Error('Email unavailable'); }
  await response.body?.cancel();
}
export async function authRoute(request: Request, env: AuthEnv): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (!path.startsWith('/v1/auth/')) return null;
  if (!env.DB) return json({error:'Service not configured'},503);
  if (path === '/v1/auth/request-code' || path === '/v1/auth/verify-code') {
    if (request.method !== 'POST') return json({error:'Method not allowed'},405);
    if (!configured(env)) return json({error:'Sign-in is not available'},503);
    let body: Record<string,unknown>, address: string;
    try {
      body=await readBody(request,4096); address=email(body.email);
      const allowed=path.endsWith('/request-code')?['email','locale']:['email','challengeId','code'];
      if (Object.keys(body).some(k=>!allowed.includes(k)) || (body.locale!==undefined && !['zh','en'].includes(body.locale as string))) throw new Error();
      if (path.endsWith('/verify-code') && (typeof body.challengeId!=='string' || !/^[a-f0-9]{64}$/.test(body.challengeId) || typeof body.code!=='string' || !/^\d{6}$/.test(body.code))) throw new Error();
    } catch { return json({error:'Invalid sign-in request'},400); }
    if(env.AUTH_ALLOWED_EMAILS!==undefined){
      let allowed:string[];
      try{const value:unknown=JSON.parse(env.AUTH_ALLOWED_EMAILS);if(!Array.isArray(value)||!value.length||value.length>5)throw new Error();allowed=value.map(email);}
      catch{return json({error:'Sign-in is not available'},503);}
      if(!allowed.includes(address))return json({error:'Sign-in is not available for this pilot'},403);
    }
    // CF-Connecting-IP is supplied by Cloudflare. Missing IP shares a restrictive
    // bucket; never accept client-provided X-Forwarded-For as an alternate key.
    const ip=request.headers.get('CF-Connecting-IP') || 'unknown';
    const now=Date.now();
    if (!await limited(env,'auth-ip',ip,hour,60)) return rateLimited();
    if (path.endsWith('/request-code')) {
      const limits=await Promise.all([limited(env,'send-email',address,hour,3),limited(env,'send-ip',ip,hour,20),limited(env,'send-global','all',day,300)]);
      if (limits.some(value=>!value) || !await cooldown(env,address)) return rateLimited();
      await cleanupAuth(env);
      const challengeId=randomToken(), otp=code(), hash=await keyedHash(env.AUTH_SECRET!,`otp:${address}:${challengeId}:${otp}`);
      const created=await env.DB.prepare(`INSERT INTO auth_challenges(id,email,code_hash,created_at,expires_at) VALUES(?,?,?,?,?)
        ON CONFLICT(email) DO UPDATE SET id=excluded.id,code_hash=excluded.code_hash,created_at=excluded.created_at,expires_at=excluded.expires_at,attempts=0,delivered=0,consumed_by=NULL
        WHERE auth_challenges.created_at <= ?`).bind(challengeId,address,hash,now,now+5*minute,now-minute).run();
      if (!created.meta.changes) return rateLimited();
      try {
        await deliver(env,address,otp,challengeId,body.locale as string || 'en');
        const ready=await env.DB.prepare('UPDATE auth_challenges SET delivered=1 WHERE id=? AND expires_at>?').bind(challengeId,Date.now()).run();
        if (!ready.meta.changes) return json({error:'Code expired; request a new code'},409);
      } catch { return json({error:'Unable to send sign-in email; try again later'},503); }
      return json({challengeId,expiresIn:Math.max(0,Math.floor((now+5*minute-Date.now())/1000)),retryAfter:60},202);
    }
    const challengeId=body.challengeId as string, hash=await keyedHash(env.AUTH_SECRET!,`otp:${address}:${challengeId}:${body.code}`);
    const nonce=randomToken(), token=randomToken(), tokenHash=await hashToken(token), userId=crypto.randomUUID();
    // The successful consume nonce gates every following write in the same D1
    // transaction. A zero-change wrong/expired/replayed code cannot issue a user
    // or session; a SQL failure rolls consumption back too.
    const results=await env.DB.batch([
      env.DB.prepare(`UPDATE auth_challenges SET attempts=attempts+1,consumed_by=CASE WHEN code_hash=? THEN ? ELSE NULL END
        WHERE id=? AND email=? AND delivered=1 AND expires_at>? AND attempts<3 AND consumed_by IS NULL`).bind(hash,nonce,challengeId,address,now),
      env.DB.prepare(`INSERT INTO auth_users(id,email,created_at) SELECT ?,email,? FROM auth_challenges WHERE id=? AND consumed_by=?
        ON CONFLICT(email) DO NOTHING`).bind(userId,now,challengeId,nonce),
      env.DB.prepare(`INSERT INTO sync_sessions(token_hash,user_id,expires_at,issued_at)
        SELECT ?,u.id,?,? FROM auth_challenges c JOIN auth_users u ON u.email=c.email
        WHERE c.id=? AND c.consumed_by=? AND u.deletion_nonce IS NULL`).bind(tokenHash,now+30*day,now,challengeId,nonce),
      env.DB.prepare('DELETE FROM auth_challenges WHERE id=? AND consumed_by=?').bind(challengeId,nonce),
    ]);
    if (results[2].meta.changes !== 1) return json({error:'Invalid or expired code'},401);
    const session=await getSession(new Request(request.url,{headers:{Authorization:`Bearer ${token}`}}),env);
    if (!session) return json({error:'Sign-in interrupted; request a new code'},409);
    return json({token,user:{id:session.user_id,email:session.email},expiresAt:session.expires_at});
  }
  const session=await getSession(request,env);
  if (!session) return json({error:'Authentication required'},401);
  if (path==='/v1/auth/session' && request.method==='GET') return json({user:{id:session.user_id,email:session.email},expiresAt:session.expires_at});
  if (path==='/v1/auth/logout' && request.method==='POST') {
    await env.DB.prepare('DELETE FROM sync_sessions WHERE token_hash=?').bind(session.tokenHash).run(); return json({ok:true});
  }
  if (path==='/v1/auth/logout-all' && request.method==='POST') {
    await env.DB.prepare('DELETE FROM sync_sessions WHERE user_id=?').bind(session.user_id).run(); return json({ok:true});
  }
  if (path==='/v1/auth/account' && request.method==='DELETE') {
    let body;try { body=await readBody(request,128); }catch { return json({error:'Explicit confirmation required'},400); }
    if (body.confirmation!=='DELETE' || Object.keys(body).length!==1) return json({error:'Explicit confirmation required'},400);
    if (session.issued_at < Date.now()-10*minute) return json({error:'Sign in again before deleting your cloud account'},403);
    const nonce=randomToken();
    const results=await env.DB.batch([
      env.DB.prepare(`UPDATE auth_users SET deletion_nonce=? WHERE id=? AND EXISTS(SELECT 1 FROM sync_sessions WHERE token_hash=? AND expires_at>?)`).bind(nonce,session.user_id,session.tokenHash,Date.now()),
      env.DB.prepare('DELETE FROM sync_asset_refs WHERE user_id IN (SELECT id FROM auth_users WHERE deletion_nonce=?)').bind(nonce),
      env.DB.prepare("UPDATE asset_objects SET state='deleting',touched_at=? WHERE user_id IN (SELECT id FROM auth_users WHERE deletion_nonce=?)").bind(Date.now(),nonce),
      env.DB.prepare('DELETE FROM sync_documents WHERE user_id IN (SELECT id FROM auth_users WHERE deletion_nonce=?)').bind(nonce),
      env.DB.prepare('DELETE FROM auth_challenges WHERE email IN (SELECT email FROM auth_users WHERE deletion_nonce=?)').bind(nonce),
      env.DB.prepare('DELETE FROM sync_sessions WHERE user_id IN (SELECT id FROM auth_users WHERE deletion_nonce=?)').bind(nonce),
      env.DB.prepare('DELETE FROM auth_users WHERE deletion_nonce=?').bind(nonce),
    ]);
    return results[results.length-1].meta.changes===1?json({ok:true,attachmentCleanup:'queued'}):json({error:'Authentication required'},401);
  }
  return json({error:'Not found'},404);
}
