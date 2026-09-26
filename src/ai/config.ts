import type { AiConfig, AiStatus } from './types';

async function configTransaction(write: boolean, value?: AiConfig | null): Promise<AiConfig | null> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('codevault-settings', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('settings');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('无法打开 AI 配置。'));
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('settings', write ? 'readwrite' : 'readonly');
      const store = tx.objectStore('settings');
      const request = write ? value ? store.put(value, 'ai') : store.delete('ai') : store.get('ai');
      tx.oncomplete = () => resolve(write ? value ?? null : request.result ?? null);
      tx.onabort = () => reject(new Error('AI 配置保存或读取失败，请重试。'));
    });
  } finally { db.close(); }
}
export const getConfig = () => configTransaction(false);
export const setConfig = (value: AiConfig | null) => configTransaction(true, value);
export function publicConfig(value: AiConfig | null): AiStatus | null {
  return value ? { endpoint: value.endpoint, model: value.model, revision: value.revision } : null;
}
