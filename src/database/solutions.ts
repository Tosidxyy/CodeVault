import { openDatabase } from './problems';
import type { Problem } from '../platforms/types';
import type { SolutionDraft, SolutionMetadata, StoredSolution } from './types';

export class SolutionConflictError extends Error {}

export async function changeSolution(problemId: string, id: string, revision: number, metadata?: SolutionMetadata): Promise<StoredSolution | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('solutions', 'readwrite');
    const store = tx.objectStore('solutions');
    let result: StoredSolution | null = null;
    let conflict = false;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(conflict ? new SolutionConflictError('解法已变化或不存在，请刷新解法后重试。') : tx.error ?? new Error('Write aborted'));
    const request = store.get(id);
    request.onsuccess = () => {
      try {
        const current = request.result as StoredSolution | undefined;
        if (!current || current.problemId !== problemId || (current.revision ?? 0) !== revision) {
          conflict = true; tx.abort(); return;
        }
        if (metadata) {
          result = { ...current, ...metadata, revision: revision + 1 };
          store.put(result);
        } else store.delete(id);
      } catch { tx.abort(); }
    };
  });
}

export async function listSolutions(problemId: string): Promise<StoredSolution[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('solutions', 'readonly');
    const request = tx.objectStore('solutions').index('problemId').getAll(problemId);
    tx.oncomplete = () => resolve((request.result as StoredSolution[]).sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id)));
    tx.onabort = () => reject(tx.error ?? new Error('Read aborted'));
  });
}

export async function saveSolution(problem: Problem, draft: SolutionDraft): Promise<StoredSolution> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['problems', 'solutions'], 'readwrite');
    const problems = tx.objectStore('problems');
    const solutions = tx.objectStore('solutions');
    let result: StoredSolution;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(tx.error ?? new Error('Save aborted'));
    const existing = solutions.get(draft.id);
    existing.onsuccess = () => {
      try {
        if (existing.result) {
          const saved = existing.result as StoredSolution;
          if (saved.problemId !== problem.id || Object.keys(draft).some((key) => draft[key as keyof SolutionDraft] !== saved[key as keyof SolutionDraft])) {
            tx.abort(); return;
          }
          result = saved; // A retried request must not create a second version.
          return;
        }
        const now = Date.now();
        result = { ...draft, problemId: problem.id, createdAt: now };
        solutions.add(result);
        const parent = problems.get(problem.id);
        parent.onsuccess = () => {
          try { if (!parent.result) problems.add({ ...problem, favoriteAt: now, lastOpenedAt: null, createdAt: now, updatedAt: now }); }
          catch { tx.abort(); }
        };
      } catch { tx.abort(); }
    };
  });
}
