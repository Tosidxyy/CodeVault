export interface PanelLayout { right: number; bottom: number; expanded: boolean }
export const defaultPanelLayout: PanelLayout = { right: 16, bottom: 16, expanded: false };
export function validatePanelLayout(value: unknown): PanelLayout {
  const row = value as PanelLayout;
  if (!row || typeof row.expanded !== 'boolean' || !Number.isFinite(row.right) || !Number.isFinite(row.bottom) || row.right < 0 || row.bottom < 0 || row.right > 10000000 || row.bottom > 10000000) throw new Error('浮窗位置无效。');
  return { right: row.right, bottom: row.bottom, expanded: row.expanded };
}
export function clampPanelLayout(layout: PanelLayout, width: number, height: number, viewportWidth: number, viewportHeight: number): PanelLayout {
  return { ...layout,
    right: Math.round(Math.max(8, Math.min(layout.right, Math.max(8, viewportWidth - width - 8)))),
    bottom: Math.round(Math.max(8, Math.min(layout.bottom, Math.max(8, viewportHeight - height - 8)))) };
}
