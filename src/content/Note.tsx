import { useT } from '../i18n/locale';
import { galleryBlocks, noteText } from './noteLayout';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { NoteBlock } from '../database/types';
import type { Problem } from '../platforms/types';
import { validateBlocks } from '../database/noteBlocks';
import { getProblemRoute } from '../platforms/leetcode';
import { readPastedImage } from './pasteImage';
import { noteDraft } from './noteDraft';

export function Note({ problem, onSaved }: { problem: Problem; onSaved: () => void }) {
  const t = useT();
  const draft = noteDraft(problem);
  const state = useSyncExternalStore(draft.subscribe, draft.snapshot);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [confirmReload, setConfirmReload] = useState(false);
  const [preview, setPreview] = useState<string>();
  const dialog = useRef<HTMLDialogElement>(null);
  const [undo, setUndo] = useState<{ block: Extract<NoteBlock, { type: 'image' }>; index: number; data: string }>();

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
  useEffect(() => {
    const element = dialog.current;
    if (preview && element && !element.open) element.showModal();
    return () => { if (element?.open) element.close(); };
  }, [preview]);
  function edit(blocks: NoteBlock[], images = state.images) { draft.edit({ blocks, images }); }
  async function insert(files: File[]) {
    if (imageLock.current || !state.ready) return;
    if (files.length !== 1) { setError('请一次插入一张图片。'); return; }
    imageLock.current = true; setProcessing(true); setError('');

    try {
      const data = await readPastedImage(files[0]);
      if (!alive.current || getProblemRoute(location.href)?.url !== problem.url) return;
      const assetId = crypto.randomUUID();
      const block: NoteBlock = { id: crypto.randomUUID(), type: 'image', assetId };
      const blocks = [...galleryBlocks(draft.state.blocks), block];
      const document = validateBlocks(blocks, { ...draft.state.images, [assetId]: data });
      draft.edit(document);
    } catch (reason) { if (alive.current) setError((reason as Error).message); }
    finally { imageLock.current = false; if (alive.current) setProcessing(false); }
  }
  function removeImage(id: string) {
    const index = state.blocks.findIndex((block) => block.id === id);
    const block = state.blocks[index];
    if (block?.type !== 'image') return;
    setUndo({ block, index, data: state.images[block.assetId] });
    edit(galleryBlocks(state.blocks.filter((item) => item.id !== id)));
  }
  return <section ref={container} className="card note block-note" aria-label={t("题目笔记")} onDragOver={(event) => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }} onDrop={(event) => {
    if (!event.dataTransfer.files.length) return;
    event.preventDefault(); event.stopPropagation(); void insert(Array.from(event.dataTransfer.files));
  }}>
    <div className="note-heading"><strong>{t("题目笔记")}</strong><span role="status" data-saved={state.saved && !state.dirty && !state.saving && !state.error}>{!state.ready ? t('正在读取…') : processing ? t('正在处理图片…') : state.saving ? t('正在保存…') : t(state.error) ? t('保存未完成') : state.dirty ? t('待自动保存') : state.saved ? t('已保存') : t('开始记录思路')}</span></div>
    <p className="muted">{t("直接输入文字，粘贴、拖入或上传图片。停止输入后自动保存。")}</p>
    {(t(error || state.error)) && <p role="alert">{t(error || state.error)}</p>}
    {state.legacy && <p className="muted">{t("旧笔记已转换，原文和附件备份保留在本机。")}</p>}
    {state.ready && <>
      <div className="note-blocks" aria-label={t("笔记编辑区")}>
        <textarea className="note-text" aria-label={t("笔记文字 1")} placeholder={t("记录思路、易错点…")} value={noteText(state.blocks)} disabled={processing} maxLength={20000}
          onChange={(event) => edit(galleryBlocks(state.blocks, event.target.value))}
          onPaste={(event) => { if (event.clipboardData.files.length) { event.preventDefault(); void insert(Array.from(event.clipboardData.files)); } }} />
        <div className="note-gallery" aria-label={t("笔记图片列表")}>
          {state.blocks.filter((block) => block.type === 'image').map((block) => block.type === 'image' && <figure key={block.id}>
            <button className="note-thumbnail" aria-label={t("放大笔记图片")} onClick={() => setPreview(block.assetId)}><img src={state.images[block.assetId]} alt={t("笔记图片")} /></button>
            <button className="image-delete" aria-label={t("删除图片")} title={t("删除图片")} disabled={processing} onClick={() => removeImage(block.id)}>×</button>
          </figure>)}
          <button className="secondary note-upload" disabled={processing} onClick={() => input.current?.click()}>{t("上传图片")}</button>
        </div>
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" aria-label={t("选择笔记图片")} hidden onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ''; if (files.length) void insert(files); }} />
      <p className="muted">{noteText(state.blocks).length}{t("/20000 字符 · 图片单张2MB，最多5张、合计6MB")}</p>
      {undo && <p role="status">{t("图片已删除 · ")}<button className="secondary" onClick={() => {
        const blocks = galleryBlocks(state.blocks); blocks.splice(Math.max(1, Math.min(undo.index, blocks.length)), 0, undo.block);
        try { const document = validateBlocks(blocks, { ...state.images, [undo.block.assetId]: undo.data }); draft.edit(document); setUndo(undefined); }
        catch (reason) { setError((reason as Error).message); }
      }}>{t("撤销删除图片")}</button></p>}
      {t(state.error) && <button className="secondary" disabled={processing || state.saving} onClick={() => draft.flush(true)}>{t("重试保存笔记")}</button>}
    </>}
    {preview && state.images[preview] && <dialog ref={dialog} className="image-viewer" aria-label={t("笔记图片预览")} onCancel={(event) => { event.preventDefault(); setPreview(undefined); }} onKeyDown={(event) => { event.stopPropagation(); }} onClick={(event) => { if (event.target === event.currentTarget) setPreview(undefined); }}>
      <button className="viewer-close" aria-label={t("关闭图片预览")} onClick={() => setPreview(undefined)}>×</button>
      <img src={state.images[preview]} alt={t("放大的笔记图片")} />
    </dialog>}
    <button className="secondary" disabled={processing || state.saving} onClick={() => state.dirty ? setConfirmReload(true) : void draft.read()}>{t("读取最新笔记")}</button>
    {confirmReload && <div role="group" aria-label={t("重新读取确认")}><p>{t("重新读取会放弃当前未保存内容，是否继续？")}</p><button className="secondary" onClick={() => { setConfirmReload(false); setError(''); void draft.read(); }}>{t("放弃修改并读取")}</button><button className="secondary" onClick={() => setConfirmReload(false)}>{t("继续编辑")}</button></div>}
  </section>;
}
