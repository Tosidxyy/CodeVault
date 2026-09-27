import { getConfig, publicConfig, setConfig } from './config';
import { permissionOrigin, validateConfig } from './types';
import { validateProblem } from '../database/validation';
import { analyzeCode, testConnection } from './provider';

function trusted(sender?: chrome.runtime.MessageSender): boolean {
  if (sender?.id !== chrome.runtime.id || !sender.url) return false;
  if (sender.url.startsWith(chrome.runtime.getURL(''))) return true;
  try { const url = new URL(sender.url); return sender.frameId === 0 && url.protocol === 'https:' && ['leetcode.cn', 'leetcode.com'].includes(url.host); } catch { return false; }
}
const active = new Set<AbortController>();

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.channel !== 'codevault-ai') return false;
  void (async () => {
    if (!trusted(sender)) throw new Error('不支持的请求来源。');
    if (message.action === 'status') return publicConfig(await getConfig());
    if (message.action === 'options') { await chrome.runtime.openOptionsPage(); return null; }
    if (sender.url !== chrome.runtime.getURL('options.html')) throw new Error('请在扩展设置页修改 AI 配置。');
    if (message.action === 'test') {
      const saved = await getConfig();
      const config = message.config?.savedRevision
        ? saved && saved.revision === message.config.savedRevision ? saved : null
        : { ...validateConfig(message.config), revision: 'test' };
      if (!config) throw new Error('AI 配置已变化，请刷新设置页后重试。');
      if (!await chrome.permissions.contains({ origins: [permissionOrigin(config.endpoint)] })) throw new Error('未获得接口站点权限。');
      const controller = new AbortController();
      active.add(controller);
      const timer = setTimeout(() => controller.abort(), 25000);
      try { await testConnection(config, controller.signal); return null; }
      catch (error) { throw new Error(controller.signal.aborted ? '连接测试已取消或超时，请重试。' : (error as Error).message); }
      finally { clearTimeout(timer); active.delete(controller); }
    }
    if (message.action === 'save') {
      const config = validateConfig(message.config);
      if (!await chrome.permissions.contains({ origins: [permissionOrigin(config.endpoint)] })) throw new Error('未获得接口站点权限。');
      active.forEach((controller) => controller.abort());
      return publicConfig(await setConfig({ ...config, revision: crypto.randomUUID() }));
    }
    if (message.action === 'clear') { active.forEach((controller) => controller.abort()); await setConfig(null); return null; }
    throw new Error('不支持的 AI 操作。');
  })().then((data) => respond({ ok: true, data })).catch((error: Error) => respond({ ok: false, error: error.message }));
  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'codevault-ai-analysis' || !trusted(port.sender)) { port.disconnect(); return; }
  const controller = new AbortController();
  let started = false, connected = true;
  port.onDisconnect.addListener(() => { connected = false; controller.abort(); });
  port.onMessage.addListener((message: Record<string, unknown>) => {
    if (started) return;
    started = true; active.add(controller);
    const timer = setTimeout(() => controller.abort(), 25000);
    void (async () => {
      const problem = validateProblem(message.problem);
      if (!port.sender?.url?.startsWith(chrome.runtime.getURL('')) && new URL(port.sender!.url!).origin !== new URL(problem.url).origin) throw new Error('题目来源不匹配。');
      if (typeof message.code !== 'string' || !message.code.trim() || message.code.length > 50000 || typeof message.language !== 'string' || !/^[a-z0-9_+#.-]{1,40}$/i.test(message.language)) throw new Error('分析代码无效，最多支持50000字符。');
      const config = await getConfig();
      if (!config) throw new Error('请先在设置页配置 AI 接口。');
      if (message.revision !== config.revision) throw new Error('AI 配置已变化，请重新读取分析代码。');
      if (!await chrome.permissions.contains({ origins: [permissionOrigin(config.endpoint)] })) throw new Error('AI 站点权限已撤销，请在设置页重新授权。');
      if (controller.signal.aborted) throw new Error('分析已取消。');
      return analyzeCode(config, problem, message.code, message.language, controller.signal);
    })().then((data) => { if (connected) port.postMessage({ ok: true, data }); })
      .catch((error: Error) => { if (connected) port.postMessage({ ok: false, error: controller.signal.aborted ? '分析已取消或超时，请重试。' : error.message }); })
      .finally(() => { clearTimeout(timer); active.delete(controller); if (connected) port.disconnect(); });
  });
});
