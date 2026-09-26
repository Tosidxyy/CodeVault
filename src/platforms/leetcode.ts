import type { PlatformAdapter, Problem, ProblemRoute } from './types.ts';

const query = `query CodeVaultProblem($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionId title titleSlug translatedTitle difficulty
    topicTags { name translatedName }
  }
}`;

export function getProblemRoute(href: string): ProblemRoute | null {
  try {
    const url = new URL(href);
    if (url.protocol !== 'https:' || !['leetcode.cn', 'leetcode.com'].includes(url.host)) return null;
    const match = /^\/problems\/([a-z0-9-]+)(?:\/|$)/i.exec(url.pathname);
    if (!match) return null;
    return { slug: match[1], origin: url.origin, url: `${url.origin}/problems/${match[1]}/` };
  } catch {
    return null;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function parseProblem(payload: unknown, route: ProblemRoute): Problem {
  const envelope = record(payload);
  const question = record(record(envelope?.data)?.question);
  if (envelope?.errors || !question || question.titleSlug !== route.slug) {
    throw new Error('题目数据不完整，请稍后重试。');
  }
  const chinese = route.origin === 'https://leetcode.cn';
  const title = (chinese && text(question.translatedTitle)) || text(question.title);
  const id = text(question.questionId);
  const difficulty = question.difficulty;
  if (!title || !id || !['Easy', 'Medium', 'Hard'].includes(String(difficulty)) || !Array.isArray(question.topicTags)) {
    throw new Error('题目数据不完整，请稍后重试。');
  }
  const tags = question.topicTags.map((value: unknown) => {
    const tag = record(value);
    const name = (chinese && text(tag?.translatedName)) || text(tag?.name);
    if (!name) throw new Error('题目标签不完整，请稍后重试。');
    return name;
  });
  return {
    id: `leetcode:${id}`, title, slug: route.slug, url: route.url,
    platform: 'leetcode', difficulty: difficulty as Problem['difficulty'], tags: [...new Set(tags)],
  };
}

export const leetcode: PlatformAdapter = {
  getProblemRoute,
  async getProblem(route, signal) {
    const response = await fetch(`${route.origin}/graphql/`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { titleSlug: route.slug } }),
      signal,
    });
    if (!response.ok) throw new Error(`暂时无法获取题目（HTTP ${response.status}），请稍后重试。`);
    return parseProblem(await response.json(), route);
  },
};
