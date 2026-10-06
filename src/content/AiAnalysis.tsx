import { AnalysisMarkdown } from './AnalysisMarkdown';
import { solutionStorage } from '../database/client';
import type { StoredSolution } from '../database/types';
import { useEffect, useRef, useState } from 'react';
import { aiRequest } from '../ai/client';
import type { AiStatus } from '../ai/types';
import type { Problem } from '../platforms/types';
import { readCode } from '../platforms/editor';
import type { CodeSnapshot } from '../platforms/editor';
import { getProblemRoute } from '../platforms/leetcode';

export function AiAnalysis({ problem }: { problem: Problem }) {
  const [items, setItems] = useState<StoredSolution[]>([]);
  const [selected, setSelected] = useState('editor');
  const [target, setTarget] = useState<StoredSolution | null>(null);
  const [complete, setComplete] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmSave, setConfirmSave] = useState(false);
  const [snapshot, setSnapshot] = useState<CodeSnapshot | null>(null);
  const [config, setConfig] = useState<AiStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const sequence = useRef(0);
  const port = useRef<chrome.runtime.Port | null>(null);
  const lock = useRef(false);
  useEffect(() => () => { sequence.current++; port.current?.disconnect(); }, []);
  useEffect(() => {
    let active = true, request = 0;
    const refresh = () => {
      const id = ++request;
      void solutionStorage.list(problem.id).then((list) => { if (active && id === request) setItems(list); }).catch((e: Error) => { if (active) setError(e.message); });
    };
    refresh(); window.addEventListener('codevault-data-saved', refresh);
    return () => { active = false; window.removeEventListener('codevault-data-saved', refresh); };
  }, [problem.id]);
  async function saveAnalysis(confirmed = false) {
    if (lock.current || !complete || !target) return;
    if (getProblemRoute(location.href)?.url !== problem.url) { setError('题目已切换，请重新打开面板。'); return; }
    if (target.analysis && !confirmed) { setConfirmSave(true); return; }
    const token = sequence.current;
    lock.current = true; setBusy(true); setError('');
    try {
      const value = await solutionStorage.saveAnalysis(target, result);
      if (token === sequence.current) { setTarget(value); setMessage('分析已保存到该解法。'); setConfirmSave(false); }
    } catch (e) { if (token === sequence.current) setError((e as Error).message); }
    finally { if (token === sequence.current) { lock.current = false; setBusy(false); } }
  }
  async function prepare() {
    if (lock.current) return;
    const token = ++sequence.current;
    lock.current = true; setBusy(true); setError(''); setResult(''); setComplete(false); setMessage(''); setConfirmSave(false); setSnapshot(null); setTarget(null);
    try {
      const status = await aiRequest<AiStatus | null>('status');
      if (!status) throw new Error('请先打开 AI 设置，填写接口、模型和 API Key。');
      const chosen = selected === 'editor' ? null : (await solutionStorage.list(problem.id)).find((item) => item.id === selected);
      if (selected !== 'editor' && !chosen) throw new Error('该解法已删除，请重新选择。');
      const value = chosen ? { code: chosen.code, language: chosen.language, sourceUrl: chosen.sourceUrl } : await readCode(problem.url);
      if (value.code.length > 50000) throw new Error('AI 分析最多支持50000字符，请缩短代码。');
      if (token === sequence.current) { setConfig(status); setSnapshot(value); setTarget(chosen ?? null); }
    } catch (e) { if (token === sequence.current) setError((e as Error).message); }
    finally { lock.current = false; if (token === sequence.current) setBusy(false); }
  }
  function cancel() { sequence.current++; port.current?.disconnect(); port.current = null; lock.current = false; setBusy(false); setComplete(false); setError('已停止生成，当前内容不完整，未保存。'); }
  function analyze() {
    if (lock.current || !snapshot || !config) return;
    if (getProblemRoute(location.href)?.url !== problem.url) { setError('题目已切换，请重新读取代码。'); return; }
    const token = ++sequence.current;
    lock.current = true; setBusy(true); setError(''); setResult(''); setComplete(false); setMessage(''); setConfirmSave(false);
    try {
      const connection = chrome.runtime.connect({ name: 'codevault-ai-analysis' });
      port.current = connection;
      let received = false;
      connection.onMessage.addListener((response) => {
        if (response.type !== 'progress') received = true;
        if (token !== sequence.current) return;
        if (getProblemRoute(location.href)?.url !== problem.url) { lock.current = false; setBusy(false); return; }
        if (response.type === 'progress') { if (typeof response.data === 'string') setResult(response.data); return; }
        if (response.ok && typeof response.data === 'string') { setResult(response.data); setComplete(true); }
        else setError(response.error || 'AI 分析失败，请重试。');
        lock.current = false; setBusy(false); port.current = null;
      });
      connection.onDisconnect.addListener(() => {
        void chrome.runtime.lastError;
        if (token !== sequence.current || received) return;
        lock.current = false; setBusy(false); port.current = null; setError('AI 连接已断开，请重试。');
      });
      connection.postMessage({ problem, code: snapshot.code, language: snapshot.language, revision: config.revision, solutionId: target?.id, solutionRevision: target?.revision ?? 0 });
    } catch { lock.current = false; setBusy(false); setError('无法连接 AI 服务，请刷新页面重试。'); }
  }
  return <section className="card solutions ai-analysis" aria-label="AI 代码分析">
    <strong>AI 解法分析</strong>
    <button className="secondary" onClick={() => void aiRequest('options').catch((e: Error) => setError(e.message))}>打开 AI 设置</button>
    <p className="muted">选择解法，生成一份易复习的分析。主动发送代码至所选服务商，可能计费。</p>
    <label>分析对象<select aria-label="分析对象" disabled={busy} value={selected} onChange={(e) => { sequence.current++; setSelected(e.target.value); setSnapshot(null); setTarget(null); setResult(''); setComplete(false); setError(''); setMessage(''); setConfirmSave(false); }}>
      <option value="editor">当前编辑器（临时分析）</option>
      {items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.language}</option>)}
    </select></label>
    <button className="retry" disabled={busy} onClick={() => void prepare()}>读取待分析代码</button>
    {snapshot && config && <>
      <p className="muted">将发送题目标题、链接、难度及 {snapshot.language} 代码快照（{snapshot.code.length} 字符），不发送笔记和图片。</p>
      <p className="problem-url">接口：{config.endpoint}<br />模型：{config.model}</p>
      <p className="muted">{target ? `解法：${target.name}` : "临时分析如需保存，请先保存解法，再选择该解法分析。"}</p>
      <button className="retry" disabled={busy} onClick={analyze}>{complete ? '重新生成' : '发送并分析代码'}</button>
    </>}
    {busy && <p role="status">正在处理 AI 分析…</p>}
    {busy && port.current && <button className="secondary" onClick={cancel}>停止生成</button>}
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {result && <><p className="muted">AI 结果仅供学习参考，尚未运行代码验证；结果不会自动保存。</p><div aria-label="AI 分析结果"><AnalysisMarkdown text={result} /></div></>}
    {complete && target && <button className="secondary" disabled={busy || !!message || confirmSave} onClick={() => void saveAnalysis()}>保存分析</button>}
    {confirmSave && <div role="alertdialog" aria-label="覆盖分析确认"><p>该解法已有分析，是否替换？</p><button disabled={busy} onClick={() => void saveAnalysis(true)}>确认替换分析</button><button disabled={busy} onClick={() => setConfirmSave(false)}>取消替换分析</button></div>}
  </section>;
}
