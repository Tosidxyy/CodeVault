import { AnalysisMarkdown } from './AnalysisMarkdown';
import { useEffect, useId, useRef, useState } from 'react';
import type { Problem } from '../platforms/types';
import { getProblemRoute } from '../platforms/leetcode';
import { loadCode, readCode } from '../platforms/editor';
import type { CaptureIntent } from '../platforms/editor';
import type { SolutionDraft, SolutionMetadata, StoredSolution } from '../database/types';
import { solutionStorage } from '../database/client';
import { SolutionMetadataEditor, sourceNames } from './SolutionMetadataEditor';

export function Solutions({ problem, intent, onSaved, onIntentHandled }: { problem: Problem; intent?: CaptureIntent; onSaved: () => void; onIntentHandled: () => void }) {
  const formId = useId();
  const [items, setItems] = useState<StoredSolution[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState<SolutionDraft | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!message.startsWith('已加载')) return;
    const timer = window.setTimeout(() => setMessage(''), 6000);
    return () => window.clearTimeout(timer);
  }, [message]);
  const sequence = useRef(0);
  const saving = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const confirmation = useRef<((accepted: boolean) => void) | undefined>(undefined);
  useEffect(() => () => { sequence.current++; confirmation.current?.(false); }, []);
  useEffect(() => {
    let active = true;
    setLoading(true); setListError('');
    void solutionStorage.list(problem.id).then((list) => { if (active) setItems(list); })
      .catch((e: Error) => { if (active) setListError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [problem.id, revision]);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener('codevault-data-saved', refresh);
    return () => window.removeEventListener('codevault-data-saved', refresh);
  }, []);

  async function capture(target?: string, snapshot?: CaptureIntent['snapshot']) {
    if (saving.current || editing || deleting) return;
    const token = ++sequence.current;
    setBusy(true); setError(''); setMessage('');
    try {
      const captured = snapshot ?? await readCode(problem.url, target);
      if (token !== sequence.current) return;
      setDraft({ ...captured, id: crypto.randomUUID(), name: '', note: '', source: snapshot ? 'reference' : 'own' });
    } catch (e) { if (token === sequence.current) setError((e as Error).message); }
    finally { if (token === sequence.current) setBusy(false); }
  }
  useEffect(() => {
    if (intent?.problemUrl === problem.url) { void capture(intent.target, intent.snapshot); onIntentHandled(); }
    // Each explicit hover intent is handled once for this problem.
  }, [intent?.id]);

  async function save() {
    if (!draft || saving.current || busy) return;
    if (getProblemRoute(location.href)?.url !== problem.url) { setError('题目已切换，请重新读取代码。'); return; }
    if (draft.language === 'plaintext') { setError('请选择代码语言后保存。'); return; }
    const token = ++sequence.current;
    saving.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const saved = await solutionStorage.save(problem, draft);
      if (token !== sequence.current) return;
      setDraft(null); setMessage(`已保存：${saved.name}`); setRevision((value) => value + 1); onSaved();
    } catch (e) { if (token === sequence.current) setError((e as Error).message); }
    finally { saving.current = false; if (token === sequence.current) setBusy(false); }
  }

  async function load(solution: StoredSolution) {
    if (busy || saving.current) return;
    const token = ++sequence.current;
    saving.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const loaded = await loadCode(problem, solution, () => new Promise<boolean>((resolve) => { confirmation.current = resolve; setConfirming(true); }));
      if (loaded && token === sequence.current) setMessage(`已加载：${solution.name}。可在编辑器按 Ctrl+Z 撤销。`);
    } catch (e) { if (token === sequence.current) setError((e as Error).message); }
    finally { saving.current = false; if (token === sequence.current) setBusy(false); }
  }

  async function change(solution: StoredSolution, metadata?: SolutionMetadata) {
    if (busy || saving.current) return;
    if (getProblemRoute(location.href)?.url !== problem.url) { setError('题目已切换，请重新打开面板。'); return; }
    const token = ++sequence.current;
    saving.current = true; setBusy(true); setError(''); setMessage('');
    try {
      if (metadata) await solutionStorage.update(solution, metadata);
      else await solutionStorage.delete(solution);
      if (token !== sequence.current) return;
      setEditing(null); setDeleting(null); setRevision((value) => value + 1);
      setMessage(metadata ? '解法信息已更新。' : `已删除：${solution.name}`);
    } catch (e) { if (token === sequence.current) setError((e as Error).message); }
    finally { saving.current = false; if (token === sequence.current) setBusy(false); }
  }

  return <section className="card solutions" aria-label="我的解法">
    <strong>我的解法</strong>
    <button className="retry" disabled={busy || !!editing || !!deleting} onClick={() => void capture()}>{draft ? '重新读取代码' : '读取当前代码'}</button>
    <button className="secondary" disabled={busy || loading} onClick={() => { setEditing(null); setDeleting(null); setError(''); setMessage(''); setRevision((value) => value + 1); }}>刷新解法</button>
    {editing && <p className="muted">刷新解法会放弃未保存的修改。</p>}
    {busy && <p role="status">正在处理…</p>}
    {error && <p role="alert">{error}</p>}
    {message && <p role="status" className={message.startsWith('已加载') ? 'load-toast' : undefined}>{message}</p>}
    {confirming && <div role="alertdialog" aria-label="覆盖代码确认"><p>当前编辑器中有不同代码，可能包含未保存的修改。加载历史解法将覆盖当前内容。</p><div className="form-actions"><button className="secondary" onClick={() => { setConfirming(false); confirmation.current?.(false); confirmation.current = undefined; }}>取消加载</button><button className="retry" onClick={() => { setConfirming(false); confirmation.current?.(true); confirmation.current = undefined; }}>继续加载</button></div></div>}
    {draft && <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <p className="muted">已读取 {draft.language} · {draft.code.length} 字符。保存的是本次快照。</p>
      <label htmlFor={`${formId}-name`}>解法名称</label><input id={`${formId}-name`} maxLength={100} value={draft.name} disabled={busy} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="留空自动生成：解法 1、解法 2…" />
      {draft.source === 'reference' && <><label htmlFor={`${formId}-language`}>代码语言</label><select id={`${formId}-language`} value={draft.language} disabled={busy} onChange={(event) => setDraft({ ...draft, language: event.target.value })}><option value="plaintext">请选择语言</option>{[...new Set([draft.language, 'python', 'cpp', 'java', 'javascript', 'typescript', 'c', 'csharp', 'go', 'rust', 'kotlin', 'swift', 'ruby', 'scala', 'php'])].filter((value) => value !== 'plaintext').map((value) => <option key={value} value={value}>{value}</option>)}</select><p className="muted">来源：题解 / 参考 · 保存后自动收藏当前题目</p></>}
      <label htmlFor={`${formId}-note`}>备注（可选）</label><textarea id={`${formId}-note`} maxLength={5000} value={draft.note} disabled={busy} onChange={(event) => setDraft({ ...draft, note: event.target.value })} />
      <div className="form-actions"><button className="retry" type="submit" disabled={busy}>保存解法</button><button className="secondary" type="button" disabled={busy} onClick={() => { setDraft(null); setError(''); }}>取消</button></div>
    </form>}
    {loading ? <p>正在读取解法…</p> : listError ? <><p role="alert">{listError}</p><button className="retry" onClick={() => setRevision((value) => value + 1)}>重试读取解法</button></>
      : items.length ? <ul className="solution-list">{items.map((solution) => <li key={solution.id}><details>
        <summary>{solution.name}</summary>
        <p className="muted">{sourceNames[solution.source]} · {new Date(solution.createdAt).toLocaleString()}</p>

        {solution.analysis && <section aria-label="已保存的 AI 分析"><strong>AI 分析</strong><AnalysisMarkdown text={solution.analysis} /></section>}
        {solution.note && <p className="solution-note">{solution.note}</p>}
        <a href={solution.sourceUrl} target="_blank" rel="noreferrer">查看来源</a>

        <p className="muted">将替换当前代码；可在编辑器按 Ctrl+Z 撤销。</p>
        <div className="form-actions">
          <button className="secondary" disabled={busy || !!draft || !!editing || !!deleting} onClick={() => { setEditing(solution.id); setError(''); setMessage(''); }}>编辑信息</button>
          <button className="secondary" disabled={busy || !!draft || !!editing || !!deleting} onClick={() => { setDeleting(solution.id); setError(''); setMessage(''); }}>删除解法</button>
        </div>
        {editing === solution.id && <SolutionMetadataEditor solution={solution} busy={busy} onSave={(metadata) => void change(solution, metadata)} onCancel={() => { setEditing(null); setError(''); }} />}
        {deleting === solution.id && <div role="group" aria-label="删除确认">
          <p>确定永久删除“{solution.name}”？题目收藏和其他版本将保留。</p>
          <div className="form-actions"><button className="retry" disabled={busy} onClick={() => void change(solution)}>确认删除</button><button className="secondary" disabled={busy} onClick={() => { setDeleting(null); setError(''); }}>取消删除</button></div>
        </div>}
      </details><div className="solution-row"><span className="muted">{solution.language} · {new Date(solution.createdAt).toLocaleDateString()} · {sourceNames[solution.source]}</span><button className="secondary" disabled={busy || !!editing || !!deleting} onClick={() => void load(solution)}>加载到编辑器</button></div></li>)}</ul> : <p className="muted">暂无解法。读取代码后即可保存到本机，名称可选。</p>}
  </section>;
}
