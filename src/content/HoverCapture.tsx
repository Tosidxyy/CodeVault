import { useEffect, useState } from 'react';
import { getProblemRoute } from '../platforms/leetcode';
import type { CaptureIntent } from '../platforms/editor';

export function HoverCapture({ hidden, onCapture }: { hidden: boolean; onCapture: (intent: CaptureIntent) => void }) {
  const [target, setTarget] = useState<{ element: Element; x: number; y: number } | null>(null);
  useEffect(() => {
    const over = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('#codevault-root')) return;
      const editor = event.target.closest('.monaco-editor');
      if (!editor || !getProblemRoute(location.href)) { setTarget(null); return; }
      const rect = editor.getBoundingClientRect();
      setTarget({ element: editor, x: Math.max(8, Math.min(innerWidth - 170, rect.right - 166)), y: Math.max(8, rect.top + 8) });
    };
    const clear = () => setTarget(null);
    document.addEventListener('pointerover', over, { passive: true });
    document.addEventListener('scroll', clear, true);
    window.addEventListener('resize', clear);
    return () => { document.removeEventListener('pointerover', over); document.removeEventListener('scroll', clear, true); window.removeEventListener('resize', clear); };
  }, []);
  if (hidden || !target?.element.isConnected || !getProblemRoute(location.href)) return null;
  return <button className="capture-hover" style={{ left: target.x, top: target.y }} onClick={() => {
    const route = getProblemRoute(location.href);
    if (!route) return;
    const token = crypto.randomUUID();
    target.element.setAttribute('data-codevault-editor', token);
    onCapture({ id: crypto.randomUUID(), target: token, problemUrl: route.url });
    setTarget(null);
  }}>🚀 添加至 CodeVault</button>;
}
