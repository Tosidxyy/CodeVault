import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readStream } from '../src/ai/stream.ts';
import { analyzeCode } from '../src/ai/provider.ts';
const config = { provider: 'openai', apiKey: 'fixture-secret', model: 'gpt-4.1-mini', endpoint: 'https://example.com/chat/completions', revision: '1' };
const frame = (value) => `data: ${typeof value === 'string' ? value : JSON.stringify(value)}\r\n\r\n`;
const delta = (text) => frame({ choices: [{ delta: { content: text } }] });
function response(text, split = 1) {
  const bytes = new TextEncoder().encode(text);
  let position = 0;
  return new Response(new ReadableStream({ pull(controller) {
    if (position >= bytes.length) { controller.close(); return; }
    controller.enqueue(bytes.slice(position, position += split));
  } }), { headers: { 'Content-Type': 'text/event-stream' } });
}
test('SSE handles split UTF-8/CRLF, redacts split keys and requires complete bounded text', async () => {
  const updates = [];
  const text = ': ping\r\n\r\n' + delta('### 思路\n中文 fixture-') + delta('secret 后续') + frame('[DONE]');
  assert.equal(await readStream(response(text), config, new AbortController().signal, (s) => updates.push(s)), '### 思路\n中文 [API Key 已隐藏] 后续');
  assert.equal(updates.some((s) => s.includes('fixture-')), false);
  for (const [text, expected] of [[delta('partial'), /意外中断/], [frame('[DONE]'), /有效分析/], ['data: bad\n\n', /格式无效/], [frame({ error: { message: config.apiKey } }), /生成过程中/], [delta('x'.repeat(12001)), /过长/], [delta('cut') + frame({ choices: [{ finish_reason: 'length' }] }) + frame('[DONE]'), /未完整/]]) {
    await assert.rejects(readStream(response(text, 4096), config, new AbortController().signal, () => {}), expected);
  }
  await assert.rejects(readStream(response(text), config, AbortSignal.abort(), () => {}), /取消/);
  await assert.rejects(readStream(response(':' + 'x'.repeat(1048577), 8192), config, new AbortController().signal, () => {}), /过大/);
});
test('Claude streaming ignores thinking, handles text and rejects error/truncated streams', async () => {
  const claude = { ...config, provider: 'anthropic' };
  const content = frame({ type: 'message_start' }) + frame({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'hidden' } }) + frame({ type: 'content_block_delta', delta: { type: 'text_delta', text: '中文答案' } }) + frame({ type: 'message_stop' });
  assert.equal(await readStream(response(content), claude, new AbortController().signal, () => {}), '中文答案');
  await assert.rejects(readStream(response(frame({ type: 'error', error: { message: 'secret' } })), claude, new AbortController().signal, () => {}), /生成过程中/);
  await assert.rejects(readStream(response(content.replace(frame({ type: 'message_stop' }), frame({ type: 'message_delta', delta: { stop_reason: 'max_tokens' } }) + frame({ type: 'message_stop' }))), claude, new AbortController().signal, () => {}), /未完整/);
});
test('analysis requests stream with concise prompt and a bounded token budget', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.stream, true); assert.equal(body.max_completion_tokens, 1200);
      assert.match(body.messages[0].content, /150至300字/);
      return response(delta('答案') + frame('[DONE]'));
    };
    assert.equal(await analyzeCode(config, { title: '题', url: 'https://leetcode.cn/problems/two-sum/', difficulty: 'Easy' }, 'code', 'python', new AbortController().signal, () => {}), '答案');
  } finally { globalThis.fetch = original; }
});
