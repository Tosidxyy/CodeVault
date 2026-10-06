import { english } from './catalog.ts';
export type Locale = 'zh' | 'en';
export const browserLocale = (language: string): Locale => language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
const templates = Object.entries(english).filter(([key]) => key.includes('${')).map(([key, translated]) => {
  const parts = key.split(/\$\{\d+\}/g).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return { pattern: new RegExp('^' + parts.join('([\\s\\S]*?)') + '$'), translated };
});
export function translate(value: string | undefined, locale: Locale): string {
  if (!value || locale === 'zh') return value ?? '';
  if (english[value]) return english[value];
  const trimmed = value.trim();
  if (english[trimmed]) return value.replace(trimmed, english[trimmed]);
  if (value.startsWith('连接失败：')) return english['连接失败：'] + translate(value.slice('连接失败：'.length), locale);
  for (const row of templates) { const match = value.match(row.pattern); if (match) return row.translated.replace(/\$\{(\d+)\}/g, (_, index) => match[Number(index) + 1]); }
  return value;
}
