import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Brand } from '../components/Brand';
import { AiSettings } from './AiSettings';
import '../styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><main className="settings-shell"><header className="settings-header"><Brand /><a href="https://leetcode.cn/problemset/" target="_blank" rel="noreferrer">打开 LeetCode →</a></header><AiSettings /><p className="settings-footer">CodeVault v0.2.0 · 收藏、解法与笔记保存在本机</p></main></StrictMode>,
);
