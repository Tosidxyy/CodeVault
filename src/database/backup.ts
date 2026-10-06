import { openDatabase } from './problems';
import { validateBackup, parseBackup } from './backupFormat';
import type { Backup } from './backupFormat';

const stores = ['problems', 'solutions', 'notes'] as const;
export async function exportBackup(): Promise<Backup> {
  const db = await openDatabase();
  const data = await new Promise<Record<string, unknown[]>>((resolve, reject) => {
    const tx = db.transaction([...stores], 'readonly');
    const requests = stores.map(name => tx.objectStore(name).getAll());
    tx.oncomplete = () => resolve(Object.fromEntries(stores.map((name, i) => [name, requests[i].result])));
    tx.onabort = () => reject(new Error('备份读取失败，请重试。'));
  });
  const problems = data.problems.filter(row => !(row as { purged?: boolean }).purged);
  const ids = new Set(problems.map(row => (row as { id: string }).id));
  const backup = validateBackup({ format: 'codevault-backup', version: 2, exportedAt: new Date().toISOString(), problems,
    solutions: data.solutions.filter(row => ids.has((row as { problemId: string }).problemId)), notes: data.notes.filter(row => ids.has((row as { problemId: string }).problemId)) });
  // Ensure every file we export also satisfies the import size limit.
  return parseBackup(JSON.stringify(backup));
}
export interface ImportResult { problems: number; solutions: number; notes: number; skipped: number }
export async function importBackup(value: Backup): Promise<ImportResult> {
  const backup = validateBackup(value);
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([...stores], 'readwrite');
    const result: ImportResult = { problems: 0, solutions: 0, notes: 0, skipped: 0 };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(new Error('导入失败，所有本次写入已回滚，现有内容保留。'));
    for (const name of stores) {
      const store = tx.objectStore(name);
      for (const row of backup[name]) {
        const key = 'id' in row ? row.id : row.problemId;
        const request = store.get(key);
        request.onsuccess = () => {
          if (request.result !== undefined && !request.result.purged) { result.skipped++; return; }
          try {
            if (request.result?.purged) {
              const restored = name === 'notes' && 'revision' in row ? { ...row, revision: Math.max(row.revision ?? 0, request.result.revision) + 1 } : row;
              if ('revision' in restored && restored.revision! >= Number.MAX_SAFE_INTEGER) throw new Error('笔记版本无法安全恢复。');
              store.put(restored);
            } else store.add(row);
            result[name]++;
          } catch { tx.abort(); }
        };
      }
    }
  });
}
