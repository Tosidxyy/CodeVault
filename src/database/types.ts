import type { Problem } from '../platforms/types';

export interface StoredProblem extends Problem {
  createdAt: number;
  updatedAt: number;
  favoriteAt?: number;
  lastOpenedAt?: number | null;
  deletedAt?: number;
  trashToken?: string;
  purged?: boolean;
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
  analysis?: string;
  analysisUpdatedAt?: number;
  problemId: string;
  createdAt: number;
  revision?: number;
  updatedAt?: number;
}

export type SolutionMetadata = Pick<SolutionDraft, 'name' | 'note' | 'source' | 'sourceUrl'>;

export type NoteBlock = { id: string; type: 'text'; content: string } | { id: string; type: 'image'; assetId: string };

export interface StoredNote {
  blocks: NoteBlock[];
  legacy?: { markdown: string; images: Record<string, string> };
  images?: Record<string, string>;
  problemId: string;
  markdown: string;
  revision: number;
  updatedAt: number;
}

export type StorageRequest =
  | { channel: 'codevault'; action: 'trash.list' }
  | { channel: 'codevault'; action: 'problems.trash'; id: string }
  | { channel: 'codevault'; action: 'trash.restore' | 'trash.purge'; id: string; token: string }
  | { channel: 'codevault'; action: 'library.list' }
  | { channel: 'codevault'; action: 'problems.visit'; id: string }
  | { channel: 'codevault'; action: 'notes.saveBlocks'; problem: Problem; blocks: NoteBlock[]; images: Record<string, string>; revision: number; sessionId: string }
  | { channel: 'codevault'; action: 'notes.get'; problemId: string }
  | { channel: 'codevault'; action: 'notes.save'; problem: Problem; markdown: string; revision: number; images?: Record<string, string> }
  | { channel: 'codevault'; action: 'problems.get'; id: string }
  | { channel: 'codevault'; action: 'problems.list' }
  | { channel: 'codevault'; action: 'problems.save'; problem: Problem }
  | { channel: 'codevault'; action: 'solutions.analysis.save'; problemId: string; id: string; revision: number; analysis: string }
  | { channel: 'codevault'; action: 'solutions.list'; problemId: string }
  | { channel: 'codevault'; action: 'solutions.save'; problem: Problem; solution: SolutionDraft }
  | { channel: 'codevault'; action: 'solutions.update'; problemId: string; id: string; revision: number; metadata: SolutionMetadata }
  | { channel: 'codevault'; action: 'solutions.delete'; problemId: string; id: string; revision: number };

export type StorageResponse =
  | { ok: true; data: StoredProblem | StoredProblem[] | StoredSolution | StoredSolution[] | StoredNote | null }
  | { ok: false; error: string };
