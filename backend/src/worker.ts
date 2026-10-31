import { canonical } from '../../src/sync/protocol.ts';
import { validProblemId } from '../../src/database/validation.ts';

import { authRoute, getSession, cleanupAuth } from './auth.ts';
import { assetRoute, cleanupAssets, assetsReadyGuard, resolveAssets, referenceStatements } from './assets.ts';
import type { AssetsEnv } from './assets.ts';
import { validateWireDocument, imageGroups } from '../../src/sync/assets.ts';
import { json, readBody } from './http.ts';
export { hashToken } from './auth.ts';
export interface Env extends AssetsEnv { ALLOWED_ORIGINS: string }
interface Row { problem_id: string; revision: number; document: string; mutation_id: string }
const maxRequestBytes = 768 * 1024;
const maxDocumentBytes = 700 * 1024;
const record = (row: Row) => ({ id: row.problem_id, revision: row.revision, document: JSON.parse(row.document) });
async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/health' && request.method === 'GET') return json({ ok: true, service: 'codevault-sync', stage: 'asset-backend' });
  if (!env.DB) return json({ error: 'Service not configured' }, 503);
  const authResponse = await authRoute(request, env);
  if (authResponse) return authResponse;
  const session = await getSession(request, env);
  if (!session) return json({ error: 'Authentication required' }, 401);
  // Owner is always taken from a verified server session, never request fields.
  const owner = session.user_id;
  const imageResponse = await assetRoute(request, env, session);
  if (imageResponse) return imageResponse;
  if (url.pathname === '/v1/sync/records' && request.method === 'GET') {
    const params = [...url.searchParams.keys()];
    if (params.some(key => key !== 'after')) return json({ error: 'Invalid query' }, 400);
    const after = url.searchParams.get('after') || '';
    if (after && !validProblemId(after)) return json({ error: 'Invalid cursor' }, 400);
    const rows = (await env.DB.prepare('SELECT problem_id, revision, document, mutation_id FROM sync_documents WHERE user_id = ? AND problem_id > ? ORDER BY problem_id LIMIT 1').bind(owner, after).all<Row>()).results;
    return json({ protocol: 2, records: rows.map(record), next: rows.length ? rows[rows.length-1].problem_id : null });
  }
  if (url.pathname === '/v1/sync/records' && request.method === 'PUT') {
    let input: Record<string, unknown>, document: string, groups: string[][];
    try {
      const body = await readBody(request, maxRequestBytes);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
      input = body as Record<string, unknown>;
      if (Object.keys(input).some(k => !['id','baseRevision','mutationId','document'].includes(k)) || !validProblemId(input.id) ||
          !Number.isSafeInteger(input.baseRevision) || (input.baseRevision as number) < 0 || (input.baseRevision as number) >= Number.MAX_SAFE_INTEGER - 1 ||
          typeof input.mutationId !== 'string' || !/^[a-f0-9-]{36}$/.test(input.mutationId)) throw new Error();
      const wire=validateWireDocument(input.id, input.document);
      groups=imageGroups(wire);document=canonical(wire);
      if (new TextEncoder().encode(document).byteLength > maxDocumentBytes) return json({ error: 'Document text exceeds 700KiB' }, 413);
    } catch { return json({ error: 'Invalid sync request' }, 400); }
    const { id, baseRevision, mutationId } = input as { id: string; baseRevision: number; mutationId: string };
    let assets;
    if (groups.flat().length && !env.ASSETS) return json({error:'Image storage is not configured'},503);
    try { assets=await resolveAssets(env,owner,groups); } catch { return json({error:'Upload valid note images before syncing'},409); }
    const keys=assets.map(asset=>asset.object_key), guard=assetsReadyGuard();
    const live='EXISTS(SELECT 1 FROM sync_sessions s JOIN auth_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.user_id=? AND s.expires_at>? AND u.deletion_nonce IS NULL)';
    const sessionValues=[session.tokenHash,owner,Date.now()] as const;
    const assetValues=[JSON.stringify(keys),owner] as const;
    const cas = baseRevision === 0
      ? env.DB.prepare('INSERT INTO sync_documents(user_id,problem_id,revision,document,mutation_id,updated_at) SELECT ?,?,1,?,?,? WHERE '+live+' AND '+guard+' ON CONFLICT(user_id,problem_id) DO NOTHING').bind(owner,id,document,mutationId,Date.now(),...sessionValues,...assetValues)
      : env.DB.prepare('UPDATE sync_documents SET revision=revision+1,document=?,mutation_id=?,updated_at=? WHERE user_id=? AND problem_id=? AND revision=? AND mutation_id != ? AND '+live+' AND '+guard).bind(document,mutationId,Date.now(),owner,id,baseRevision,mutationId,...sessionValues,...assetValues);
    // Document CAS and reference replacement are one atomic D1 batch. A stale
    // upload/GC generation cannot be committed after a pre-read readiness check.
    const results=await env.DB.batch([cas,...referenceStatements(env,owner,id,mutationId,baseRevision+1,document,keys)]);
    const changed=results[0].meta.changes;
    const current = await env.DB.prepare('SELECT problem_id,revision,document,mutation_id FROM sync_documents WHERE user_id=? AND problem_id=?').bind(owner,id).first<Row>();
    if (!current) return json({ error: 'Conflict', current: null }, 409);
    if (!changed && !(current.mutation_id === mutationId && current.document === document && current.revision === baseRevision + 1)) return json({ error: 'Conflict', current: record(current) }, 409);
    // A newer write after our CAS is reported rather than falsely acknowledged.
    if (current.mutation_id !== mutationId) return json({ error: 'Conflict', current: record(current) }, 409);
    return json({ protocol: 2, record: record(current) });
  }
  return json({ error: 'Not found' }, 404);
}
export default {
  async scheduled(_controller: unknown, env: Env): Promise<void> { await cleanupAuth(env); await cleanupAssets(env); },
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (origin && !allowed.includes(origin)) return json({ error: 'Origin not allowed' }, 403);
    let response: Response;
    try { response = request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : await route(request, env); }
    catch { response = json({ error: 'Service temporarily unavailable' }, 503); }
    if (origin) { response.headers.set('Access-Control-Allow-Origin', origin); response.headers.set('Vary', 'Origin'); }
    response.headers.set('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Authorization,Content-Type');
    return response;
  },
};
