import { canonical, validateDocument } from '../../src/sync/protocol.ts';
import { validProblemId } from '../../src/database/validation.ts';

// Structural subset of the Workers D1 API; keeps protocol tests dependency-free.
interface Statement {
  bind(...values: (string | number)[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface Env { DB: { prepare(sql: string): Statement }; ALLOWED_ORIGINS: string }
interface Row { problem_id: string; revision: number; document: string; mutation_id: string }
const maxRequestBytes = 768 * 1024;
const maxDocumentBytes = 700 * 1024;
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const record = (row: Row) => ({ id: row.problem_id, revision: row.revision, document: JSON.parse(row.document) });
async function readBody(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('Invalid body');
  const reader = request.body?.getReader(); if (!reader) throw new Error('Missing body');
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const {value,done} = await reader.read(); if (done) break; size += value.byteLength; if (size > maxRequestBytes) throw new Error('Too large'); chunks.push(value); } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
export async function hashToken(token: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map(n => n.toString(16).padStart(2,'0')).join('');
}
async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/health' && request.method === 'GET') return json({ ok: true, service: 'codevault-sync', stage: 'foundation' });
  if (!env.DB) return json({ error: 'Service not configured' }, 503);
  const token = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) return json({ error: 'Authentication required' }, 401);
  const session = await env.DB.prepare('SELECT user_id FROM sync_sessions WHERE token_hash = ? AND expires_at > ?').bind(await hashToken(token), Date.now()).first<{user_id: string}>();
  if (!session) return json({ error: 'Authentication required' }, 401);
  // Owner is always taken from a verified server session, never request fields.
  const owner = session.user_id;
  if (url.pathname === '/v1/sync/records' && request.method === 'GET') {
    const params = [...url.searchParams.keys()];
    if (params.some(key => key !== 'after')) return json({ error: 'Invalid query' }, 400);
    const after = url.searchParams.get('after') || '';
    if (after && !validProblemId(after)) return json({ error: 'Invalid cursor' }, 400);
    const rows = (await env.DB.prepare('SELECT problem_id, revision, document, mutation_id FROM sync_documents WHERE user_id = ? AND problem_id > ? ORDER BY problem_id LIMIT 1').bind(owner, after).all<Row>()).results;
    return json({ records: rows.map(record), next: rows.length ? rows[rows.length-1].problem_id : null });
  }
  if (url.pathname === '/v1/sync/records' && request.method === 'PUT') {
    let input: Record<string, unknown>, document: string;
    try {
      const body = await readBody(request);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
      input = body as Record<string, unknown>;
      if (Object.keys(input).some(k => !['id','baseRevision','mutationId','document'].includes(k)) || !validProblemId(input.id) ||
          !Number.isSafeInteger(input.baseRevision) || (input.baseRevision as number) < 0 || (input.baseRevision as number) >= Number.MAX_SAFE_INTEGER - 1 ||
          typeof input.mutationId !== 'string' || !/^[a-f0-9-]{36}$/.test(input.mutationId)) throw new Error();
      document = canonical(validateDocument(input.id, input.document));
      if (new TextEncoder().encode(document).byteLength > maxDocumentBytes) return json({ error: 'Document too large; attachment storage not yet available' }, 413);
    } catch { return json({ error: 'Invalid sync request' }, 400); }
    const { id, baseRevision, mutationId } = input as { id: string; baseRevision: number; mutationId: string };
    // One atomic conditional SQL statement: stale reads cannot overwrite a write.
    const changed = baseRevision === 0
      ? (await env.DB.prepare('INSERT INTO sync_documents(user_id,problem_id,revision,document,mutation_id,updated_at) VALUES(?,?,1,?,?,?) ON CONFLICT(user_id,problem_id) DO NOTHING').bind(owner,id,document,mutationId,Date.now()).run()).meta.changes
      : (await env.DB.prepare('UPDATE sync_documents SET revision=revision+1,document=?,mutation_id=?,updated_at=? WHERE user_id=? AND problem_id=? AND revision=? AND mutation_id != ?').bind(document,mutationId,Date.now(),owner,id,baseRevision,mutationId).run()).meta.changes;
    const current = await env.DB.prepare('SELECT problem_id,revision,document,mutation_id FROM sync_documents WHERE user_id=? AND problem_id=?').bind(owner,id).first<Row>();
    if (!current) return json({ error: 'Conflict', current: null }, 409);
    if (!changed && !(current.mutation_id === mutationId && current.document === document && current.revision === baseRevision + 1)) return json({ error: 'Conflict', current: record(current) }, 409);
    // A newer write after our CAS is reported rather than falsely acknowledged.
    if (current.mutation_id !== mutationId) return json({ error: 'Conflict', current: record(current) }, 409);
    return json({ record: record(current) });
  }
  return json({ error: 'Not found' }, 404);
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (origin && !allowed.includes(origin)) return json({ error: 'Origin not allowed' }, 403);
    let response: Response;
    try { response = request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : await route(request, env); }
    catch { response = json({ error: 'Service temporarily unavailable' }, 503); }
    if (origin) { response.headers.set('Access-Control-Allow-Origin', origin); response.headers.set('Vary', 'Origin'); }
    response.headers.set('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Authorization,Content-Type');
    return response;
  },
};
