import { useEffect, useId, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { noteStorage } from '../database/client';
import type { StoredNote } from '../database/types';
import type { Problem } from '../platforms/types';
import { getProblemRoute } from '../platforms/leetcode';

export function Note({ problem, onSaved }: { problem: Problem; onSaved: () => void }) {
  const id = useId();
  const [saved, setSaved] = useState<StoredNote | null>(null);
  const [text, setText] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const sequence = useRef(0);
  const lock = useRef(false);
  const dirty = text !== (saved?.markdown ?? '');

  async function read() {
    if (lock.current) return;
    const token = ++sequence.current;
    lock.current = true; setBusy(true); setError(''); setMessage(''); setConfirmReload(false);
    try {
      const note = await noteStorage.get(problem.id);
      if (token !== sequence.current) return;
      setSaved(note); setText(note?.markdown ?? ''); setReady(true);
    } catch (e) { if (token === sequence.current) setError((e as Error).message); }
    finally { lock.current = false; if (token === sequence.current) setBusy(false); }
  }
  useEffect(() => { void read(); return () => { sequence.current++; }; }, [problem.id]);

  async function save() {
    if (lock.current || !ready) return;
    if (getProblemRoute(location.href)?.url !== problem.url) { setError('题目已切换，请重新打开面板。'); return; }
    const token = ++sequence.current;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const note = await noteStorage.save(problem, text, saved?.revision ?? 0);
      if (token !== sequence.current) return;
      setSaved(note); setMessage('笔记已保存到本机。'); onSaved();
    } catch (e) { if (token === sequence.current) setError((e as Error).message); }
    finally { lock.current = false; if (token === sequence.current) setBusy(false); }
  }

  return <section className="card solutions note" aria-label="题目笔记">
    <strong>题目笔记</strong>
    <p className="muted">支持 Markdown 标题、列表、引用和代码块。手动保存；切题、关闭面板或刷新页面会丢弃未保存内容。</p>
    {busy && <p role="status">正在处理笔记…</p>}
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {ready && <>
      <div className="form-actions"><button className="secondary" aria-pressed={!preview} onClick={() => setPreview(false)}>编辑笔记</button><button className="secondary" aria-pressed={preview} onClick={() => setPreview(true)}>预览笔记</button></div>
      {preview ? <div className="markdown-preview" aria-label="Markdown预览"><Markdown skipHtml
        urlTransform={(url) => { try { const parsed = new URL(url); return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : ''; } catch { return ''; } }}
        components={{ a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noreferrer">{children}</a> : <span>{children}</span>, img: ({ alt }) => <span>[图片暂不支持：{alt}]</span> }}
      >{text || '暂无笔记。'}</Markdown></div> : <><label htmlFor={id}>Markdown内容</label><textarea id={id} className="note-editor" value={text} maxLength={20000} disabled={busy} onChange={(event) => { setText(event.target.value); setMessage(''); }} /></>}
      <p className="muted">{text.length}/20000 字符 · {dirty ? '有未保存的修改' : saved ? '已保存' : '尚未保存'}</p>
      <button className="retry" disabled={busy || !dirty} onClick={() => void save()}>保存笔记</button>
    </>}
    <button className="secondary" disabled={busy} onClick={() => dirty ? setConfirmReload(true) : void read()}>读取最新笔记</button>
    {confirmReload && <div role="group" aria-label="重新读取确认"><p>重新读取会放弃当前未保存内容，是否继续？</p><button className="secondary" disabled={busy} onClick={() => void read()}>放弃修改并读取</button><button className="secondary" disabled={busy} onClick={() => setConfirmReload(false)}>继续编辑</button></div>}
  </section>;
}
