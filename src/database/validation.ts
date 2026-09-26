import type { Problem } from '../platforms/types.ts';
import { getProblemRoute } from '../platforms/leetcode.ts';

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
