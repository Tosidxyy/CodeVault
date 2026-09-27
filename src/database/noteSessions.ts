import type { Problem } from '../platforms/types';
import type { NoteBlock, StoredNote } from './types';
import { saveBlocks } from './notes';

// Serialize snapshots from one editor, including a final snapshot sent during pagehide.
// Each transaction still checks the last committed revision against other editors.
const sessions = new Map<string, { problemId: string; revision?: number; pending: number; tail: Promise<unknown> }>();
export function saveNoteSession(key: string, problem: Problem, blocks: NoteBlock[], images: Record<string, string>, revision: number): Promise<StoredNote> {
  let session = sessions.get(key);
  if (!session) {
    if (sessions.size >= 128) {
      for (const [id, old] of sessions) { if (!old.pending) { sessions.delete(id); break; } }
      if (sessions.size >= 128) return Promise.reject(new Error('Too many active note editors'));
    }
    session = { problemId: problem.id, pending: 0, tail: Promise.resolve() };
    sessions.set(key, session);
  }
  if (session.problemId !== problem.id) return Promise.reject(new Error('Invalid editor session'));
  const current = session;
  current.pending++;
  const task = current.tail.catch(() => {}).then(async () => {
    const note = await saveBlocks(problem, blocks, current.revision ?? revision, images);
    current.revision = note.revision;
    return note;
  });
  current.tail = task.then(() => undefined, () => undefined).finally(() => { current.pending--; });
  void current.tail.catch(() => {});
  return task;
}
export async function waitNoteSaves(problemId: string) {
  await Promise.allSettled([...sessions.values()].filter((session) => session.problemId === problemId).map((session) => session.tail));
}
