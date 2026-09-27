import { create } from 'zustand';
export interface NavigationState { open: boolean; view: 'home' | 'detail'; query: string; scroll: number }
export const initialNavigation: NavigationState = { open: false, view: 'home', query: '', scroll: 0 };
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
