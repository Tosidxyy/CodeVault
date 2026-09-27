import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import styles from './panel.css?inline';
import libraryStyles from '../components/library.css?inline';
import { ProblemCard } from './ProblemCard';
import { HoverCapture } from './HoverCapture';
import type { CaptureIntent } from '../platforms/editor';
import { SavedProblems } from '../components/SavedProblems';
import { navigationRequest, persistNavigation, useNavigation } from '../navigation/store';
import type { NavigationState } from '../navigation/store';
import { useProblem } from './useProblem';
import { problemStorage } from '../database/client';

function App() {
  const { open, view } = useNavigation();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [intent, setIntent] = useState<CaptureIntent>();
  const current = useProblem(open);
  const lastRoute = useRef<string | undefined>(undefined);
  const change = (patch: Partial<NavigationState>) => {
    useNavigation.setState(patch);
    void persistNavigation().catch((reason: Error) => setError(reason.message));
  };
  useEffect(() => {
    void navigationRequest('get').then((state) => { if (state) useNavigation.setState(state); })
      .catch((reason: Error) => setError(reason.message)).finally(() => setReady(true));
    const receive = (message: { channel?: string; state?: object }, sender: chrome.runtime.MessageSender) => {
      if (sender.id === chrome.runtime.id && message.channel === 'codevault-open' && message.state) useNavigation.setState(message.state);
    };
    chrome.runtime.onMessage.addListener(receive);
    return () => chrome.runtime.onMessage.removeListener(receive);
  }, []);
  const route = current.state.status === 'ready' ? current.state.problem.url : current.state.status === 'loading' ? current.state.url : undefined;
  useEffect(() => {
    if (route && lastRoute.current && route !== lastRoute.current) change({ view: 'detail' });
    if (route) lastRoute.current = route;
  }, [route]);
  const problemId = current.state.status === 'ready' ? current.state.problem.id : undefined;
  useEffect(() => {
    if (!open || view !== 'detail' || !problemId) return;
    const visit = () => { void problemStorage.visit(problemId).then(() => window.dispatchEvent(new Event('codevault-library-changed'))).catch(() => {}); };
    visit();
    // Successful saves already invalidate the library; record newly collected problems as visited.
    const saved = visit;
    window.addEventListener('codevault-data-saved', saved);
    return () => window.removeEventListener('codevault-data-saved', saved);
  }, [open, view, problemId]);
  const close = () => { change({ open: false }); setIntent(undefined); };
  return <div className="vault" onKeyDown={(event) => {
    if (event.key === 'Escape' && open) { event.stopPropagation(); close(); (event.currentTarget.querySelector('.launcher') as HTMLButtonElement)?.focus(); }
  }}>
    {open && <section id="codevault-panel" className="panel" aria-label="CodeVault 面板">
      <header><h2>🚀 CodeVault</h2><div><button className="nav-button" aria-label="设置" onClick={() => void navigationRequest('settings').catch((reason: Error) => setError(reason.message))}>⚙</button><button className="close" aria-label="关闭面板" onClick={close}>×</button></div></header>
      {error && <p role="alert">{error}</p>}
      <div hidden={view !== 'home'}><button className="nav-button current-problem" onClick={() => change({ view: 'detail' })}>查看当前题目 →</button><SavedProblems /></div>
      {view === 'detail' && <><button className="nav-button back" onClick={() => { setIntent(undefined); change({ view: 'home' }); }}>← 返回题库</button><ProblemCard current={current} intent={intent} onIntentHandled={() => setIntent(undefined)} /></>}
      <footer>题目、解法与笔记保存在本机<br />AI 仅在主动发送分析时调用</footer>
    </section>}
    <HoverCapture hidden={open || !ready} onCapture={(next) => { setIntent(next); change({ open: true, view: 'detail' }); }} />
    <button disabled={!ready} className="launcher" aria-label={open ? '收起 CodeVault' : '展开 CodeVault'} aria-expanded={open} aria-controls="codevault-panel" onClick={() => open ? close() : change({ open: true })}>🚀</button>
  </div>;
}
if (!document.getElementById('codevault-root')) {
  const host = document.createElement('div'); host.id = 'codevault-root';
  host.style.cssText = 'all:initial;position:fixed;right:20px;bottom:20px;z-index:2147483647;color-scheme:light;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style'); style.textContent = styles + libraryStyles;
  const container = document.createElement('div'); shadow.append(style, container); document.documentElement.append(host);
  createRoot(container).render(<App />);
}
