import type { AiConfig } from './types';

// Publish snapshots while holding any suffix that could become a split API key.
export function redactPartial(text: string, key: string, complete = false): string {
  let safe = text.replaceAll(key, '[API Key 已隐藏]');
  if (!complete) {
    for (let n = Math.min(key.length - 1, safe.length); n > 0; n--) {
      if (safe.endsWith(key.slice(0, n))) { safe = safe.slice(0, -n); break; }
    }
  }
  return safe;
}

export async function readStream(response: Response, config: AiConfig, signal: AbortSignal, update: (text: string) => void): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('AI 接口没有返回内容。');
  const decoder = new TextDecoder();
  let buffer = '', result = '', bytes = 0, done = false, truncated = false;
  function event(frame: string) {
    const data = frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).replace(/^ /, '')).join('\n');
    if (!data) return;
    if (data === '[DONE]' && config.provider !== 'anthropic') { done = true; return; }
    let value;
    try { value = JSON.parse(data); } catch { throw new Error('AI 流式响应格式无效。'); }
    if (value?.error || value?.type === 'error') throw new Error('AI 服务在生成过程中返回错误，请重试。');
    let text: unknown;
    if (config.provider === 'anthropic') {
      if (value?.type === 'message_stop') done = true;
      if (value?.type === 'message_delta' && value.delta?.stop_reason === 'max_tokens') truncated = true;
      if (value?.type === 'content_block_delta' && value.delta?.type === 'text_delta') text = value.delta.text;
      if (value?.type === 'content_block_start' && value.content_block?.type === 'text') text = value.content_block.text;
    } else {
      const choice = value?.choices?.[0];
      if (choice?.finish_reason === 'length' || choice?.finish_reason === 'content_filter') truncated = true;
      text = choice?.delta?.content;
    }
    if (text !== undefined && text !== null && typeof text !== 'string') throw new Error('AI 流式文本格式无效。');
    if (typeof text === 'string' && text) {
      result += text;
      if (result.length > 12000) throw new Error('AI 分析过长，请重新生成。');
      update(redactPartial(result, config.apiKey));
    }
  }
  try {
    while (!done) {
      if (signal.aborted) throw new Error('分析已取消或超时。');
      let part;
      try { part = await reader.read(); } catch { throw new Error('AI 连接中断，请重试。'); }
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 1048576) throw new Error('AI 流式响应过大，请重试。');
      buffer += decoder.decode(part.value, { stream: true });
      // Normalize complete CRLF pairs only, preserving a CR split across chunks.
      buffer = buffer.replace(/\r\n/g, '\n');
      let boundary;
      while (!done && (boundary = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2); event(frame);
      }
    }
    if (signal.aborted) throw new Error('分析已取消或超时。');
    if (!done) throw new Error('AI 输出意外中断，请重新生成。');
    if (truncated) throw new Error('AI 输出未完整生成，请重试。');
    if (!result.trim()) throw new Error('AI 接口未返回有效分析文本。');
    const safe = redactPartial(result, config.apiKey, true);
    update(safe);
    return safe;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
