import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Welcome } from '../components/Welcome';
import '../styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><main className="mx-auto max-w-lg p-6"><Welcome /><p className="mt-5 text-sm leading-6 text-neutral-500">CodeVault v0.1.0 · 无需账号。收藏与解法保存在本机，当前不调用 AI。</p></main></StrictMode>,
);
