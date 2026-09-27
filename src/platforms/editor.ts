import { getProblemRoute } from './leetcode';
import type { Problem } from './types';
import type { StoredSolution } from '../database/types';

export interface CodeSnapshot { code: string; language: string; sourceUrl: string }
export interface CaptureIntent { id: string; target: string; problemUrl: string; snapshot?: CodeSnapshot }

type BridgeResult = { ok: boolean; url: string; code?: unknown; language?: unknown; ticket?: unknown; loaded?: boolean; error?: string };

function requestEditor(problemUrl: string, command: Record<string, unknown>): Promise<BridgeResult> {
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
      resolve(result as BridgeResult);
    };
    const timer = window.setTimeout(() => { cleanup(); reject(new Error('读取编辑器超时，请刷新页面后重试。')); }, 3000);
    window.addEventListener('message', onMessage);
    window.postMessage({ ...command, channel: 'codevault-editor', id, url: sourceUrl, deadline: Date.now() + 3000 }, location.origin);
  });
}

export async function readCode(problemUrl: string, target?: string): Promise<CodeSnapshot> {
  const result = await requestEditor(problemUrl, { type: 'read', target });
  if (typeof result.code !== 'string' || !result.code.trim() || result.code.length > 500000 || typeof result.language !== 'string' || !/^[a-z0-9_+#.-]{1,40}$/i.test(result.language) || result.language === 'plaintext') {
    throw new Error('编辑器返回的代码或语言无效。');
  }
  return { code: result.code, language: result.language, sourceUrl: result.url };
}

export async function loadCode(problem: Problem, solution: StoredSolution, confirm: () => Promise<boolean>): Promise<boolean> {
  if (solution.problemId !== problem.id) throw new Error('解法不属于当前题目，未替换代码。');
  const prepared = await requestEditor(problem.url, { type: 'prepare-load', language: solution.language });
  if (typeof prepared.ticket !== 'string' || !/^[\da-f-]{36}$/i.test(prepared.ticket)) throw new Error('编辑器未准备好，请重试。');
  if (typeof prepared.code !== 'string') throw new Error('无法确认当前编辑器内容，请重试。');
  const normalize = (code: string) => code.replace(/\r\n?/g, '\n');
  if (prepared.code.trim() && normalize(prepared.code) !== normalize(solution.code) && !await confirm()) return false;
  const result = await requestEditor(problem.url, { type: 'load', ticket: prepared.ticket, language: solution.language, code: solution.code });
  if (!result.loaded) throw new Error('未能确认加载结果，请检查编辑器。');
  return true;
}
