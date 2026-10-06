import type { Problem } from '../platforms/types';
import { getLocale } from '../i18n/locale';
import type { NoteBlock, StoredNote } from './types';
import type { LibraryProblem } from './types';
import type { SolutionDraft, SolutionMetadata, StoredSolution, StorageRequest, StorageResponse, StoredProblem } from './types';

async function send<T>(request: StorageRequest): Promise<T> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
    throw new Error('请在已加载的 CodeVault 扩展中查看收藏。');
  }
  let response: StorageResponse;
  try { response = await chrome.runtime.sendMessage(request) as StorageResponse; }
  catch { throw new Error('无法连接本地知识库，请重新加载扩展并刷新页面。'); }
  if (!response || !response.ok) throw new Error(response?.error || '本地存储暂时不可用，请重试。');
  if (/\.(save|saveBlocks|update|delete|trash|restore|purge)$/.test(request.action)) { window.dispatchEvent(new Event('codevault-data-saved')); window.dispatchEvent(new Event('codevault-library-changed')); }
  return response.data as T;
}

export const problemStorage = {
  trashList: () => send<LibraryProblem[]>({ channel: 'codevault', action: 'trash.list' }),
  trash: (id: string) => send<StoredProblem>({ channel: 'codevault', action: 'problems.trash', id }),
  restore: (id: string, token: string) => send<StoredProblem>({ channel: 'codevault', action: 'trash.restore', id, token }),
  purge: (id: string, token: string) => send<null>({ channel: 'codevault', action: 'trash.purge', id, token }),
  library: () => send<LibraryProblem[]>({ channel: 'codevault', action: 'library.list' }),
  visit: (id: string) => send<StoredProblem | null>({ channel: 'codevault', action: 'problems.visit', id }),
  get: (id: string) => send<StoredProblem | null>({ channel: 'codevault', action: 'problems.get', id }),
  list: () => send<StoredProblem[]>({ channel: 'codevault', action: 'problems.list' }),
  save: (problem: Problem) => send<StoredProblem>({ channel: 'codevault', action: 'problems.save', problem }),
};

export const noteStorage = {
  saveBlocks: (problem: Problem, blocks: NoteBlock[], images: Record<string, string>, revision: number, sessionId: string) => send<StoredNote>({ channel: 'codevault', action: 'notes.saveBlocks', problem, blocks, images, revision, sessionId }),
  get: (problemId: string) => send<StoredNote | null>({ channel: 'codevault', action: 'notes.get', problemId }),
  save: (problem: Problem, markdown: string, revision: number, images?: Record<string, string>) => send<StoredNote>({ channel: 'codevault', action: 'notes.save', problem, markdown, revision, images }),
};

export const solutionStorage = {
  saveAnalysis: (solution: StoredSolution, analysis: string) => send<StoredSolution>({ channel: 'codevault', action: 'solutions.analysis.save', problemId: solution.problemId, id: solution.id, revision: solution.revision ?? 0, analysis }),
  update: (solution: StoredSolution, metadata: SolutionMetadata) => send<StoredSolution>({ channel: 'codevault', action: 'solutions.update', problemId: solution.problemId, id: solution.id, revision: solution.revision ?? 0, metadata }),
  delete: (solution: StoredSolution) => send<null>({ channel: 'codevault', action: 'solutions.delete', problemId: solution.problemId, id: solution.id, revision: solution.revision ?? 0 }),
  list: (problemId: string) => send<StoredSolution[]>({ channel: 'codevault', action: 'solutions.list', problemId }),
  save: (problem: Problem, solution: SolutionDraft) => send<StoredSolution>({ channel: 'codevault', action: 'solutions.save', problem, solution, locale: getLocale() }),
};
