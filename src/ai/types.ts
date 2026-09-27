export const providers = {
  deepseek: { name: 'DeepSeek', endpoint: 'https://api.deepseek.com/chat/completions', models: ['deepseek-flash', 'deepseek-v4-pro'] },
  openai: { name: 'OpenAI', endpoint: 'https://api.openai.com/v1/chat/completions', models: ['gpt-4.1-mini', 'gpt-4.1'] },
  anthropic: { name: 'Anthropic Claude', endpoint: 'https://api.anthropic.com/v1/messages', models: ['claude-haiku-4-5-20251001', 'claude-sonnet-5'] },
} as const;
export type AiProvider = keyof typeof providers | 'custom';
export interface AiConfig { provider: AiProvider; endpoint: string; model: string; apiKey: string; revision: string }
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
  const provider = config.provider ?? 'custom';
  if (provider !== 'custom' && provider !== 'deepseek' && provider !== 'openai' && provider !== 'anthropic') throw new Error('不支持的 AI 服务商。');
  const endpoint = provider === 'custom' ? validateEndpoint(config.endpoint) : providers[provider].endpoint;
  if (provider !== 'custom' && (config.endpoint !== endpoint || !(providers[provider].models as readonly unknown[]).includes(config.model))) throw new Error('服务商接口或模型不匹配，请重新选择。');
  if (typeof config.model !== 'string' || !config.model.trim() || config.model.length > 150 || /[\r\n]/.test(config.model) ||
    typeof config.apiKey !== 'string' || !config.apiKey.trim() || config.apiKey.length > 512 || /[^\x21-\x7e]/.test(config.apiKey.trim())) {
    throw new Error('请填写有效的模型名称和 API Key。');
  }
  return { provider, endpoint, model: config.model.trim(), apiKey: config.apiKey.trim() };
}
