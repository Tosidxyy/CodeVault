import { useEffect, useState } from 'react';
import { aiRequest } from '../ai/client';
import { permissionOrigin, validateConfig } from '../ai/types';
import type { AiStatus } from '../ai/types';

export function AiSettings() {
  const [endpoint, setEndpoint] = useState('https://api.deepseek.com/v1/chat/completions');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState<AiStatus | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    void aiRequest<AiStatus | null>('status').then((value) => { if (active) { setSaved(value); if (value) { setEndpoint(value.endpoint); setModel(value.model); } } })
      .catch((e: Error) => { if (active) setError(e.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  async function save() {
    if (busy) return;
    setError(''); setMessage('');
    try {
      const config = validateConfig({ endpoint, model, apiKey });
      // Request within the user's click handler, before any asynchronous storage operation.
      const permission = chrome.permissions.request({ origins: [permissionOrigin(config.endpoint)] });
      setBusy(true);
      if (!await permission) throw new Error('未授权接口站点，配置未保存。');
      const value = await aiRequest<AiStatus>('save', config);
      setSaved(value); setEndpoint(value.endpoint); setApiKey(''); setMessage('AI 配置已保存。');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function clear() {
    setBusy(true); setError(''); setMessage('');
    try { await aiRequest('clear'); setSaved(null); setApiKey(''); setMessage('AI 配置和 API Key 已清除。'); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="mt-6 rounded-xl bg-white p-5" aria-label="AI 设置">
    <h2 className="text-lg font-semibold">AI 设置</h2>
    <p className="mt-2 text-sm text-neutral-600">支持 DeepSeek 和 OpenAI 兼容的 Chat Completions 接口。API Key 仅保存在当前浏览器扩展中，不加密、不云同步。分析会发送题目标题、链接、难度、语言与代码，服务商可能计费。</p>
    <p className="mt-2 text-sm">{saved ? `已配置：${saved.model} · API Key 已保存（不回显）` : '尚未配置 AI。'}</p>
    <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="mt-4 space-y-3">
      <label className="block">完整接口地址<input className="mt-1 block w-full rounded border p-2" type="url" required maxLength={2000} value={endpoint} disabled={busy} onChange={(e) => setEndpoint(e.target.value)} /></label>
      <p className="text-xs text-neutral-500">例如 https://api.openai.com/v1/chat/completions；仅支持 HTTPS，保存时授权该域名。</p>
      <label className="block">模型名称<input className="mt-1 block w-full rounded border p-2" required maxLength={150} value={model} disabled={busy} placeholder="填写服务商提供的模型 ID" onChange={(e) => setModel(e.target.value)} /></label>
      <label className="block">API Key<input className="mt-1 block w-full rounded border p-2" type="password" autoComplete="off" required maxLength={512} value={apiKey} disabled={busy} onChange={(e) => setApiKey(e.target.value)} /></label>
      <p className="text-xs text-neutral-500">每次保存配置需重新输入 Key，避免更换接口后误用旧 Key。</p>
      <div className="flex gap-3"><button className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50" disabled={busy} type="submit">授权并保存 AI 配置</button><button className="rounded border px-3 py-2 disabled:opacity-50" disabled={busy || !saved} type="button" onClick={() => void clear()}>清除 AI 配置</button></div>
    </form>
    {error && <p className="mt-3 text-red-700" role="alert">{error}</p>}
    {message && <p className="mt-3" role="status">{message}</p>}
  </section>;
}
