import { create } from 'zustand';
import { defaultFilters } from './state';
import type { NavigationState } from './state';
export type { NavigationState } from './state';
export const initialNavigation: NavigationState = { open: false, view: 'home', ...defaultFilters, scroll: 0 };
export const useNavigation = create<NavigationState>(() => initialNavigation);
export async function navigationRequest(action: string, data: Record<string, unknown> = {}) {
  const result = await chrome.runtime.sendMessage({ channel: 'codevault-navigation', action, ...data });
  if (!result?.ok) throw new Error(result?.error ?? '导航暂时不可用，请重试。');
  return result.data;
}
let pending = Promise.resolve();
export function persistNavigation() {
  const state = useNavigation.getState();
  pending = pending.catch(() => {}).then(() => navigationRequest('set', { state }));
  return pending;
}
