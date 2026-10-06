import { trustedSender } from './index';
import { getProblem } from '../database/problems';
import { validProblemId } from '../database/validation';
import type { NavigationState } from '../navigation/store';
const key = (id?: number) => `navigation:${id ?? 'popup'}`;
function stateOf(value: unknown): NavigationState {
  const state = value as NavigationState;
  if (!state || typeof state.open !== 'boolean' || !['home', 'detail'].includes(state.view) || typeof state.query !== 'string' || state.query.length > 500 || !Number.isFinite(state.scroll) || state.scroll < 0) throw new Error('Invalid state');
  return { open: state.open, view: state.view, query: state.query, scroll: Math.min(state.scroll, 10000000) };
}
let queue = Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.channel !== 'codevault-navigation') return false;
  queue = queue.catch(() => {}).then(async () => {
    if (!trustedSender(sender)) throw new Error('Invalid sender');
    const ownKey = key(sender.tab?.id);
    if (message.action === 'get') return (await chrome.storage.session.get(ownKey))[ownKey] ?? null;
    if (message.action === 'set') { await chrome.storage.session.set({ [ownKey]: stateOf(message.state) }); return null; }
    if (message.action === 'settings') { await chrome.runtime.openOptionsPage(); return null; }
    if (message.action !== 'navigate' || !validProblemId(message.id)) throw new Error('Invalid action');
    const problem = await getProblem(message.id);
    if (!problem || problem.deletedAt) throw new Error('Missing problem');
    const state = { ...stateOf(message.state), open: true, view: 'detail' };
    const tabs = await chrome.tabs.query({ url: ['https://leetcode.cn/*', 'https://leetcode.com/*'] });
    const currentWindow = await chrome.windows.getLastFocused();
    const target = tabs.find((tab) => tab.id === sender.tab?.id) ?? tabs.find((tab) => tab.active && tab.windowId === currentWindow.id) ?? tabs.find((tab) => tab.windowId === currentWindow.id) ?? tabs[0] ?? await chrome.tabs.create({ url: 'about:blank' });
    if (target.id === undefined) throw new Error('Missing tab');
    await chrome.storage.session.set({ [key(target.id)]: state });
    if (target.url === problem.url) {
      try { await chrome.tabs.sendMessage(target.id, { channel: 'codevault-open', state }); }
      catch { await chrome.tabs.reload(target.id); }
      await chrome.tabs.update(target.id, { active: true });
    } else await chrome.tabs.update(target.id, { url: problem.url, active: true });
    await chrome.windows.update(target.windowId, { focused: true });
    return null;
  }).then((data) => respond({ ok: true, data }), () => respond({ ok: false, error: '无法打开题目或恢复导航，请重试。' }));
  return true;
});
chrome.tabs.onRemoved.addListener((id) => { void chrome.storage.session.remove(key(id)); });
