import { openDatabase } from './problems';
import type { Problem } from '../platforms/types';
import type { StoredNote } from './types';

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

export async function saveNote(problem: Problem, markdown: string, revision: number, images: Record<string, string>): Promise<StoredNote> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['notes', 'problems'], 'readwrite');
    const notes = tx.objectStore('notes');
    let result: StoredNote;
    let conflict = false;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(conflict ? new NoteConflictError('笔记已在其他页面更新。请先复制当前内容，再读取最新笔记。') : tx.error ?? new Error('Save aborted'));
    const request = notes.get(problem.id);
    request.onsuccess = () => {
      try {
        const previous = request.result as StoredNote | undefined;
        if ((previous?.revision ?? 0) !== revision) {
          // A retry after a lost response may safely return the identical saved text.
          if (previous?.markdown === markdown && JSON.stringify(previous.images ?? {}) === JSON.stringify(images)) { result = previous; return; }
          conflict = true; tx.abort(); return;
        }
        const now = Math.max(Date.now(), (previous?.updatedAt ?? 0) + 1);
        result = { problemId: problem.id, markdown, images, revision: revision + 1, updatedAt: now };
        notes.put(result);
        const problems = tx.objectStore('problems');
        const parent = problems.get(problem.id);
        parent.onsuccess = () => {
          try { if (!parent.result) problems.add({ ...problem, createdAt: now, updatedAt: now }); }
          catch { tx.abort(); }
        };
      } catch { tx.abort(); }
    };
  });
}
