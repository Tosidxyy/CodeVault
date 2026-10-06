import { openDatabase } from './problems';
import { textBlock } from './noteBlocks';
import type { StoredProblem } from './types';

export class TrashConflictError extends Error {}
export async function changeTrash(id: string, action: 'trash' | 'restore' | 'purge', token?: string): Promise<StoredProblem | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['problems', 'solutions', 'notes'], 'readwrite');
    const problems = tx.objectStore('problems');
    let result: StoredProblem | null = null, failure: Error | undefined;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('回收站操作失败，原有内容保留。'));
    const abort = (message: string) => { failure = new TrashConflictError(message); tx.abort(); };
    const request = problems.get(id);
    request.onsuccess = () => {
      try {
        const row = request.result as StoredProblem | undefined;
        if (!row || row.purged) { abort('题目已不存在或已永久删除，请刷新列表。'); return; }
        if (action === 'trash') {
          if (row.deletedAt) { abort('题目已在回收站，请刷新列表。'); return; }
          result = { ...row, deletedAt: Date.now(), trashToken: crypto.randomUUID() }; problems.put(result); return;
        }
        if (!row.deletedAt || row.trashToken !== token) { abort('回收站记录已变化，请刷新后重试；不会覆盖当前题目。'); return; }
        if (action === 'restore') {
          const { deletedAt: _date, trashToken: _token, ...restored } = row;
          result = restored; problems.put(restored); return;
        }
        const notes = tx.objectStore('notes'), oldNote = notes.get(id);
        oldNote.onsuccess = () => {
          const revision = (oldNote.result?.revision ?? 0) + 1;
          if (!Number.isSafeInteger(revision) || revision >= Number.MAX_SAFE_INTEGER) { abort('笔记版本无法安全清除，请先导出备份。'); return; }
          try { notes.put({ problemId: id, blocks: [textBlock()], markdown: '', images: {}, revision, updatedAt: Date.now(), purged: true }); } catch { tx.abort(); }
        };
        const solutions = tx.objectStore('solutions'), cursor = solutions.index('problemId').openCursor(IDBKeyRange.only(id));
        cursor.onsuccess = () => { try { const item = cursor.result; if (item) { item.delete(); item.continue(); } } catch { tx.abort(); } };
        problems.put({ id, deletedAt: row.deletedAt, trashToken: token, purged: true });
      } catch { tx.abort(); }
    };
  });
}
