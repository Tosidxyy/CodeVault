export function Icon({ name }: { name: 'settings' | 'close' | 'back' }) {
  const paths = { settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17m10-10 1.4-1.4', close: 'm6 6 12 12M6 18 18 6', back: 'm12 5-7 7 7 7M5 12h14' };
  return <svg className="cv-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
export function Brand() { return <span className="cv-brand"><img className="cv-mark" src={typeof chrome !== 'undefined' && chrome.runtime?.id ? chrome.runtime.getURL('icons/icon-128.png') : '/icons/icon-128.png'} alt="" />CodeVault</span>; }
