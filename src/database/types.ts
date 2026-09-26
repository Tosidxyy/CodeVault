import type { Problem } from '../platforms/types';

export interface StoredProblem extends Problem {
  createdAt: number;
  updatedAt: number;
}

export type StorageRequest =
  | { channel: 'codevault'; action: 'problems.get'; id: string }
  | { channel: 'codevault'; action: 'problems.list' }
  | { channel: 'codevault'; action: 'problems.save'; problem: Problem };

export type StorageResponse =
  | { ok: true; data: StoredProblem | StoredProblem[] | null }
  | { ok: false; error: string };
