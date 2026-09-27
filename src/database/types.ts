import type { Problem } from '../platforms/types';

export interface StoredProblem extends Problem {
  createdAt: number;
  updatedAt: number;
  favoriteAt?: number;
  lastOpenedAt?: number | null;
}

export interface LibraryProblem extends StoredProblem {
  solutionNames: string[];
  solutionCount: number;
  hasNote: boolean;
}

export interface SolutionDraft {
  id: string;
  name: string;
  code: string;
  language: string;
  source: 'own' | 'reference' | 'template';
  sourceUrl: string;
  note: string;
}

export interface StoredSolution extends SolutionDraft {
  problemId: string;
  createdAt: number;
  revision?: number;
}

export type SolutionMetadata = Pick<SolutionDraft, 'name' | 'note' | 'source' | 'sourceUrl'>;

export interface StoredNote {
  images?: Record<string, string>;
  problemId: string;
  markdown: string;
  revision: number;
  updatedAt: number;
}

export type StorageRequest =
  | { channel: 'codevault'; action: 'library.list' }
  | { channel: 'codevault'; action: 'problems.visit'; id: string }
  | { channel: 'codevault'; action: 'notes.get'; problemId: string }
  | { channel: 'codevault'; action: 'notes.save'; problem: Problem; markdown: string; revision: number; images?: Record<string, string> }
  | { channel: 'codevault'; action: 'problems.get'; id: string }
  | { channel: 'codevault'; action: 'problems.list' }
  | { channel: 'codevault'; action: 'problems.save'; problem: Problem }
  | { channel: 'codevault'; action: 'solutions.list'; problemId: string }
  | { channel: 'codevault'; action: 'solutions.save'; problem: Problem; solution: SolutionDraft }
  | { channel: 'codevault'; action: 'solutions.update'; problemId: string; id: string; revision: number; metadata: SolutionMetadata }
  | { channel: 'codevault'; action: 'solutions.delete'; problemId: string; id: string; revision: number };

export type StorageResponse =
  | { ok: true; data: StoredProblem | StoredProblem[] | StoredSolution | StoredSolution[] | StoredNote | null }
  | { ok: false; error: string };
