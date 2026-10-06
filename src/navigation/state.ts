export type LibrarySort = 'favorite' | 'recent' | 'title';
export interface LibraryFilters { query: string; difficulty: 'all' | 'Easy' | 'Medium' | 'Hard'; tag: string; sort: LibrarySort }
export interface NavigationState extends LibraryFilters { open: boolean; view: 'home' | 'detail'; scroll: number }
export const defaultFilters: LibraryFilters = { query: '', difficulty: 'all', tag: '', sort: 'favorite' };
export function normalizeNavigation(value: unknown): NavigationState {
  const state = value as NavigationState;
  if (!state || typeof state.open !== 'boolean' || !['home', 'detail'].includes(state.view) || typeof state.query !== 'string' || state.query.length > 500 || !Number.isFinite(state.scroll) || state.scroll < 0) throw new Error('Invalid state');
  const difficulty = state.difficulty ?? 'all', tag = state.tag ?? '', sort = state.sort ?? 'favorite';
  if (!['all', 'Easy', 'Medium', 'Hard'].includes(difficulty) || typeof tag !== 'string' || tag.length > 100 || !['favorite', 'recent', 'title'].includes(sort)) throw new Error('Invalid filters');
  return { open: state.open, view: state.view, query: state.query, scroll: Math.min(state.scroll, 10000000), difficulty, tag, sort };
}
