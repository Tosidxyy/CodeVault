import type { NoteBlock } from '../database/types';
import { textBlock } from '../database/noteBlocks';

// Keep every nonempty legacy paragraph in order; empty insertion placeholders disappear.
export function noteText(blocks: NoteBlock[]): string {
  return blocks.filter((block): block is Extract<NoteBlock, { type: 'text' }> => block.type === 'text').map((block) => block.content).filter((content) => content.length > 0).join('\n\n');
}
export function galleryBlocks(blocks: NoteBlock[], content = noteText(blocks)): NoteBlock[] {
  const first = blocks.find((block) => block.type === 'text');
  return [{ ...(first ?? textBlock()), type: 'text', content }, ...blocks.filter((block) => block.type === 'image')];
}
