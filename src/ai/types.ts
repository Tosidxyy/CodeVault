export interface AiConfig { endpoint: string; model: string; apiKey: string; revision: string }
export type AiStatus = Omit<AiConfig, 'apiKey'>;

export function validateEndpoint(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2000) throw new Error('请输入完整 HTTPS 接口地址。');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('请输入完整 HTTPS 接口地址。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/chat/completions')) {
    throw new Error('接口需为无查询参数的 HTTPS 地址，以 /chat/completions 结尾。');
  }
  return url.href;
}

export function permissionOrigin(endpoint: string): string { return new URL(endpoint).origin + '/*'; }

export function validateConfig(value: unknown): Omit<AiConfig, 'revision'> {
  if (!value || typeof value !== 'object') throw new Error('AI 配置无效。');
  const config = value as Record<string, unknown>;
  const endpoint = validateEndpoint(config.endpoint);
  if (typeof config.model !== 'string' || !config.model.trim() || config.model.length > 150 || /[\r\n]/.test(config.model) ||
    typeof config.apiKey !== 'string' || !config.apiKey.trim() || config.apiKey.length > 512 || /[^\x21-\x7e]/.test(config.apiKey.trim())) {
    throw new Error('请填写有效的模型名称和 API Key。');
  }
  return { endpoint, model: config.model.trim(), apiKey: config.apiKey.trim() };
}
