import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import styles from './panel.css?inline';
import { ProblemCard } from './ProblemCard';

function App() {
  const [open, setOpen] = useState(false);
  return <div className="vault" onKeyDown={(event) => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation();
      setOpen(false);
      (event.currentTarget.querySelector('.launcher') as HTMLButtonElement)?.focus();
    }
  }}>
    {open && <section id="codevault-panel" className="panel" aria-label="CodeVault 面板">
      <header><h2>🚀 CodeVault</h2><button className="close" aria-label="关闭面板" onClick={() => setOpen(false)}>×</button></header>
      <p className="subtitle">把每一次思考，留给下一次进步。</p>
      <ProblemCard />
      <div className="card"><strong>我的解法</strong><p>未来可在这里保存、整理并加载你的解法。</p></div>
      <footer>本地知识库 · 笔记 · AI 分析<br />功能开发中</footer>
    </section>}
    <button className="launcher" aria-label={open ? '收起 CodeVault' : '展开 CodeVault'} aria-expanded={open} aria-controls="codevault-panel" onClick={() => setOpen(!open)}>🚀</button>
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
