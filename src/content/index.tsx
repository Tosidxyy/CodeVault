import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import styles from './panel.css?inline';
import { ProblemCard } from './ProblemCard';
import { HoverCapture } from './HoverCapture';
import type { CaptureIntent } from '../platforms/editor';

function App() {
  const [open, setOpen] = useState(false);
  const [intent, setIntent] = useState<CaptureIntent>();
  const close = () => { setOpen(false); setIntent(undefined); };
  return <div className="vault" onKeyDown={(event) => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation();
      close();
      (event.currentTarget.querySelector('.launcher') as HTMLButtonElement)?.focus();
    }
  }}>
    {open && <section id="codevault-panel" className="panel" aria-label="CodeVault 面板">
      <header><h2>🚀 CodeVault</h2><button className="close" aria-label="关闭面板" onClick={close}>×</button></header>
      <p className="subtitle">把每一次思考，留给下一次进步。</p>
      <ProblemCard intent={intent} onIntentHandled={() => setIntent(undefined)} />
      <footer>题目、解法与笔记保存在本机<br />AI 分析开发中</footer>
    </section>}
    <HoverCapture hidden={open} onCapture={(next) => { setIntent(next); setOpen(true); }} />
    <button className="launcher" aria-label={open ? '收起 CodeVault' : '展开 CodeVault'} aria-expanded={open} aria-controls="codevault-panel" onClick={() => open ? close() : setOpen(true)}>🚀</button>
  </div>;
}

if (!document.getElementById('codevault-root')) {
  const host = document.createElement('div');
  host.id = 'codevault-root';
  // Isolate extension layout and styles from the host page.
  host.style.cssText = 'all:initial;position:fixed;right:20px;bottom:20px;z-index:2147483647;color-scheme:light;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = styles;
  const container = document.createElement('div');
  shadow.append(style, container);
  document.documentElement.append(host);
  createRoot(container).render(<App />);
}
