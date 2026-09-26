import type { Problem } from '../platforms/types';

export interface StoredProblem extends Problem {
  createdAt: number;
  updatedAt: number;
}

export interface SolutionDraft {
  id: string;
  name: string;
  code: string;
  language: string;
  source: 'own';
  sourceUrl: string;
  note: string;
}

export interface StoredSolution extends SolutionDraft {
  problemId: string;
  createdAt: number;
}

export type StorageRequest =
  | { channel: 'codevault'; action: 'problems.get'; id: string }
  | { channel: 'codevault'; action: 'problems.list' }
  | { channel: 'codevault'; action: 'problems.save'; problem: Problem }
  | { channel: 'codevault'; action: 'solutions.list'; problemId: string }
  | { channel: 'codevault'; action: 'solutions.save'; problem: Problem; solution: SolutionDraft };

export type StorageResponse =
  | { ok: true; data: StoredProblem | StoredProblem[] | StoredSolution | StoredSolution[] | null }
  | { ok: false; error: string };
