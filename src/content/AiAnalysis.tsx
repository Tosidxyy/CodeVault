import { useEffect, useRef, useState } from 'react';
import { aiRequest } from '../ai/client';
import type { AiStatus } from '../ai/types';
import type { Problem } from '../platforms/types';
import { readCode } from '../platforms/editor';
import type { CodeSnapshot } from '../platforms/editor';
import { getProblemRoute } from '../platforms/leetcode';

export function AiAnalysis({ problem }: { problem: Problem }) {
  const [snapshot, setSnapshot] = useState<CodeSnapshot | null>(null);
  const [config, setConfig] = useState<AiStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const sequence = useRef(0);
  const port = useRef<chrome.runtime.Port | null>(null);
  const lock = useRef(false);
  useEffect(() => () => { sequence.current++; port.current?.disconnect(); }, []);
  async function prepare() {
    if (lock.current) return;
    const token = ++sequence.current;
    lock.current = true; setBusy(true); setError(''); setResult(''); setSnapshot(null);
    try {
      const status = await aiRequest<AiStatus | null>('status');
      if (!status) throw new Error('请先打开 AI 设置，填写接口、模型和 API Key。');
      const value = await readCode(problem.url);
      if (value.code.length > 50000) throw new Error('AI 分析最多支持50000字符，请缩短代码。');
      if (token === sequence.current) { setConfig(status); setSnapshot(value); }
    } catch (e) { if (token === sequence.current) setError((e as Error).message); }
    finally { lock.current = false; if (token === sequence.current) setBusy(false); }
  }
  function cancel() { sequence.current++; port.current?.disconnect(); port.current = null; lock.current = false; setBusy(false); setError('已取消分析。'); }
  function analyze() {
    if (lock.current || !snapshot || !config) return;
    if (getProblemRoute(location.href)?.url !== problem.url) { setError('题目已切换，请重新读取代码。'); return; }
    const token = ++sequence.current;
    lock.current = true; setBusy(true); setError(''); setResult('');
    try {
      const connection = chrome.runtime.connect({ name: 'codevault-ai-analysis' });
      port.current = connection;
      let received = false;
      connection.onMessage.addListener((response) => {
        received = true;
        if (token !== sequence.current) return;
        if (getProblemRoute(location.href)?.url !== problem.url) { lock.current = false; setBusy(false); return; }
        if (response.ok && typeof response.data === 'string') setResult(response.data);
        else setError(response.error || 'AI 分析失败，请重试。');
        lock.current = false; setBusy(false); port.current = null;
      });
      connection.onDisconnect.addListener(() => {
        void chrome.runtime.lastError;
        if (token !== sequence.current || received) return;
        lock.current = false; setBusy(false); port.current = null; setError('AI 连接已断开，请重试。');
      });
      connection.postMessage({ problem, code: snapshot.code, language: snapshot.language, revision: config.revision });
    } catch { lock.current = false; setBusy(false); setError('无法连接 AI 服务，请刷新页面重试。'); }
  }
  return <section className="card solutions" aria-label="AI 代码分析">
    <strong>AI 代码分析</strong>
    <button className="secondary" onClick={() => void aiRequest('options').catch((e: Error) => setError(e.message))}>打开 AI 设置</button>
    <button className="retry" disabled={busy} onClick={() => void prepare()}>读取待分析代码</button>
    {snapshot && config && <>
      <p className="muted">将发送题目标题、链接、难度及下方 {snapshot.language} 代码快照（{snapshot.code.length} 字符），不发送笔记和图片。</p>
      <p className="problem-url">接口：{config.endpoint}<br />模型：{config.model}</p>
      <label>待分析代码<textarea className="code-preview" readOnly value={snapshot.code} /></label>
      <button className="retry" disabled={busy} onClick={analyze}>发送并分析代码</button>
    </>}
    {busy && <p role="status">正在处理 AI 分析…</p>}
    {busy && port.current && <button className="secondary" onClick={cancel}>取消分析</button>}
    {error && <p role="alert">{error}</p>}
    {result && <><p className="muted">AI 结果仅供学习参考，尚未运行代码验证；结果不会自动保存。</p><div className="solution-note" aria-label="AI 分析结果">{result}</div></>}
  </section>;
}
