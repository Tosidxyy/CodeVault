import { assetHash, maxAssetBytes, validatePng } from '../../src/sync/assets.ts';
import type { AuthEnv, Session } from './auth.ts';
import type { Statement } from './db.ts';
import { BodyLimitError, json, readBytes } from './http.ts';

interface ObjectBody { body: ReadableStream<Uint8Array>; size: number }
export interface Bucket {
  put(key: string, bytes: Uint8Array, options: { httpMetadata: {contentType:string} }): Promise<unknown>;
  get(key: string): Promise<ObjectBody | null>;
  delete(key: string): Promise<void>;
  list(options: {prefix:string;limit:number;cursor?:string}): Promise<{objects:{key:string}[];truncated:boolean;cursor?:string}>;
}
export interface AssetsEnv extends AuthEnv { ASSETS?: Bucket }
const cleanupPageSize=10;
interface Asset { object_key: string; hash: string; byte_size: number; state: string }
const liveSession = 'EXISTS(SELECT 1 FROM sync_sessions s JOIN auth_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.user_id=? AND s.expires_at>? AND u.deletion_nonce IS NULL)';
const authValues = (session: Session): [string,string,number] => [session.tokenHash,session.user_id,Date.now()];
export async function assetRoute(request: Request, env: AssetsEnv, session: Session): Promise<Response | null> {
  const path=new URL(request.url).pathname;
  if (!path.startsWith('/v1/sync/assets/')) return null;
  const hash=path.slice('/v1/sync/assets/'.length);
  if (!/^[a-f0-9]{64}$/.test(hash)) return json({error:'Not found'},404);
  if (!env.ASSETS) return json({error:'Image storage is not configured'},503);
  const owner=session.user_id;
  if (request.method==='GET') {
    const asset=await env.DB.prepare("SELECT object_key,hash,byte_size,state FROM asset_objects WHERE user_id=? AND hash=? AND state='ready'").bind(owner,hash).first<Asset>();
    if (!asset) return json({error:'Image not found'},404);
    const object=await env.ASSETS.get(asset.object_key);
    if (!object) return json({error:'Image temporarily unavailable'},503);
    if (object.size!==asset.byte_size) { await object.body.cancel();return json({error:'Image integrity metadata mismatch'},503); }
    return new Response(object.body,{headers:{'Content-Type':'image/png','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
  }
  if (request.method==='DELETE') {
    const removed=await env.DB.prepare(`UPDATE asset_objects SET state='deleting',touched_at=? WHERE user_id=? AND hash=? AND state IN ('pending','ready') AND ${liveSession}
      AND NOT EXISTS(SELECT 1 FROM sync_asset_refs r WHERE r.object_key=asset_objects.object_key)`)
      .bind(Date.now(),owner,hash,...authValues(session)).run();
    if (removed.meta.changes) return json({ok:true,cleanup:'queued'},202);
    const existing=await env.DB.prepare("SELECT object_key FROM asset_objects WHERE user_id=? AND hash=? AND state IN ('ready','pending')").bind(owner,hash).first();
    return existing?json({error:'Image is still referenced or session changed'},409):json({ok:true,cleanup:'queued'},202);
  }
  if (request.method!=='PUT') return json({error:'Method not allowed'},405);
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='image/png') return json({error:'PNG required'},415);
  let bytes: Uint8Array;
  try { bytes=await readBytes(request,maxAssetBytes);validatePng(bytes);if (await assetHash(bytes)!==hash) throw new Error(); }
  catch (error) { return json({error:'Invalid PNG, hash or size'},error instanceof BodyLimitError?413:400); }
  // Content-addressed per account, immutable generation keys. Renew the grace
  // period for a completed retry, without overwriting the object's bytes.
  const renewed=await env.DB.prepare(`UPDATE asset_objects SET touched_at=? WHERE user_id=? AND hash=? AND state='ready' AND ${liveSession}`).bind(Date.now(),owner,hash,...authValues(session)).run();
  if (renewed.meta.changes) {
    const existing=await env.DB.prepare("SELECT object_key,byte_size FROM asset_objects WHERE user_id=? AND hash=? AND state='ready'").bind(owner,hash).first<Asset>();
    if (!existing) return json({error:'Image generation changed; retry upload'},409);
    const object=await env.ASSETS.get(existing.object_key);
    let intact=false;
    if (object) {
      if (object.size===bytes.length) intact=await assetHash(new Uint8Array(await new Response(object.body).arrayBuffer()))===hash;
      else await object.body.cancel();
    }
    if (!intact) await env.ASSETS.put(existing.object_key,bytes,{httpMetadata:{contentType:'image/png'}});
    const current=await env.DB.prepare("SELECT object_key FROM asset_objects WHERE object_key=? AND state='ready' AND "+liveSession).bind(existing.object_key,...authValues(session)).first();
    return current?json({hash,bytes:bytes.length}):json({error:'Image or session changed; retry upload'},409);
  }
  const key=`v1/${await assetHash(new TextEncoder().encode(owner))}/${crypto.randomUUID()}`;
  const reserved=await env.DB.prepare(`INSERT OR IGNORE INTO asset_objects(object_key,user_id,hash,byte_size,state,touched_at)
    SELECT ?,?,?,?,'pending',? WHERE ${liveSession}
    AND (SELECT COALESCE(SUM(byte_size),0) FROM asset_objects WHERE user_id=?) + ? <= 104857600
    AND (SELECT COUNT(*) FROM asset_objects WHERE user_id=?) < 1000`)
    .bind(key,owner,hash,bytes.length,Date.now(),...authValues(session),owner,bytes.length,owner).run();
  if (!reserved.meta.changes) return json({error:'Image upload pending, quota reached or session changed'},409);
  try {
    // Reservation precedes external I/O: interrupted uploads remain discoverable.
    await env.ASSETS.put(key,bytes,{httpMetadata:{contentType:'image/png'}});
    const published=await env.DB.prepare(`UPDATE asset_objects SET state='ready',touched_at=? WHERE object_key=? AND state='pending' AND ${liveSession}`).bind(Date.now(),key,...authValues(session)).run();
    if (published.meta.changes) return json({hash,bytes:bytes.length});
    await env.DB.prepare("UPDATE asset_objects SET state='deleting' WHERE object_key=?").bind(key).run();
    return json({error:'Upload cancelled; session or account changed'},409);
  } catch {
    await env.DB.prepare("UPDATE asset_objects SET state='deleting' WHERE object_key=?").bind(key).run();
    return json({error:'Image upload unavailable; retry later'},503);
  }
}
/** SQL guard used in the same transaction as document CAS and reference writes. */
export function assetsReadyGuard(): string {
  return `NOT EXISTS(SELECT 1 FROM json_each(?) h WHERE NOT EXISTS(SELECT 1 FROM asset_objects a WHERE a.user_id=? AND a.object_key=h.value AND a.state='ready'))`;
}
export async function resolveAssets(env: AssetsEnv, owner: string, groups: string[][]): Promise<Asset[]> {
  const hashes=[...new Set(groups.flat())];if (!hashes.length) return [];
  const assets=(await env.DB.prepare("SELECT object_key,hash,byte_size,state FROM asset_objects WHERE user_id=? AND state='ready' AND hash IN (SELECT value FROM json_each(?))").bind(owner,JSON.stringify(hashes)).all<Asset>()).results;
  const sizes=new Map(assets.map(asset=>[asset.hash,asset.byte_size]));
  if (assets.length!==hashes.length || groups.some(group=>group.reduce((sum,hash)=>sum+(sizes.get(hash)??Infinity),0)>6*1024*1024)) throw new Error('Images missing or note image total exceeds 6MB');
  return assets;
}
/** Gate reference replacement on the exact committed document mutation. */
export function referenceStatements(env: AssetsEnv, owner: string, problemId: string, mutation: string, revision: number, document: string, keys: string[]): Statement[] {
  const gate='EXISTS(SELECT 1 FROM sync_documents WHERE user_id=? AND problem_id=? AND mutation_id=? AND revision=? AND document=?)';
  const values=[owner,problemId,mutation,revision,document] as const;
  return [
    env.DB.prepare(`UPDATE asset_objects SET touched_at=? WHERE object_key IN (SELECT object_key FROM sync_asset_refs WHERE user_id=? AND problem_id=?) AND ${gate}`).bind(Date.now(),owner,problemId,...values),
    env.DB.prepare(`DELETE FROM sync_asset_refs WHERE user_id=? AND problem_id=? AND ${gate}`).bind(owner,problemId,...values),
    ...keys.map(key=>env.DB.prepare(`INSERT OR IGNORE INTO sync_asset_refs(user_id,problem_id,object_key) SELECT ?,?,? WHERE ${gate}`).bind(owner,problemId,key,...values)),
  ];
}
export async function cleanupAssets(env: AssetsEnv): Promise<void> {
  const now=Date.now();
  // Marking and reference creation serialize in D1. New generations never reuse
  // these keys, so an external delete cannot race a later reference to this key.
  await env.DB.prepare(`UPDATE asset_objects SET state='deleting' WHERE
    (NOT EXISTS(SELECT 1 FROM auth_users u WHERE u.id=asset_objects.user_id) OR (state='pending' AND touched_at<?) OR (state='ready' AND touched_at<?))
    AND NOT EXISTS(SELECT 1 FROM sync_asset_refs r WHERE r.object_key=asset_objects.object_key)`)
    .bind(now-15*60_000,now-24*60*60_000).run();
  const rows=(await env.DB.prepare("SELECT object_key FROM asset_objects WHERE state='deleting' AND NOT EXISTS(SELECT 1 FROM sync_asset_refs r WHERE r.object_key=asset_objects.object_key) LIMIT ?").bind(cleanupPageSize).all<{object_key:string}>()).results;
  if (!env.ASSETS) { if (rows.length) throw new Error('Image cleanup storage missing'); return; }
  for (const row of rows) {
    await env.ASSETS.delete(row.object_key);
    await env.DB.prepare("DELETE FROM asset_objects WHERE object_key=? AND state='deleting' AND NOT EXISTS(SELECT 1 FROM sync_asset_refs WHERE object_key=?)").bind(row.object_key,row.object_key).run();
  }
  // Reconcile orphan bytes even if a late R2 write completed after cancellation
  // and its SQL journal was already cleaned. Cursor makes each run bounded.
  const saved=await env.DB.prepare('SELECT cursor FROM asset_cleanup_cursor WHERE id=1').first<{cursor:string}>();
  const page=await env.ASSETS.list({prefix:'v1/',limit:cleanupPageSize,...(saved?.cursor?{cursor:saved.cursor}:{})});
  for (const object of page.objects) {
    const tracked=await env.DB.prepare('SELECT object_key FROM asset_objects WHERE object_key=?').bind(object.key).first();
    if (!tracked) await env.ASSETS.delete(object.key);
  }
  if (page.truncated && !page.cursor) throw new Error('Invalid storage cursor');
  await env.DB.prepare('INSERT INTO asset_cleanup_cursor(id,cursor) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET cursor=excluded.cursor').bind(page.truncated?page.cursor!:'').run();
}
