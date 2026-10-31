import { validateBackup } from '../database/backupFormat.ts';
import type { Backup } from '../database/backupFormat.ts';
import { validProblemId } from '../database/validation.ts';

// A problem and all its children are one consistency boundary. Null is an
// explicit permanent-deletion tombstone, never an absent/failed download.
export type SyncDocument = Omit<Backup, 'format' | 'version' | 'exportedAt'>;
export interface CloudRecord { id: string; revision: number; document: SyncDocument | null }
export interface Baseline { accountId: string; records: CloudRecord[] }
export interface Conflict { id: string; local: SyncDocument | null; remote: CloudRecord }
export interface SyncPlan {
  uploads: { id: string; baseRevision: number; document: SyncDocument | null }[];
  downloads: CloudRecord[];
  conflicts: Conflict[];
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
  return JSON.stringify(value);
}
export function equivalent(a: SyncDocument|null|undefined,b: SyncDocument|null|undefined): boolean {
  const content=(document:SyncDocument|null|undefined)=>{
    if(!document)return document;
    const copy=structuredClone(document);
    for(const problem of copy.problems){delete problem.lastOpenedAt;delete (problem as Partial<typeof problem>).updatedAt;}
    for(const solution of copy.solutions){delete solution.revision;delete solution.updatedAt;delete solution.analysisUpdatedAt;}
    copy.notes=copy.notes.filter(note=>note.legacy || Object.keys(note.images??{}).length || note.blocks.some(block=>block.type==='image'||block.content!==''));
    for(const note of copy.notes){delete (note as Partial<typeof note>).revision;delete (note as Partial<typeof note>).updatedAt;}
    return copy;
  };
  return canonical(content(a))===canonical(content(b));
}
export function validateDocument(id: string, value: unknown): SyncDocument | null {
  if (!validProblemId(id)) throw new Error('Invalid sync problem ID');
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid sync document');
  const row = value as Record<string, unknown>;
  const data = validateBackup({ format: 'codevault-backup', version: 2, exportedAt: '2026-01-01T00:00:00.000Z', problems: row.problems, solutions: row.solutions, notes: row.notes });
  if (data.problems.length !== 1 || data.problems[0].id !== id || data.notes.length > 1) throw new Error('Sync document must contain exactly its own problem');
  // Stable order prevents false conflicts from database iteration order.
  return { problems: data.problems, solutions: data.solutions.sort((a,b) => a.id.localeCompare(b.id)), notes: data.notes };
}
function records(rows: CloudRecord[]): Map<string, CloudRecord> {
  const result = new Map<string, CloudRecord>();
  for (const row of rows) {
    if (result.has(row.id) || !Number.isSafeInteger(row.revision) || row.revision < 1 || row.revision >= Number.MAX_SAFE_INTEGER) throw new Error('Invalid cloud revision or duplicate record');
    result.set(row.id, { ...row, document: validateDocument(row.id, row.document) });
  }
  return result;
}
/** Pure three-way merge. Does not write data or advance the acknowledged baseline. */
export function planSync(accountId: string, baseline: Baseline, localInput: Map<string, SyncDocument | null>, remoteInput: CloudRecord[]): SyncPlan {
  if (!accountId || baseline.accountId !== accountId) throw new Error('Sync account changed; explicit account binding is required');
  const base = records(baseline.records), remote = records(remoteInput);
  const local = new Map([...localInput].map(([id, document]) => [id, validateDocument(id, document)]));
  const plan: SyncPlan = { uploads: [], downloads: [], conflicts: [] };
  for (const id of new Set([...base.keys(), ...local.keys(), ...remote.keys()])) {
    const old = base.get(id), cloud = remote.get(id);
    if (old && (!cloud || cloud.revision < old.revision || (cloud.revision === old.revision && canonical(cloud.document) !== canonical(old.document)))) throw new Error('Cloud history is incomplete or changed; refusing to infer deletion');
    // Local enumeration must include explicit tombstones for permanent deletes.
    if (!local.has(id) && old) throw new Error('Local snapshot is incomplete; refusing to infer deletion');
    const here = local.get(id);
    if (here === undefined) { if (cloud) plan.downloads.push(cloud); continue; }
    if (!cloud) { plan.uploads.push({ id, baseRevision: 0, document: here }); continue; }
    if (equivalent(here,cloud.document)) continue;
    if (old && equivalent(here,old.document)) { plan.downloads.push(cloud); continue; }
    if (old && equivalent(cloud.document,old.document)) { plan.uploads.push({ id, baseRevision: cloud.revision, document: here }); continue; }
    // Includes edit/edit, delete/edit and first-login collisions. Keep both.
    plan.conflicts.push({ id, local: here, remote: cloud });
  }
  return plan;
}
