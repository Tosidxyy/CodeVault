import { openDatabase } from './problems';
import type { LibraryProblem, StoredProblem, StoredSolution, StoredNote } from './types';

export async function listLibrary(trashed = false): Promise<LibraryProblem[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['problems', 'solutions', 'notes'], 'readonly');
    const problems = tx.objectStore('problems').getAll();
    const solutions = tx.objectStore('solutions').getAll();
    const notes = tx.objectStore('notes').getAll();
    tx.onabort = () => reject(tx.error);
    tx.oncomplete = () => {
      const names = new Map<string, string[]>();
      for (const row of solutions.result as StoredSolution[]) names.set(row.problemId, [...(names.get(row.problemId) ?? []), row.name]);
      const noted = new Set((notes.result as StoredNote[]).filter((row) => row.blocks.some((block) => block.type === 'image' || block.content.trim())).map((row) => row.problemId));
      resolve((problems.result as StoredProblem[]).filter(row => !row.purged && !!row.deletedAt === trashed).map((row) => ({ ...row, solutionNames: names.get(row.id) ?? [], solutionCount: names.get(row.id)?.length ?? 0, hasNote: noted.has(row.id) }))
        .sort((a, b) => trashed ? (b.deletedAt ?? 0) - (a.deletedAt ?? 0) : (b.favoriteAt ?? b.createdAt) - (a.favoriteAt ?? a.createdAt)));
    };
  });
}
