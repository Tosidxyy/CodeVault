export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export interface Problem {
  id: string;
  title: string;
  slug: string;
  url: string;
  platform: 'leetcode';
  difficulty: Difficulty;
  tags: string[];
}

export interface ProblemRoute {
  slug: string;
  origin: string;
  url: string;
}

export interface PlatformAdapter {
  getProblemRoute(url: string): ProblemRoute | null;
  getProblem(route: ProblemRoute, signal: AbortSignal): Promise<Problem>;
}
