import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent, KeyboardEvent } from 'react';
import { clampPanelLayout, defaultPanelLayout, validatePanelLayout } from './panelGeometry';
import type { PanelLayout } from './panelGeometry';

async function request(action: 'get' | 'set', layout?: PanelLayout): Promise<PanelLayout> {
  const reply = await chrome.runtime.sendMessage({ channel: 'codevault-panel-layout', action, layout });
  if (!reply?.ok) throw new Error(reply?.error || '无法连接浮窗设置。');
  return validatePanelLayout(reply.data);
}
export function usePanelLayout(open: boolean) {
  const root = useRef<HTMLDivElement>(null);
  const current = useRef<PanelLayout>({ ...defaultPanelLayout });
  const [layout, setLayout] = useState<PanelLayout>(current.current);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const drag = useRef<{ id: number; x: number; y: number; start: PanelLayout } | undefined>(undefined);
  const saving = useRef(Promise.resolve());
  const frame = useRef<number | undefined>(undefined);
  const clamp = (value: PanelLayout) => {
    const bounds = root.current?.getBoundingClientRect();
    return bounds ? clampPanelLayout(value, bounds.width, bounds.height, innerWidth, innerHeight) : value;
  };
  const apply = (value: PanelLayout) => {
    const next = clamp(value); current.current = next;
    const host = root.current?.getRootNode();
    if (host instanceof ShadowRoot && host.host instanceof HTMLElement) {
      host.host.style.right = `${next.right}px`; host.host.style.bottom = `${next.bottom}px`;
    }
    return next;
  };
  const persist = (value: PanelLayout) => {
    saving.current = saving.current.catch(() => {}).then(async () => {
      try { await request('set', value); if (alive.current) setError(''); }
      catch (reason) { if (alive.current) setError((reason as Error).message); }
    });
  };
  const commit = (value: PanelLayout) => { const next = apply(value); setLayout(next); persist(next); };
  useEffect(() => {
    alive.current = true;
    void request('get').then(value => { if (alive.current) { current.current = value; setLayout(value); } })
      .catch((reason: Error) => { if (alive.current) setError(reason.message); }).finally(() => { if (alive.current) setReady(true); });
    return () => { alive.current = false; if (frame.current !== undefined) cancelAnimationFrame(frame.current); };
  }, []);
  useLayoutEffect(() => {
    const before = current.current, corrected = apply(before);
    if (ready && (corrected.right !== before.right || corrected.bottom !== before.bottom)) persist(corrected);
  }, [layout, open, ready]);
  useEffect(() => {
    const correct = () => { if (drag.current) return; const before = current.current, next = apply(before); if (ready && (next.right !== before.right || next.bottom !== before.bottom)) { setLayout(next); persist(next); } };
    const observer = new ResizeObserver(correct); if (root.current) observer.observe(root.current);
    window.addEventListener('resize', correct);
    return () => { observer.disconnect(); window.removeEventListener('resize', correct); };
  }, [ready]);
  const cancelDrag = () => {
    if (!drag.current) return false;
    const start = drag.current.start; drag.current = undefined;
    if (frame.current !== undefined) { cancelAnimationFrame(frame.current); frame.current = undefined; }
    const next = apply(start); setLayout(next);
    if (next.right !== start.right || next.bottom !== start.bottom) persist(next);
    return true;
  };
  const pointerDown = (event: PointerEvent<HTMLElement>) => {
    if (!ready || event.button !== 0 || !event.isPrimary || drag.current || (event.target as Element).closest('button,a,input,select')) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, start: { ...current.current } };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent<HTMLElement>) => {
    const moving = drag.current; if (!moving || moving.id !== event.pointerId) return;
    const x = event.clientX, y = event.clientY;
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => { frame.current = undefined; if (drag.current === moving) apply({ ...moving.start, right: moving.start.right - x + moving.x, bottom: moving.start.bottom - y + moving.y }); });
  };
  const pointerUp = (event: PointerEvent<HTMLElement>) => {
    const moving = drag.current; if (!moving || moving.id !== event.pointerId) return;
    if (frame.current !== undefined) { cancelAnimationFrame(frame.current); frame.current = undefined; }
    drag.current = undefined;
    commit({ ...moving.start, right: moving.start.right - event.clientX + moving.x, bottom: moving.start.bottom - event.clientY + moving.y });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const keyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && cancelDrag()) { event.preventDefault(); event.stopPropagation(); return; }
    if (!ready || event.target !== event.currentTarget || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); const step = event.shiftKey ? 40 : 10;
    commit({ ...current.current, right: current.current.right + (event.key === 'ArrowLeft' ? step : event.key === 'ArrowRight' ? -step : 0),
      bottom: current.current.bottom + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0) });
  };
  return { root, expanded: layout.expanded, ready, error,
    toggle: () => commit({ ...current.current, expanded: !current.current.expanded }),
    reset: () => commit({ ...defaultPanelLayout }),
    handlers: { onPointerDown: pointerDown, onPointerMove: pointerMove, onPointerUp: pointerUp, onPointerCancel: cancelDrag, onLostPointerCapture: cancelDrag, onKeyDown: keyDown } };
}
