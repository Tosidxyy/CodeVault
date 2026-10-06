import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { create } from 'zustand';
import { browserLocale, translate } from './translate';
import type { Locale } from './translate';
const key = 'codevault-ui-locale';
const initial = browserLocale(typeof navigator === 'undefined' ? 'en' : navigator.language);
let generation = 0;
export const useLocale = create<{ locale: Locale; error: '' | 'read' | 'save' }>(() => ({ locale: initial, error: '' }));
export const getLocale = () => useLocale.getState().locale;
export function useT() { const locale = useLocale(state => state.locale); return (value: string | undefined) => translate(value, locale); }
export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useLocale(state => state.locale);
  useEffect(() => {
    if (location.protocol !== 'chrome-extension:') return;
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    if (location.pathname.endsWith('/options.html')) document.title = locale === 'en' ? 'CodeVault settings' : 'CodeVault 设置';
  }, [locale]);
  useEffect(() => {
    let alive = true;
    const readingGeneration = generation;
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    void chrome.storage.local.get(key).then(data => { if (alive && generation === readingGeneration && (data[key] === 'zh' || data[key] === 'en')) useLocale.setState({ locale: data[key] }); }).catch(() => { if (alive) useLocale.setState({ error: 'read' }); });
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      const value = changes[key]?.newValue; if (area === 'local' && (value === 'zh' || value === 'en')) { generation++; useLocale.setState({ locale: value }); }
    };
    chrome.storage.onChanged.addListener(changed);
    return () => { alive = false; chrome.storage.onChanged.removeListener(changed); };
  }, []);
  return <div lang={locale === 'zh' ? 'zh-CN' : 'en'}>{children}</div>;
}
export function LanguageSwitcher() {
  const locale = useLocale(state => state.locale), error = useLocale(state => state.error);
  async function change() {
    const next = locale === 'zh' ? 'en' : 'zh';
    generation++;
    try { if (typeof chrome !== 'undefined' && chrome.storage?.local) await chrome.storage.local.set({ [key]: next }); useLocale.setState({ locale: next, error: '' }); }
    catch { useLocale.setState({ error: 'save' }); }
  }
  return <><button className="locale-switch" type="button" aria-label="English / 中文" onClick={() => void change()}>{locale === 'zh' ? 'English' : '中文'}</button>{error && <span role="alert">{translate(error === 'read' ? '无法读取语言偏好。' : '无法保存语言偏好。', locale)}</span>}</>;
}
