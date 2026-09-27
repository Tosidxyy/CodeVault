import { getProblemRoute } from './leetcode';
import type { CodeSnapshot } from './editor';

export function articleCodeBlock(element: Element): HTMLElement | null {
  if (!getProblemRoute(location.href) || !/\/solutions?\//.test(location.pathname)) return null;
  if (element.closest('.monaco-editor, #codevault-root')) return null;
  const pre = element.closest('pre');
  return pre instanceof HTMLElement && pre.querySelector('code') ? pre : null;
}

export function readArticleCode(pre: HTMLElement): CodeSnapshot {
  if (!pre.isConnected || articleCodeBlock(pre) !== pre) throw new Error('代码块已变化，请重新选择。');
  const element = pre.querySelector('code')!;
  const code = element.textContent ?? '';
  if (!code.trim() || code.length > 500000) throw new Error('代码块为空或超过50万字符。');
  const hint = element.getAttribute('data-language') ?? pre.getAttribute('data-language') ??
    /(?:language|lang)-([\w+#.-]+)/i.exec(`${element.className} ${pre.className}`)?.[1] ?? '';
  const aliases: Record<string, string> = { python3: 'python', py: 'python', 'c++': 'cpp', 'c#': 'csharp', js: 'javascript', ts: 'typescript', golang: 'go' };
  const value = hint.toLowerCase();
  const language = aliases[value] ?? value;
  return { code, language: /^[a-z0-9_+#.-]{1,40}$/.test(language) ? language : 'plaintext', sourceUrl: location.href };
}
