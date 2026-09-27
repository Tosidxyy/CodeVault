import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { NoteBlock } from '../database/types';
import type { Problem } from '../platforms/types';
import { textBlock, validateBlocks } from '../database/noteBlocks';
import { getProblemRoute } from '../platforms/leetcode';
import { readPastedImage } from './pasteImage';
import { noteDraft } from './noteDraft';

export function Note({ problem, onSaved }: { problem: Problem; onSaved: () => void }) {
  const draft = noteDraft(problem);
  const state = useSyncExternalStore(draft.subscribe, draft.snapshot);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [confirmReload, setConfirmReload] = useState(false);
  const [deleting, setDeleting] = useState<string>();
  const [undo, setUndo] = useState<{ block: Extract<NoteBlock, { type: 'image' }>; index: number; data: string }>();
  const selection = useRef<{ id: string; start: number; end: number } | undefined>(undefined);
  const container = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const imageLock = useRef(false);
  useEffect(() => {
    alive.current = true;
    const flush = () => draft.flush();
    const hide = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', hide);
    return () => { alive.current = false; flush(); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', hide); };
  }, [draft]);
  useEffect(() => { if (state.saved && !state.dirty) onSaved(); }, [state.saved, state.dirty]);
  useEffect(() => { if (!undo) return; const timer = setTimeout(() => setUndo(undefined), 10000); return () => clearTimeout(timer); }, [undo]);
  useLayoutEffect(() => {
    container.current?.querySelectorAll('textarea').forEach((element) => { element.style.height = 'auto'; element.style.height = `${Math.max(64, element.scrollHeight)}px`; });
  }, [state.blocks]);
  function edit(blocks: NoteBlock[], images = state.images) { draft.edit({ blocks, images }); }
  async function insert(files: File[]) {
    if (imageLock.current || !state.ready) return;
    if (files.length !== 1) { setError('请一次插入一张图片。'); return; }
    imageLock.current = true; setProcessing(true); setError('');
    const position = selection.current;
    try {
      const data = await readPastedImage(files[0]);
      if (!alive.current || getProblemRoute(location.href)?.url !== problem.url) return;
      const assetId = crypto.randomUUID();
      const block: NoteBlock = { id: crypto.randomUUID(), type: 'image', assetId };
      const blocks = [...draft.state.blocks];
      let after = textBlock();
      const index = blocks.findIndex((item) => item.id === position?.id && item.type === 'text');
      if (index >= 0 && position && blocks[index].type === 'text') {
        const old = blocks[index] as Extract<NoteBlock, { type: 'text' }>;
        after = textBlock(old.content.slice(position.end));
        blocks.splice(index, 1, { ...old, content: old.content.slice(0, position.start) }, block, after);
      } else blocks.push(block, after);
      const document = validateBlocks(blocks, { ...draft.state.images, [assetId]: data });
      draft.edit(document);
      requestAnimationFrame(() => { const next = container.current?.querySelector<HTMLTextAreaElement>(`[data-block-id="${after.id}"]`); next?.focus(); next?.setSelectionRange(0, 0); });
    } catch (reason) { if (alive.current) setError((reason as Error).message); }
    finally { imageLock.current = false; if (alive.current) setProcessing(false); }
  }
  function removeImage(id: string) {
    const index = state.blocks.findIndex((block) => block.id === id);
    const block = state.blocks[index];
    if (block?.type !== 'image') return;
    setUndo({ block, index, data: state.images[block.assetId] });
    edit(state.blocks.filter((item) => item.id !== id)); setDeleting(undefined);
  }
  return <section ref={container} className="card note block-note" aria-label="题目笔记" onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }} onDrop={(event) => {
    if (!event.dataTransfer.files.length) return;
    event.preventDefault(); event.stopPropagation(); void insert(Array.from(event.dataTransfer.files));
  }}>
    <div className="note-heading"><strong>题目笔记</strong><span role="status">{!state.ready ? '正在读取…' : processing ? '正在处理图片…' : state.saving ? '正在保存…' : state.error ? '保存未完成' : state.dirty ? '待自动保存' : state.saved ? '已保存' : '开始记录思路'}</span></div>
    <p className="muted">直接输入文字，粘贴、拖入或上传图片。停止输入后自动保存。</p>
    {(error || state.error) && <p role="alert">{error || state.error}</p>}
    {state.legacy && <p className="muted">旧笔记已转换，原文和附件备份保留在本机。</p>}
    {state.ready && <>
      <div className="note-blocks" aria-label="笔记编辑区">
        {state.blocks.map((block, index) => block.type === 'text' ? <textarea key={block.id} data-block-id={block.id} className="note-text" aria-label={`笔记文字 ${index + 1}`} placeholder="记录思路、易错点…" value={block.content} disabled={processing} maxLength={20000}
          onSelect={(event) => { selection.current = { id: block.id, start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd }; }}
          onKeyDown={(event) => { if (event.key === 'Backspace' && !block.content && state.blocks.filter((item) => item.type === 'text').length > 1) { event.preventDefault(); edit(state.blocks.filter((item) => item.id !== block.id)); } }}
          onChange={(event) => edit(state.blocks.map((item) => item.id === block.id ? { ...block, content: event.target.value } : item))}
          onPaste={(event) => { if (event.clipboardData.files.length) { event.preventDefault(); selection.current = { id: block.id, start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd }; void insert(Array.from(event.clipboardData.files)); } }} /> :
          <figure key={block.id}><img src={state.images[block.assetId]} alt="笔记图片" /><button className="secondary" disabled={processing} onClick={() => setDeleting(block.id)}>删除图片</button>
            {deleting === block.id && <div role="group" aria-label="删除图片确认"><p>删除这张图片？</p><button className="secondary" onClick={() => removeImage(block.id)}>确认删除图片</button><button className="secondary" onClick={() => setDeleting(undefined)}>取消删除图片</button></div>}
          </figure>)}
      </div>
      <div className="form-actions"><button className="secondary" disabled={processing} onClick={() => input.current?.click()}>上传图片</button><button className="secondary" disabled={processing || state.blocks.length >= 100} onClick={() => edit([...state.blocks, textBlock()])}>添加段落</button></div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" aria-label="选择笔记图片" hidden onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ''; if (files.length) void insert(files); }} />
      <p className="muted">{state.blocks.reduce((total, block) => total + (block.type === 'text' ? block.content.length : 0), 0)}/20000 字符 · 图片单张2MB，最多5张、合计6MB</p>
      {undo && <p role="status">图片已删除 · <button className="secondary" onClick={() => {
        const blocks = [...state.blocks]; blocks.splice(Math.min(undo.index, blocks.length), 0, undo.block);
        try { const document = validateBlocks(blocks, { ...state.images, [undo.block.assetId]: undo.data }); draft.edit(document); setUndo(undefined); }
        catch (reason) { setError((reason as Error).message); }
      }}>撤销删除图片</button></p>}
      {state.error && <button className="secondary" disabled={processing || state.saving} onClick={() => draft.flush(true)}>重试保存笔记</button>}
    </>}
    <button className="secondary" disabled={processing || state.saving} onClick={() => state.dirty ? setConfirmReload(true) : void draft.read()}>读取最新笔记</button>
    {confirmReload && <div role="group" aria-label="重新读取确认"><p>重新读取会放弃当前未保存内容，是否继续？</p><button className="secondary" onClick={() => { setConfirmReload(false); setError(''); void draft.read(); }}>放弃修改并读取</button><button className="secondary" onClick={() => setConfirmReload(false)}>继续编辑</button></div>}
  </section>;
}
