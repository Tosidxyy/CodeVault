import { fromMarkdown } from 'mdast-util-from-markdown';
import type { RootContent, PhrasingContent } from 'mdast';
import type { NoteBlock } from './types';
import { imageIdPattern, imagePrefix, validateNoteImages } from './noteImages.ts';

export const textBlock = (content = ''): NoteBlock => ({ id: crypto.randomUUID(), type: 'text', content });

// Preserve the original separately. Conversion never executes HTML or fetches remote assets.
export function migrateMarkdown(markdown: string, images: Record<string, string> = {}): NoteBlock[] {
  const tree = fromMarkdown(markdown);
  const definitions = new Map(tree.children.filter((node) => node.type === 'definition').map((node) => [node.identifier, node.url]));
  const blocks: NoteBlock[] = [];
  let text = '';
  const flush = () => { if (text) { blocks.push(textBlock(text)); text = ''; } };
  const visit = (node: RootContent | PhrasingContent) => {
    if (node.type === 'definition') return;
    if (node.type === 'image' || node.type === 'imageReference') {
      const url = node.type === 'image' ? node.url : definitions.get(node.identifier) ?? '';
      const assetId = url.startsWith(imagePrefix) ? url.slice(imagePrefix.length) : '';
      if (imageIdPattern.test(assetId) && images[assetId]?.startsWith('data:image/png;base64,')) {
        flush(); blocks.push({ id: crypto.randomUUID(), type: 'image', assetId });
      } else text += `[图片未保存：${node.alt || '图片'}]`;
      return;
    }
    if ('value' in node) { text += node.value; if (node.type === 'code' || node.type === 'html') text += '\n\n'; return; }
    if (node.type === 'break') { text += '\n'; return; }
    if (node.type === 'thematicBreak') { text += '\n'; return; }
    if (node.type === 'listItem') text += '• ';
    if ('children' in node) for (const child of node.children) visit(child);
    if (node.type === 'paragraph' || node.type === 'heading') text += '\n\n';
    if (node.type === 'link') text += ` (${node.url})`;
  };
  for (const node of tree.children) visit(node);
  text = text.trimEnd(); flush();
  if (!blocks.length || blocks.at(-1)?.type === 'image') blocks.push(textBlock());
  return blocks;
}

export function validateBlocks(value: unknown, attachments: unknown): { blocks: NoteBlock[]; images: Record<string, string> } {
  if (!Array.isArray(value) || !value.length || value.length > 100) throw new Error('笔记需包含1至100个段落或图片。');
  const ids = new Set<string>();
  let length = 0;
  const blocks: NoteBlock[] = value.map((block: unknown) => {
    if (!block || typeof block !== 'object') throw new Error('笔记内容无效。');
    const b = block as Record<string, unknown>;
    if (typeof b.id !== 'string' || !imageIdPattern.test(b.id) || ids.has(b.id)) throw new Error('笔记段落标识无效。');
    ids.add(b.id);
    if (b.type === 'text' && typeof b.content === 'string') { length += b.content.length; return { id: b.id, type: 'text', content: b.content }; }
    if (b.type === 'image' && typeof b.assetId === 'string' && imageIdPattern.test(b.assetId)) return { id: b.id, type: 'image', assetId: b.assetId };
    throw new Error('笔记内容无效。');
  });
  if (length > 20000) throw new Error('笔记最多支持20000字符。');
  const references = blocks.filter((b) => b.type === 'image').map((b) => imagePrefix + b.assetId).join('\n');
  const images = validateNoteImages(attachments, references);
  if (blocks.some((b) => b.type === 'image' && !images[b.assetId])) throw new Error('笔记图片缺失，请重新插入。');
  return { blocks, images };
}
