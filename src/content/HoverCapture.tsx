import { useT } from '../i18n/locale';
import { articleCodeBlock, readArticleCode } from '../platforms/article';
import { useEffect, useState } from 'react';
import { getProblemRoute } from '../platforms/leetcode';
import type { CaptureIntent } from '../platforms/editor';

export function HoverCapture({ hidden, onCapture }: { hidden: boolean; onCapture: (intent: CaptureIntent) => void }) {
  const t = useT();
  const [error, setError] = useState('');
  const [target, setTarget] = useState<{ element: Element; x: number; y: number; url: string } | null>(null);
  useEffect(() => {
    const over = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('#codevault-root')) return;
      setError('');
      const editor = articleCodeBlock(event.target) ?? event.target.closest('.monaco-editor');
      if (!editor || !getProblemRoute(location.href)) { setTarget(null); return; }
      const rect = editor.getBoundingClientRect();
      setTarget({ element: editor, url: location.href, x: Math.max(8, Math.min(innerWidth - 170, rect.right - 166)), y: Math.max(8, rect.top + 8) });
    };
    const clear = () => setTarget(null);
    document.addEventListener('pointerover', over, { passive: true });
    document.addEventListener('scroll', clear, true);
    window.addEventListener('resize', clear);
    return () => { document.removeEventListener('pointerover', over); document.removeEventListener('scroll', clear, true); window.removeEventListener('resize', clear); };
  }, []);
  if (hidden || !target?.element.isConnected || !getProblemRoute(location.href)) return null;
  return <><button title={t(error) || undefined} className="capture-hover" style={{ left: target.x, top: target.y }} onClick={() => {
    const route = getProblemRoute(location.href);
    if (!route || target.url !== location.href) { setTarget(null); return; }
    if (target.element instanceof HTMLElement && articleCodeBlock(target.element)) {
      try { onCapture({ id: crypto.randomUUID(), target: '', problemUrl: route.url, snapshot: readArticleCode(target.element) }); setTarget(null); }
      catch (reason) { setError((reason as Error).message); }
      return;
    }
    const token = crypto.randomUUID();
    target.element.setAttribute('data-codevault-editor', token);
    onCapture({ id: crypto.randomUUID(), target: token, problemUrl: route.url });
    setTarget(null);
  }}>{t(error) || t('🚀 添加至 CodeVault')}</button></>;
}
