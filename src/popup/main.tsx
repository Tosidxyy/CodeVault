import { useT, LocaleProvider, LanguageSwitcher } from '../i18n/locale';
import { Brand, Icon } from '../components/Brand';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SavedProblems } from '../components/SavedProblems';
import { navigationRequest, useNavigation } from '../navigation/store';
import '../styles.css';
import '../components/library.css';
function Popup() {
  const t = useT();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    void navigationRequest('get').then((state) => { if (state) useNavigation.setState({ ...state, view: 'home' }); })
      .catch((reason: Error) => setError(reason.message)).finally(() => setReady(true));
  }, []);
  return <main className="popup-shell">
    <header className="popup-header"><h2><Brand /></h2><div className="popup-header-tools"><LanguageSwitcher /><a href="options.html" target="_blank" aria-label={t("设置")}><Icon name="settings" /></a></div></header>
    {t(error) && <p role="alert">{t(error)}</p>}
    {ready ? <SavedProblems /> : <p role="status">{t("正在读取收藏…")}</p>}
    <a className="mt-3 block text-center text-xs text-neutral-600 underline" href="https://leetcode.cn/problemset/" target="_blank" rel="noreferrer">{t("打开 LeetCode")}</a>
  </main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><LocaleProvider><Popup /></LocaleProvider></StrictMode>);
