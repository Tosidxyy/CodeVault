import { openDatabase, ProblemTrashedError } from './problems';
import type { Problem } from '../platforms/types';
import type { SolutionDraft, SolutionMetadata, StoredSolution } from './types';

export class SolutionConflictError extends Error {}

export async function changeSolution(problemId: string, id: string, revision: number, metadata?: SolutionMetadata, analysis?: string): Promise<StoredSolution | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['solutions', 'problems'], 'readwrite');
    const store = tx.objectStore('solutions');
    let result: StoredSolution | null = null;
    let conflict = false;
    let trashed = false;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(trashed ? new ProblemTrashedError() : conflict ? new SolutionConflictError('解法已变化或不存在，请刷新解法后重试。') : tx.error ?? new Error('Write aborted'));
    const guard = tx.objectStore('problems').get(problemId);
    guard.onsuccess = () => { if (guard.result?.deletedAt) { trashed = true; tx.abort(); } };
    const request = store.get(id);
    request.onsuccess = () => {
      try {
        const current = request.result as StoredSolution | undefined;
        if (!current || current.problemId !== problemId || (current.revision ?? 0) !== revision) {
          conflict = true; tx.abort(); return;
        }
        if (analysis !== undefined) {
          result = { ...current, analysis, analysisUpdatedAt: Date.now(), revision: revision + 1, updatedAt: Date.now() };
          store.put(result);
        } else if (metadata) {
          result = { ...current, ...metadata, revision: revision + 1, updatedAt: Date.now() };
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

export async function saveSolution(problem: Problem, draft: SolutionDraft, locale: 'zh' | 'en' = 'zh'): Promise<StoredSolution> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['problems', 'solutions'], 'readwrite');
    const problems = tx.objectStore('problems');
    const solutions = tx.objectStore('solutions');
    let result: StoredSolution;
    let trashed = false;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(trashed ? new ProblemTrashedError() : tx.error ?? new Error('Save aborted'));
    const guard = problems.get(problem.id);
    guard.onsuccess = () => { if (guard.result?.deletedAt) { trashed = true; tx.abort(); } };
    const existing = solutions.get(draft.id);
    existing.onsuccess = () => {
      try {
        if (existing.result) {
          const saved = existing.result as StoredSolution;
          if (saved.problemId !== problem.id || Object.keys(draft).some((key) => !(key === 'name' && !draft.name) && draft[key as keyof SolutionDraft] !== saved[key as keyof SolutionDraft])) {
            tx.abort(); return;
          }
          result = saved; // A retried request must not create a second version.
          return;
        }
        const siblings = solutions.index('problemId').getAll(problem.id);
        siblings.onsuccess = () => {
          try {
            const names = (siblings.result as StoredSolution[]).map((row) => row.name);
            let number = names.length + 1;
            const prefix = locale === 'en' ? 'Solution' : '解法';
            while (names.includes(`${prefix} ${number}`)) number++;
            const now = Date.now();
            result = { ...draft, name: draft.name || `${prefix} ${number}`, problemId: problem.id, createdAt: now, updatedAt: now };
            solutions.add(result);
            const parent = problems.get(problem.id);
            parent.onsuccess = () => {
              try { if (!parent.result) problems.add({ ...problem, favoriteAt: now, lastOpenedAt: null, createdAt: now, updatedAt: now }); }
              catch { tx.abort(); }
            };
          } catch { tx.abort(); }
        };
      } catch { tx.abort(); }
    };
  });
}
