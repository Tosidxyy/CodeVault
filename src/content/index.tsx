import { useT, LocaleProvider, LanguageSwitcher } from '../i18n/locale';
import themeStyles from '../components/theme.css?inline';
import { Brand, Icon } from '../components/Brand';
import { getProblemRoute } from '../platforms/leetcode';
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
import { usePanelLayout } from './usePanelLayout';

function App() {
  const t = useT();
  const { open, view } = useNavigation();
  const panelLayout = usePanelLayout(open);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [intent, setIntent] = useState<CaptureIntent>();
  const current = useProblem(open);
  const lastRoute = useRef<string | undefined>(getProblemRoute(location.href)?.url ?? location.href);
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
    else if (open) lastRoute.current = location.href;
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
  return <div ref={panelLayout.root} className="vault" onKeyDown={(event) => {
    if (event.key === 'Escape' && open) { event.stopPropagation(); close(); (event.currentTarget.querySelector('.launcher') as HTMLButtonElement)?.focus(); }
  }}>
    {open && <section id="codevault-panel" className={`panel${panelLayout.expanded ? ' panel-expanded' : ''}`} aria-label={t("CodeVault 面板")}>
      <header className="panel-header" tabIndex={0} aria-label={t("浮窗移动区域")} title={t("拖动标题栏移动；聚焦后方向键移动，Shift加速")} {...panelLayout.handlers}>{view === 'detail' && <button className="nav-button back" aria-label={t("← 返回题库")} title={t("返回题库")} onClick={() => { setIntent(undefined); change({ view: 'home' }); }}><Icon name="back" /></button>}<h2><Brand /></h2><div className="header-actions"><button className="nav-button" disabled={!panelLayout.ready} aria-label={panelLayout.expanded ? t('切换紧凑浮窗') : t('展开浮窗')} title={panelLayout.expanded ? t('紧凑模式') : t('展开模式')} onClick={panelLayout.toggle}><Icon name={panelLayout.expanded ? 'compact' : 'expand'} /></button><button className="nav-button" aria-label={t("设置")} onClick={() => void navigationRequest('settings').catch((reason: Error) => setError(reason.message))}><Icon name="settings" /></button><button className="close" aria-label={t("关闭面板")} onClick={close}><Icon name="close" /></button></div></header>
      {t(error) && <p role="alert">{t(error)}</p>}
      {t(panelLayout.error) && <p role="alert">{t(panelLayout.error)}</p>}
      <div hidden={view !== 'home'}><SavedProblems currentProblem={current.state.status === 'ready' ? current.state.problem : undefined} onOpenCurrent={() => change({ view: 'detail' })} /></div>
      {view === 'detail' && <><ProblemCard current={current} intent={intent} onIntentHandled={() => setIntent(undefined)} /></>}
      <footer>{t("题目、解法与笔记保存在本机")}<br />{t("AI 仅在主动测试或分析时调用")}</footer>
      <button className="secondary layout-reset" disabled={!panelLayout.ready} onClick={panelLayout.reset}>{t("恢复默认位置和大小")}</button>
      <LanguageSwitcher />
    </section>}
    <HoverCapture hidden={open || !ready} onCapture={(next) => { setIntent(next); change({ open: true, view: 'detail' }); }} />
    <button disabled={!ready || !panelLayout.ready} className="launcher" title={t("点击打开；拖动图标移动位置")} {...panelLayout.launcherHandlers} aria-label={open ? t('收起 CodeVault') : t('展开 CodeVault')} aria-expanded={open} aria-controls="codevault-panel" onClick={event => { if (!panelLayout.consumeLauncherClick(event.detail === 0)) { if (open) close(); else change({ open: true }); } }}><img draggable={false} src={chrome.runtime.getURL('icons/icon-128.png')} alt="" /></button>
  </div>;
}
if (!document.getElementById('codevault-root')) {
  const host = document.createElement('div'); host.id = 'codevault-root';
  host.style.cssText = 'all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647;color-scheme:light;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style'); style.textContent = themeStyles + styles + libraryStyles;
  const container = document.createElement('div'); shadow.append(style, container); document.documentElement.append(host);
  createRoot(container).render(<LocaleProvider><App /></LocaleProvider>);
}
