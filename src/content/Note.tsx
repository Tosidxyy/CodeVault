import { useEffect, useId, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { noteStorage } from '../database/client';
import type { StoredNote } from '../database/types';
import type { Problem } from '../platforms/types';
import { getProblemRoute } from '../platforms/leetcode';
import type { ClipboardEvent } from 'react';
import { imagePrefix, validateNoteImages } from '../database/noteImages';
import { readPastedImage } from './pasteImage';

export function Note({ problem, onSaved }: { problem: Problem; onSaved: () => void }) {
  const id = useId();
  const [saved, setSaved] = useState<StoredNote | null>(null);
  const [text, setText] = useState('');
  const [images, setImages] = useState<Record<string, string>>({});
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
      setSaved(note); setText(note?.markdown ?? ''); setImages(note?.images ?? {}); setReady(true);
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
      const note = await noteStorage.save(problem, text, saved?.revision ?? 0, validateNoteImages(images, text));
      if (token !== sequence.current) return;
      setSaved(note); setImages(note.images ?? {}); setMessage('笔记已保存到本机。'); onSaved();
    } catch (e) { if (token === sequence.current) setError((e as Error).message); }
    finally { lock.current = false; if (token === sequence.current) setBusy(false); }
  }

  async function paste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files);
    if (!files.length) return;
    event.preventDefault();
    if (lock.current || !ready) return;
    if (files.length !== 1) { setError('请一次粘贴一张图片。'); return; }
    const input = event.currentTarget;
    const start = input.selectionStart, end = input.selectionEnd;
    const token = ++sequence.current;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const data = await readPastedImage(files[0]);
      if (token !== sequence.current || getProblemRoute(location.href)?.url !== problem.url) return;
      const imageId = crypto.randomUUID();
      const insertion = `![粘贴图片](${imagePrefix}${imageId})`;
      const next = text.slice(0, start) + insertion + text.slice(end);
      if (next.length > 20000) throw new Error('插入图片后笔记超过20000字符。');
      const retained = validateNoteImages(images, text);
      const nextImages = validateNoteImages({ ...retained, [imageId]: data }, next);
      setImages(nextImages); setText(next); setMessage('图片已插入，请保存笔记。');
    } catch (e) { if (token === sequence.current) setError((e as Error).message); }
    finally { lock.current = false; if (token === sequence.current) setBusy(false); }
  }

  return <section className="card solutions note" aria-label="题目笔记">
    <strong>题目笔记</strong>
    <p className="muted">支持 Markdown 标题、列表、引用和代码块。手动保存；切题、关闭面板或刷新页面会丢弃未保存内容。</p>
    <p className="muted">在编辑框中粘贴 PNG、JPEG 或 WebP 图片。单张2MB，最多5张、合计6MB；图片随笔记保存到本机。</p>
    {busy && <p role="status">正在处理笔记…</p>}
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {ready && <>
      <div className="form-actions"><button className="secondary" aria-pressed={!preview} onClick={() => setPreview(false)}>编辑笔记</button><button className="secondary" aria-pressed={preview} onClick={() => setPreview(true)}>预览笔记</button></div>
      {preview ? <div className="markdown-preview" aria-label="Markdown预览"><Markdown skipHtml
        urlTransform={(url, key) => { if (key === 'src' && url.startsWith(imagePrefix)) return url; try { const parsed = new URL(url); return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : ''; } catch { return ''; } }}
        components={{ a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noreferrer">{children}</a> : <span>{children}</span>, img: ({ src, alt }) => typeof src === 'string' && src.startsWith(imagePrefix) && images[src.slice(imagePrefix.length)] ? <img src={images[src.slice(imagePrefix.length)]} alt={alt || '笔记图片'} /> : <span>[图片未保存或不支持外部图片：{alt}]</span> }}
      >{text || '暂无笔记。'}</Markdown></div> : <><label htmlFor={id}>Markdown内容</label><textarea id={id} className="note-editor" value={text} maxLength={20000} disabled={busy} onPaste={(event) => void paste(event)} onChange={(event) => { setText(event.target.value); setMessage(''); }} /></>}
      <p className="muted">{text.length}/20000 字符 · {dirty ? '有未保存的修改' : saved ? '已保存' : '尚未保存'}</p>
      <button className="retry" disabled={busy || !dirty} onClick={() => void save()}>保存笔记</button>
    </>}
    <button className="secondary" disabled={busy} onClick={() => dirty ? setConfirmReload(true) : void read()}>读取最新笔记</button>
    {confirmReload && <div role="group" aria-label="重新读取确认"><p>重新读取会放弃当前未保存内容，是否继续？</p><button className="secondary" disabled={busy} onClick={() => void read()}>放弃修改并读取</button><button className="secondary" disabled={busy} onClick={() => setConfirmReload(false)}>继续编辑</button></div>}
  </section>;
}
