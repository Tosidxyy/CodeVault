export function Icon({ name }: { name: 'settings' | 'close' | 'back' | 'expand' | 'compact' }) {
  const paths = { settings: 'M10 2h4l.6 2.8 2.2 1.3 2.7-.9 2 3.5-2.1 1.9v2.6l2.1 1.9-2 3.5-2.7-.9-2.2 1.3L14 22h-4l-.6-2.8-2.2-1.3-2.7.9-2-3.5 2.1-1.9v-2.6L2.5 8.9l2-3.5 2.7.9 2.2-1.3L10 2z M15.5 12a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0', close: 'm6 6 12 12M6 18 18 6', back: 'm12 5-7 7 7 7M5 12h14' };
  const sizing = { expand: 'M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5', compact: 'M3 8h5V3M21 8h-5V3M16 21v-5h5M8 21v-5H3' };
  return <svg className="cv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={name === 'expand' || name === 'compact' ? sizing[name] : paths[name]} /></svg>;
}
export function Brand() { return <span className="cv-brand"><img className="cv-mark" src={typeof chrome !== 'undefined' && chrome.runtime?.id ? chrome.runtime.getURL('icons/icon-128.png') : '/icons/icon-128.png'} alt="" />CodeVault</span>; }
