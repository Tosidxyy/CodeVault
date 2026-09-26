import { getProblemRoute } from './leetcode';

export interface CodeSnapshot { code: string; language: string; sourceUrl: string }
export interface CaptureIntent { id: string; target: string; problemUrl: string }

export function readCode(problemUrl: string, target?: string): Promise<CodeSnapshot> {
  const sourceUrl = location.href;
  if (getProblemRoute(sourceUrl)?.url !== problemUrl) return Promise.reject(new Error('题目已切换，请重新读取代码。'));
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const cleanup = () => { clearTimeout(timer); window.removeEventListener('message', onMessage); };
    const onMessage = (event: MessageEvent) => {
      const result = event.data;
      if (event.source !== window || event.origin !== location.origin || result?.channel !== 'codevault-editor' || result.type !== 'result' || result.id !== id) return;
      cleanup();
      if (getProblemRoute(location.href)?.url !== problemUrl || (result.url !== sourceUrl && result.ok)) { reject(new Error('题目已切换，请重新读取代码。')); return; }
      if (!result.ok) { reject(new Error(typeof result.error === 'string' ? result.error.slice(0,200) : '读取代码失败。')); return; }
      if (typeof result.code !== 'string' || !result.code.trim() || result.code.length > 500000 || typeof result.language !== 'string' || !/^[a-z0-9_+#.-]{1,40}$/i.test(result.language) || result.language === 'plaintext') {
        reject(new Error('编辑器返回的代码或语言无效。')); return;
      }
      resolve({ code: result.code, language: result.language, sourceUrl });
    };
    const timer = window.setTimeout(() => { cleanup(); reject(new Error('读取编辑器超时，请刷新页面后重试。')); }, 3000);
    window.addEventListener('message', onMessage);
    window.postMessage({ channel: 'codevault-editor', type: 'read', id, url: sourceUrl, target }, location.origin);
  });
}
