export async function aiRequest<T>(action: string, config?: unknown): Promise<T> {
  let result;
  try { result = await chrome.runtime.sendMessage({ channel: 'codevault-ai', action, config }); }
  catch { throw new Error('无法连接 AI 服务，请重新加载扩展。'); }
  if (!result?.ok) throw new Error(result?.error || 'AI 操作失败，请重试。');
  return result.data as T;
}
