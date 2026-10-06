import { trustedSender } from './index';
import { defaultPanelLayout, validatePanelLayout } from '../content/panelGeometry';
const key = 'codevault-panel-layout';
let queue = Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.channel !== 'codevault-panel-layout') return false;
  queue = queue.catch(() => {}).then(async () => {
    if (!trustedSender(sender)) throw new Error('不支持的设置来源。');
    if (message.action === 'get') { const data = (await chrome.storage.local.get(key))[key]; return data ? validatePanelLayout(data) : defaultPanelLayout; }
    if (message.action !== 'set') throw new Error('不支持的浮窗操作。');
    const layout = validatePanelLayout(message.layout);
    await chrome.storage.local.set({ [key]: layout }); return layout;
  }).then(data => respond({ ok: true, data }), () => respond({ ok: false, error: '浮窗位置保存或读取失败，请重试操作。' }));
  return true;
});
