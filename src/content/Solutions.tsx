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
  const sequence = useRef(0);
  const saving = useRef(false);
  useEffect(() => () => { sequence.current++; }, []);
  useEffect(() => {
    let active = true;
    setLoading(true); setListError('');
    void solutionStorage.list(problem.id).then((list) => { if (active) setItems(list); })
      .catch((e: Error) => { if (active) setListError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [problem.id, revision]);

  async function capture(target?: string) {
    if (saving.current || editing || deleting) return;
    const token = ++sequence.current;
    setBusy(true); setError(''); setMessage('');
    try {
      const snapshot = await readCode(problem.url, target);
      if (token !== sequence.current) return;
      setDraft({ ...snapshot, id: crypto.randomUUID(), name: '', note: '', source: 'own' });
    } catch (e) { if (token === sequence.current) setError((e as Error).message); }
    finally { if (token === sequence.current) setBusy(false); }
  }
  useEffect(() => {
    if (intent?.problemUrl === problem.url) { void capture(intent.target); onIntentHandled(); }
    // Each explicit hover intent is handled once for this problem.
  }, [intent?.id]);

  async function save() {
    if (!draft || saving.current || busy) return;
    if (getProblemRoute(location.href)?.url !== problem.url) { setError('题目已切换，请重新读取代码。'); return; }
    if (!draft.name.trim()) { setError('请填写解法名称。'); return; }
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
      await loadCode(problem, solution);
      if (token === sequence.current) setMessage(`已加载：${solution.name}。可在编辑器按 Ctrl+Z 撤销。`);
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
    {message && <p role="status">{message}</p>}
    {draft && <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <p className="muted">已读取 {draft.language} · {draft.code.length} 字符。保存的是本次快照。</p>
      <label htmlFor={`${formId}-name`}>解法名称</label><input id={`${formId}-name`} maxLength={100} required value={draft.name} disabled={busy} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="例如：哈希表一次遍历" />
      <label htmlFor={`${formId}-code`}>代码预览</label><textarea id={`${formId}-code`} className="code-preview" readOnly value={draft.code} spellCheck={false} />
      <label htmlFor={`${formId}-note`}>备注（可选）</label><textarea id={`${formId}-note`} maxLength={5000} value={draft.note} disabled={busy} onChange={(event) => setDraft({ ...draft, note: event.target.value })} />
      <div className="form-actions"><button className="retry" type="submit" disabled={busy}>保存解法</button><button className="secondary" type="button" disabled={busy} onClick={() => { setDraft(null); setError(''); }}>取消</button></div>
    </form>}
    {loading ? <p>正在读取解法…</p> : listError ? <><p role="alert">{listError}</p><button className="retry" onClick={() => setRevision((value) => value + 1)}>重试读取解法</button></>
      : items.length ? <ul className="solution-list">{items.map((solution) => <li key={solution.id}><details>
        <summary>{solution.name}<span className="muted"> · {solution.language}</span></summary>
        <p className="muted">{sourceNames[solution.source]} · {new Date(solution.createdAt).toLocaleString()}</p>
        <pre>{solution.code}</pre>
        {solution.note && <p className="solution-note">{solution.note}</p>}
        <a href={solution.sourceUrl} target="_blank" rel="noreferrer">查看来源</a>
        <button className="retry" disabled={busy || !!editing || !!deleting} onClick={() => void load(solution)}>加载到编辑器</button>
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
      </details></li>)}</ul> : <p className="muted">暂无解法。读取代码后，命名并保存到本机。</p>}
  </section>;
}
