import { validateProblem, validateMetadata, validSolutionTarget } from './validation.ts';
import { validateBlocks } from './noteBlocks.ts';
import { imagePrefix, validateNoteImages } from './noteImages.ts';
import type { StoredProblem, StoredSolution, StoredNote } from './types';

export const maxBackupBytes = 64 * 1024 * 1024;
export interface Backup { format: 'codevault-backup'; version: 1; exportedAt: string; problems: StoredProblem[]; solutions: StoredSolution[]; notes: StoredNote[] }
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('备份记录无效。');
  return value as Record<string, unknown>;
};
const integer = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || value === Number.MAX_SAFE_INTEGER) throw new Error('备份时间或版本无效。');
  return value as number;
};
const boundedText = (value: unknown, limit: number): string => {
  if (typeof value !== 'string' || value.length > limit) throw new Error('备份文字内容无效或过长。');
  return value;
};
function unique<T>(values: T[], id: (value: T) => string): T[] {
  if (new Set(values.map(id)).size !== values.length) throw new Error('备份含有重复记录标识。');
  return values;
}
export function validateBackup(value: unknown): Backup {
  const root = record(value);
  if (root.format !== 'codevault-backup' || root.version !== 1 || typeof root.exportedAt !== 'string' || root.exportedAt.length > 40 || !Number.isFinite(Date.parse(root.exportedAt))) throw new Error('不支持的备份格式或版本。');
  for (const name of ['problems', 'solutions', 'notes']) if (!Array.isArray(root[name]) || (root[name] as unknown[]).length > 20000) throw new Error('备份记录数量无效或超过20000条。');
  const problems = unique((root.problems as unknown[]).map(value => {
    const row = record(value), problem = validateProblem(row);
    return { ...problem, createdAt: integer(row.createdAt), updatedAt: integer(row.updatedAt),
      favoriteAt: integer(row.favoriteAt ?? row.createdAt), lastOpenedAt: row.lastOpenedAt == null ? null : integer(row.lastOpenedAt) };
  }), row => row.id);
  const parents = new Set(problems.map(row => row.id));
  const solutions = unique((root.solutions as unknown[]).map(value => {
    const row = record(value);
    if (!parents.has(String(row.problemId)) || !validSolutionTarget({ ...row, revision: row.revision ?? 0 })) throw new Error('解法标识或所属题目无效。');
    const metadata = validateMetadata(row), code = boundedText(row.code, 500000);
    if (!code.trim() || typeof row.language !== 'string' || !/^[a-z0-9_+#.-]{1,40}$/i.test(row.language) || row.language === 'plaintext') throw new Error('备份代码或语言无效。');
    return { ...metadata, id: row.id as string, problemId: row.problemId as string, code, language: row.language,
      createdAt: integer(row.createdAt), updatedAt: integer(row.updatedAt ?? row.createdAt), revision: integer(row.revision ?? 0),
      ...(row.analysis === undefined ? {} : { analysis: boundedText(row.analysis, 12000), analysisUpdatedAt: integer(row.analysisUpdatedAt ?? row.updatedAt ?? row.createdAt) }) };
  }), row => row.id);
  const notes = unique((root.notes as unknown[]).map(value => {
    const row = record(value);
    if (!parents.has(String(row.problemId))) throw new Error('笔记所属题目无效。');
    const document = validateBlocks(row.blocks, row.images);
    let legacy;
    if (row.legacy !== undefined) {
      const old = record(row.legacy), oldImages = record(old.images ?? {});
      legacy = { markdown: boundedText(old.markdown, 20000), images: validateNoteImages(oldImages, Object.keys(oldImages).map(id => imagePrefix + id).join('\n')) };
    }
    return { ...document, problemId: row.problemId as string, markdown: boundedText(row.markdown ?? '', 20000), revision: integer(row.revision), updatedAt: integer(row.updatedAt), ...(legacy ? { legacy } : {}) };
  }), row => row.problemId);
  return { format: 'codevault-backup', version: 1, exportedAt: root.exportedAt, problems, solutions, notes };
}
export function parseBackup(text: string): Backup {
  if (new TextEncoder().encode(text).byteLength > maxBackupBytes) throw new Error('备份文件不能超过64MB。');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('文件不是有效的JSON备份。'); }
  return validateBackup(data);
}
