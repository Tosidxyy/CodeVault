import { migrateMarkdown } from './noteBlocks';
import type { Problem } from '../platforms/types';
import type { StoredProblem } from './types';

let connection: Promise<IDBDatabase> | undefined;
export class ProblemTrashedError extends Error { constructor() { super('题目已移入回收站，请先恢复题目；永久删除后需重新收藏。'); } }

export function openDatabase(): Promise<IDBDatabase> {
  if (connection) return connection;
  connection = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('codevault', 5);
    let blocked = false;
    request.onupgradeneeded = (event) => {
      if (event.oldVersion < 1) {
        const store = request.result.createObjectStore('problems', { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
      if (event.oldVersion < 2) {
        const store = request.result.createObjectStore('solutions', { keyPath: 'id' });
        store.createIndex('problemId', 'problemId');
      }
      if (event.oldVersion < 3) request.result.createObjectStore('notes', { keyPath: 'problemId' });
      if (event.oldVersion < 5) {
        const cursor = request.transaction!.objectStore('notes').openCursor();
        cursor.onsuccess = () => {
          const row = cursor.result;
          if (!row) return;
          const note = row.value;
          if (!note.blocks) row.update({ ...note, blocks: migrateMarkdown(note.markdown ?? '', note.images ?? {}), legacy: { markdown: note.markdown ?? '', images: note.images ?? {} } });
          row.continue();
        };
      }
      if (event.oldVersion < 4) {
        const cursor = request.transaction!.objectStore('problems').openCursor();
        cursor.onsuccess = () => {
          const row = cursor.result;
          if (!row) return;
          row.update({ ...row.value, favoriteAt: row.value.favoriteAt ?? row.value.createdAt, lastOpenedAt: row.value.lastOpenedAt ?? null });
          row.continue();
        };
      }
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error('Database upgrade blocked')); };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) { db.close(); return; }
      db.onversionchange = () => { db.close(); connection = undefined; };
      db.onclose = () => { connection = undefined; };
      resolve(db);
    };
  }).catch((error: unknown) => { connection = undefined; throw error; });
  return connection;
}

async function transaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore, result: (value: T) => void, abort: (error: Error) => void) => void): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction('problems', mode);
    let value: T;
    let failure: Error | undefined;
    tx.oncomplete = () => resolve(value);
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('Transaction aborted'));
    tx.onerror = () => { /* The default error action aborts the transaction. */ };
    try { work(tx.objectStore('problems'), (result) => { value = result; }, error => { failure = error; tx.abort(); }); }
    catch (error) { tx.abort(); reject(error); }
  });
}

export function getProblem(id: string): Promise<StoredProblem | null> {
  return transaction('readonly', (store, result) => {
    const request = store.get(id);
    request.onsuccess = () => result(request.result?.purged ? null : request.result ?? null);
  });
}

export function listProblems(): Promise<StoredProblem[]> {
  return transaction('readonly', (store, result) => {
    const items: StoredProblem[] = [];
    const request = store.index('updatedAt').openCursor(null, 'prev');
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) { if (!cursor.value.deletedAt) items.push(cursor.value as StoredProblem); cursor.continue(); }
      else result(items);
    };
  });
}

export function saveProblem(problem: Problem): Promise<StoredProblem> {
  return transaction('readwrite', (store, result, abort) => {
    const read = store.get(problem.id);
    read.onsuccess = () => {
      const previous = read.result as StoredProblem | undefined;
      if (previous?.deletedAt && !previous.purged) { abort(new ProblemTrashedError()); return; }
      const now = Date.now();
      const item = { ...problem, favoriteAt: previous?.favoriteAt ?? previous?.createdAt ?? now, lastOpenedAt: previous?.lastOpenedAt ?? null, createdAt: previous?.createdAt ?? now, updatedAt: Math.max(now, (previous?.updatedAt ?? 0) + 1) };
      try {
        store.put(item);
        result(item);
      } catch {
        // Exceptions inside IDB callbacks must abort, never report a saved row.
        store.transaction.abort();
      }
    };
  });
}

export function visitProblem(id: string): Promise<StoredProblem | null> {
  return transaction('readwrite', (store, result) => {
    const request = store.get(id);
    request.onsuccess = () => {
      if (!request.result || request.result.deletedAt) { result(null); return; }
      const item = { ...request.result, lastOpenedAt: Date.now() };
      store.put(item);
      result(item);
    };
  });
}
