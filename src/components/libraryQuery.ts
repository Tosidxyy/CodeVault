import type { LibraryProblem } from '../database/types';
import type { LibraryFilters } from '../navigation/state';

export function filterLibrary(items: LibraryProblem[], filters: LibraryFilters): LibraryProblem[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return items.filter(item => (filters.difficulty === 'all' || item.difficulty === filters.difficulty) &&
    (!filters.tag || item.tags.includes(filters.tag)) &&
    [item.title, ...item.tags, ...item.solutionNames].join(' ').toLocaleLowerCase().includes(query))
    .sort((a, b) => {
      const order = filters.sort === 'recent' ? (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0)
        : filters.sort === 'title' ? a.title.localeCompare(b.title, 'zh-CN')
        : (b.favoriteAt ?? b.createdAt) - (a.favoriteAt ?? a.createdAt);
      return order || a.id.localeCompare(b.id);
    });
}
