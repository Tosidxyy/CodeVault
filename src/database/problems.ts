import type { Problem } from '../platforms/types';
import type { StoredProblem } from './types';

let connection: Promise<IDBDatabase> | undefined;

export function openDatabase(): Promise<IDBDatabase> {
  if (connection) return connection;
  connection = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('codevault', 4);
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

async function transaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction('problems', mode);
    let value: T;
    tx.oncomplete = () => resolve(value);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
    tx.onerror = () => { /* The default error action aborts the transaction. */ };
    try { work(tx.objectStore('problems'), (result) => { value = result; }); }
    catch (error) { tx.abort(); reject(error); }
  });
}

export function getProblem(id: string): Promise<StoredProblem | null> {
  return transaction('readonly', (store, result) => {
    const request = store.get(id);
    request.onsuccess = () => result(request.result ?? null);
  });
}

export function listProblems(): Promise<StoredProblem[]> {
  return transaction('readonly', (store, result) => {
    const items: StoredProblem[] = [];
    const request = store.index('updatedAt').openCursor(null, 'prev');
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) { items.push(cursor.value as StoredProblem); cursor.continue(); }
      else result(items);
    };
  });
}

export function saveProblem(problem: Problem): Promise<StoredProblem> {
  return transaction('readwrite', (store, result) => {
    const read = store.get(problem.id);
    read.onsuccess = () => {
      const previous = read.result as StoredProblem | undefined;
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
      if (!request.result) { result(null); return; }
      const item = { ...request.result, lastOpenedAt: Date.now() };
      store.put(item);
      result(item);
    };
  });
}
