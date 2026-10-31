export const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
export async function readBody(request: Request, limit: number): Promise<Record<string, unknown>> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new Error('Invalid body');
  const reader = request.body?.getReader(); if (!reader) throw new Error('Missing body');
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const {value,done} = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) throw new Error('Too large'); chunks.push(value); } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const body: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid body');
  return body as Record<string, unknown>;
}
