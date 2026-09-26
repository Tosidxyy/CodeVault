import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getProblemRoute, parseProblem } from '../src/platforms/leetcode.ts';

const question = {
  questionId: '1', title: 'Two Sum', translatedTitle: '两数之和', titleSlug: 'two-sum', difficulty: 'Easy',
  topicTags: [{ name: 'Array', translatedName: '数组' }, { name: 'Hash Table', translatedName: null }],
};

test('problem routes normalize tabs, search and hash and reject unrelated URLs', () => {
  for (const host of ['leetcode.cn', 'leetcode.com']) {
    assert.deepEqual(getProblemRoute(`https://${host}/problems/two-sum/solutions/12/?envType=study-plan#code`), {
      slug: 'two-sum', origin: `https://${host}`, url: `https://${host}/problems/two-sum/`,
    });
    assert.ok(getProblemRoute(`https://${host}/problems/two-sum`));
  }
  for (const url of ['not a URL', 'http://leetcode.cn/problems/two-sum/', 'https://leetcode.cn.evil.com/problems/two-sum/', 'https://leetcode.cn/problemset/', 'https://leetcode.cn/problems/', 'https://leetcode.cn/problems/a%2fb/']) {
    assert.equal(getProblemRoute(url), null);
  }
});

test('metadata prefers Chinese translation only on cn, falls back and deduplicates tags', () => {
  const cn = getProblemRoute('https://leetcode.cn/problems/two-sum/');
  const com = getProblemRoute('https://leetcode.com/problems/two-sum/');
  const result = parseProblem({ data: { question } }, cn);
  assert.equal(result.id, 'leetcode:1');
  assert.equal(result.title, '两数之和');
  assert.equal(result.difficulty, 'Easy');
  assert.deepEqual(result.tags, ['数组', 'Hash Table']);
  assert.equal(parseProblem({ data: { question } }, com).title, 'Two Sum');
  assert.deepEqual(parseProblem({ data: { question } }, com).tags, ['Array', 'Hash Table']);
  assert.equal(parseProblem({ data: { question: { ...question, translatedTitle: ' ' } } }, cn).title, 'Two Sum');
  assert.deepEqual(parseProblem({ data: { question: { ...question, topicTags: [question.topicTags[0], question.topicTags[0]] } } }, cn).tags, ['数组']);
  assert.deepEqual(parseProblem({ data: { question: { ...question, topicTags: [] } } }, cn).tags, []);
});

test('invalid and stale metadata is rejected rather than displayed as current', () => {
  const route = getProblemRoute('https://leetcode.cn/problems/two-sum/');
  for (const payload of [null, {}, { data: { question: null } }, { errors: [{ message: 'Unavailable' }], data: { question } },
    ...[{ titleSlug: 'other' }, { questionId: null }, { difficulty: 'Unknown' }, { title: '', translatedTitle: null }, { topicTags: null }, { topicTags: [{}] }].map((change) => ({ data: { question: { ...question, ...change } } }))]) {
    assert.throws(() => parseProblem(payload, route));
  }
});
