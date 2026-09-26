import { openDatabase } from './problems';
import type { Problem } from '../platforms/types';
import type { SolutionDraft, StoredSolution } from './types';

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
          try { if (!parent.result) problems.add({ ...problem, createdAt: now, updatedAt: now }); }
          catch { tx.abort(); }
        };
      } catch { tx.abort(); }
    };
  });
}
