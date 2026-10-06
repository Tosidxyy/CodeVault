import { openDatabase, ProblemTrashedError } from './problems';
import type { Problem } from '../platforms/types';
import { migrateMarkdown } from './noteBlocks';
import type { NoteBlock, StoredNote } from './types';

export class NoteConflictError extends Error {}

export async function getNote(problemId: string): Promise<StoredNote | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('notes', 'readonly');
    const request = tx.objectStore('notes').get(problemId);
    tx.oncomplete = () => resolve(request.result ?? null);
    tx.onabort = () => reject(tx.error ?? new Error('Read aborted'));
  });
}

export function saveNote(problem: Problem, markdown: string, revision: number, images: Record<string, string>): Promise<StoredNote> {
  return saveBlocks(problem, migrateMarkdown(markdown, images), revision, images, markdown);
}

export async function saveBlocks(problem: Problem, blocks: NoteBlock[], revision: number, images: Record<string, string>, markdown?: string): Promise<StoredNote> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['notes', 'problems'], 'readwrite');
    const notes = tx.objectStore('notes');
    let result: StoredNote;
    let conflict = false;
    let trashed = false;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(trashed ? new ProblemTrashedError() : conflict ? new NoteConflictError('笔记已在其他页面更新。请先复制当前内容，再读取最新笔记。') : tx.error ?? new Error('Save aborted'));
    const guard = tx.objectStore('problems').get(problem.id);
    guard.onsuccess = () => { if (guard.result?.deletedAt) { trashed = true; tx.abort(); } };
    const request = notes.get(problem.id);
    request.onsuccess = () => {
      try {
        const previous = request.result as StoredNote | undefined;
        if ((previous?.revision ?? 0) !== revision) {
          // A retry after a lost response may safely return the identical saved text.
          if (previous && (markdown === undefined ? JSON.stringify(previous?.blocks) === JSON.stringify(blocks) : previous?.markdown === markdown) && JSON.stringify(previous.images ?? {}) === JSON.stringify(images)) { result = previous; return; }
          conflict = true; tx.abort(); return;
        }
        const now = Math.max(Date.now(), (previous?.updatedAt ?? 0) + 1);
        result = { ...previous, problemId: problem.id, blocks, markdown: markdown ?? previous?.markdown ?? '', images, revision: revision + 1, updatedAt: now };
        delete (result as StoredNote & { purged?: boolean }).purged;
        if (markdown !== undefined && !result.legacy) result.legacy = { markdown, images };
        notes.put(result);
        const problems = tx.objectStore('problems');
        const parent = problems.get(problem.id);
        parent.onsuccess = () => {
          try { if (!parent.result) problems.add({ ...problem, favoriteAt: now, lastOpenedAt: null, createdAt: now, updatedAt: now }); }
          catch { tx.abort(); }
        };
      } catch { tx.abort(); }
    };
  });
}
