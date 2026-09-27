import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Welcome } from '../components/Welcome';
import { AiSettings } from './AiSettings';
import '../styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><main className="settings-shell"><Welcome /><AiSettings /><p className="mt-5 text-sm leading-6 text-neutral-500">CodeVault v0.1.0 · 收藏、解法与笔记保存在本机，AI 仅在主动测试或分析时调用。</p></main></StrictMode>,
);
