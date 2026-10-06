export function Icon({ name }: { name: 'settings' | 'close' | 'back' }) {
  const paths = { settings: 'M10 2h4l.6 2.8 2.2 1.3 2.7-.9 2 3.5-2.1 1.9v2.6l2.1 1.9-2 3.5-2.7-.9-2.2 1.3L14 22h-4l-.6-2.8-2.2-1.3-2.7.9-2-3.5 2.1-1.9v-2.6L2.5 8.9l2-3.5 2.7.9 2.2-1.3L10 2z M15.5 12a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0', close: 'm6 6 12 12M6 18 18 6', back: 'm12 5-7 7 7 7M5 12h14' };
  return <svg className="cv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
export function Brand() { return <span className="cv-brand"><img className="cv-mark" src={typeof chrome !== 'undefined' && chrome.runtime?.id ? chrome.runtime.getURL('icons/icon-128.png') : '/icons/icon-128.png'} alt="" />CodeVault</span>; }
