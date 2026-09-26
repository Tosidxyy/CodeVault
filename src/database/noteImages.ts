export const imagePrefix = 'codevault-image:';
export const maxImageBytes = 2 * 1024 * 1024;
export const maxTotalImageBytes = 6 * 1024 * 1024;
export const imageIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Images travel as JSON strings because Chrome runtime messaging does not transfer Blobs.
export function validateNoteImages(value: unknown, markdown: string): Record<string, string> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('图片数据无效。');
  const entries = Object.entries(value);
  if (entries.length > 5) throw new Error('每篇笔记最多5张图片。');
  const result: Record<string, string> = {};
  let total = 0;
  for (const [id, data] of entries) {
    if (!imageIdPattern.test(id) || typeof data !== 'string' || !data.startsWith('data:image/png;base64,') ||
      data.length > Math.ceil(maxImageBytes / 3) * 4 + 22) throw new Error('图片无效或超过2MB。');
    const base64 = data.slice(22);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0) throw new Error('图片编码无效。');
    const bytes = atob(base64);
    if (!bytes.startsWith('\x89PNG\r\n\x1a\n') || bytes.length > maxImageBytes) throw new Error('仅支持PNG图片数据。');
    total += bytes.length;
    if (total > maxTotalImageBytes) throw new Error('每篇笔记图片总大小不能超过6MB。');
    if (markdown.includes(imagePrefix + id)) result[id] = data;
  }
  return result;
}
