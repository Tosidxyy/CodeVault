import { useEffect, useState } from 'react';
import { aiRequest } from '../ai/client';
import { permissionOrigin, providers, validateConfig } from '../ai/types';
import type { AiProvider, AiStatus } from '../ai/types';

export function AiSettings() {
  const [provider, setProvider] = useState<AiProvider>('deepseek');
  const [endpoint, setEndpoint] = useState<string>(providers.deepseek.endpoint);
  const [model, setModel] = useState<string>(providers.deepseek.models[0]);
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState<AiStatus | null>(null);
  const [busy, setBusy] = useState(true);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    void aiRequest<AiStatus | null>('status').then((value) => { if (active) { setSaved(value); if (value) { setProvider(value.provider); setEndpoint(value.endpoint); setModel(value.model); } } })
      .catch((e: Error) => { if (active) setError(e.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  function resetFeedback() { setError(''); setMessage(''); }
  function changeProvider(value: AiProvider) {
    setProvider(value); setApiKey(''); resetFeedback();
    setEndpoint(value === 'custom' ? '' : providers[value].endpoint);
    setModel(value === 'custom' ? '' : providers[value].models[0]);
  }
  async function run(action: 'save' | 'test') {
    if (busy) return;
    resetFeedback();
    try {
      const useSaved = action === 'test' && !apiKey && saved && saved.provider === provider && saved.endpoint === endpoint && saved.model === model;
      const config = useSaved ? { savedRevision: saved.revision } : validateConfig({ provider, endpoint, model, apiKey });
      const permission = chrome.permissions.request({ origins: [permissionOrigin(endpoint)] });
      setBusy(true); setTesting(action === 'test');
      if (!await permission) throw new Error('未授权接口站点，请授权后重试。');
      if (action === 'test') {
        await aiRequest('test', config);
        setMessage('✓ API连接成功。测试不会自动保存配置。');
      } else {
        const value = await aiRequest<AiStatus>('save', config);
        setSaved(value); setEndpoint(value.endpoint); setApiKey(''); setMessage('AI 配置已保存。');
      }
    } catch (e) { setError(`${action === 'test' ? '连接失败：' : ''}${(e as Error).message}`); }
    finally { setBusy(false); setTesting(false); }
  }
  async function clear() {
    setBusy(true); resetFeedback();
    try { await aiRequest('clear'); setSaved(null); setApiKey(''); setMessage('AI 配置和 API Key 已清除。'); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const inputClass = 'mt-1 block w-full rounded border p-2';
  return <section className="mt-6 rounded-xl bg-white p-5" aria-label="AI 设置">
    <h2 className="text-lg font-semibold">AI 设置</h2>
    <p className="mt-2 text-sm text-neutral-600">API Key 仅保存在当前浏览器扩展中，不加密、不云同步、不上传 CodeVault 服务器，默认不包含在数据导出中。分析会发送题目信息与代码给所选服务商。</p>
    <p className="mt-2 text-sm">{saved ? `已配置：${saved.model} · API Key 已保存（不回显）` : '尚未配置 AI。'}</p>
    <form onSubmit={(event) => { event.preventDefault(); void run('save'); }} className="mt-4 space-y-3">
      <label className="block">AI 服务<select aria-label="AI 服务" className={inputClass} value={provider} disabled={busy} onChange={(e) => changeProvider(e.target.value as AiProvider)}>
        {Object.entries(providers).map(([id, item]) => <option key={id} value={id}>{item.name}</option>)}
        <option value="custom">自定义兼容接口（高级）</option>
      </select></label>
      {provider === 'custom' ? <fieldset className="space-y-3 rounded border p-3"><legend>高级设置 · OpenAI 兼容接口</legend>
        <label className="block">完整接口地址<input className={inputClass} type="url" required maxLength={2000} value={endpoint} disabled={busy} onChange={(e) => { setEndpoint(e.target.value); resetFeedback(); }} /></label>
        <p className="text-xs text-neutral-500">仅支持 HTTPS，地址以 /chat/completions 结尾。授权仅用于此接口域名。</p>
        <label className="block">模型名称<input className={inputClass} required maxLength={150} value={model} disabled={busy} onChange={(e) => { setModel(e.target.value); resetFeedback(); }} /></label>
      </fieldset> : <label className="block">模型<select aria-label="模型" className={inputClass} value={model} disabled={busy} onChange={(e) => { setModel(e.target.value); resetFeedback(); }}>
        {providers[provider].models.map((id) => <option key={id} value={id}>{id}</option>)}
      </select></label>}
      <label className="block">API Key<input className={inputClass} type="password" autoComplete="off" maxLength={512} value={apiKey} disabled={busy} onChange={(e) => { setApiKey(e.target.value); resetFeedback(); }} /></label>
      <p className="text-xs text-neutral-500">保存时需重新输入 Key；配置未改变时可直接测试已保存的 Key。切换服务商会清空输入的 Key。</p>
      <p className="text-xs text-neutral-500">测试连接会发送一条短消息，不含题目或代码，服务商可能计费。测试和分析请求均有25秒超时。</p>
      <div className="flex flex-wrap gap-3">
        <button className="rounded border px-3 py-2 disabled:opacity-50" disabled={busy} type="button" onClick={() => void run('test')}>{testing ? '测试中…' : '测试连接'}</button>
        <button className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50" disabled={busy} type="submit">授权并保存 AI 配置</button>
        <button className="rounded border px-3 py-2 disabled:opacity-50" disabled={busy || !saved} type="button" onClick={() => void clear()}>清除 AI 配置</button>
      </div>
    </form>
    {error && <p className="mt-3 text-red-700" role="alert">{error}</p>}
    {message && <p className="mt-3" role="status">{message}</p>}
  </section>;
}
