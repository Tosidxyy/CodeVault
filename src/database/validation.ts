import type { Problem } from '../platforms/types.ts';
import { getProblemRoute } from '../platforms/leetcode.ts';
import type { SolutionDraft, SolutionMetadata } from './types.ts';

export function validSolutionTarget(message: Record<string, unknown>): boolean {
  return validProblemId(message.problemId) && typeof message.id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(message.id) &&
    Number.isSafeInteger(message.revision) && (message.revision as number) >= 0;
}

export function validateMetadata(value: unknown): SolutionMetadata {
  if (!value || typeof value !== 'object') throw new Error('解法信息无效。');
  const s = value as Record<string, unknown>;
  if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 100 ||
    typeof s.note !== 'string' || s.note.length > 5000 ||
    !['own', 'reference', 'template'].includes(String(s.source)) ||
    typeof s.sourceUrl !== 'string' || s.sourceUrl.length > 2000) throw new Error('解法信息无效。');
  const url = new URL(s.sourceUrl);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('来源链接无效。');
  return { name: s.name.trim(), note: s.note, source: s.source as SolutionMetadata['source'], sourceUrl: url.href };
}

export function validProblemId(value: unknown): value is string {
  return typeof value === 'string' && /^leetcode:[0-9]{1,20}$/.test(value);
}

export function validateProblem(value: unknown): Problem {
  if (!value || typeof value !== 'object') throw new Error('题目信息无效。');
  const p = value as Record<string, unknown>;
  const route = typeof p.url === 'string' ? getProblemRoute(p.url) : null;
  if (!validProblemId(p.id) || p.platform !== 'leetcode' || !route || route.url !== p.url || route.slug !== p.slug ||
    route.slug.length > 200 || typeof p.title !== 'string' || !p.title.trim() || p.title.length > 500 ||
    !['Easy', 'Medium', 'Hard'].includes(String(p.difficulty)) || !Array.isArray(p.tags) || p.tags.length > 50 ||
    p.tags.some((tag) => typeof tag !== 'string' || !tag.trim() || tag.length > 100)) {
    throw new Error('题目信息无效。');
  }
  // Copy only supported fields; do not persist arbitrary message properties.
  return { id: p.id, platform: 'leetcode', slug: route.slug, url: route.url, title: p.title.trim(),
    difficulty: p.difficulty as Problem['difficulty'], tags: [...new Set(p.tags.map((tag: string) => tag.trim()))] };
}

export function validateSolution(value: unknown, problem: Problem): SolutionDraft {
  if (!value || typeof value !== 'object') throw new Error('解法无效。');
  const s = value as Record<string, unknown>;
  if (typeof s.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.id) ||
    typeof s.name !== 'string' || s.name.length > 100 ||
    typeof s.code !== 'string' || !s.code.trim() || s.code.length > 500000 ||
    typeof s.language !== 'string' || !/^[a-z0-9_+#.-]{1,40}$/i.test(s.language) || s.language === 'plaintext' ||
    !['own', 'reference'].includes(String(s.source)) || typeof s.sourceUrl !== 'string' || s.sourceUrl.length > 2000 || getProblemRoute(s.sourceUrl)?.url !== problem.url ||
    typeof s.note !== 'string' || s.note.length > 5000) throw new Error('解法无效。');
  return { id: s.id, name: s.name.trim(), code: s.code, language: s.language, source: s.source as SolutionDraft['source'], sourceUrl: s.sourceUrl, note: s.note };
}
