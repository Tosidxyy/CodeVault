import { useT, LocaleProvider, LanguageSwitcher } from '../i18n/locale';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Brand } from '../components/Brand';
import { AiSettings } from './AiSettings';
import { DataSettings } from './DataSettings';
import '../styles.css';

function Options() {
  const t = useT(); return <main className="settings-shell"><header className="settings-header"><Brand /><LanguageSwitcher /><a href="https://leetcode.cn/problemset/" target="_blank" rel="noreferrer">{t("打开 LeetCode →")}</a></header><AiSettings /><DataSettings /><p className="settings-footer">{t("CodeVault v0.3.0 · 收藏、解法与笔记保存在本机")}</p></main>; }
createRoot(document.getElementById('root')!).render(<StrictMode><LocaleProvider><Options /></LocaleProvider></StrictMode>);
