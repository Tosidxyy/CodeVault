import { noteStorage } from '../database/client';
import { textBlock, validateBlocks } from '../database/noteBlocks';
import type { NoteBlock, StoredNote } from '../database/types';
import type { Problem } from '../platforms/types';

type Document = { blocks: NoteBlock[]; images: Record<string, string> };
type State = Document & { ready: boolean; saving: boolean; dirty: boolean; error: string; saved: boolean; legacy: boolean };
const drafts = new Map<string, NoteDraft>();
export function noteDraft(problem: Problem) {
  let draft = drafts.get(problem.id);
  if (!draft) { draft = new NoteDraft(problem); drafts.set(problem.id, draft); }
  return draft;
}
export class NoteDraft {
  state: State = { blocks: [textBlock()], images: {}, ready: false, saving: false, dirty: false, error: '', saved: false, legacy: false };
  private listeners = new Set<() => void>();
  private revision = 0;
  private sessionId = crypto.randomUUID();
  private timer?: ReturnType<typeof setTimeout>;
  private pending = 0;
  private enqueued = '';
  private baseline = '';
  private reading = false;
  constructor(private problem: Problem) { void this.read(); }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); this.release(); }; };
  private release() {
    if (!this.listeners.size && this.state.ready && !this.state.dirty && !this.pending && drafts.get(this.problem.id) === this) drafts.delete(this.problem.id);
  }
  snapshot = () => this.state;
  private update(patch: Partial<State>) { this.state = { ...this.state, ...patch }; this.listeners.forEach((fn) => fn()); }
  async read() {
    if (this.reading || this.pending) return;
    this.reading = true; clearTimeout(this.timer);
    this.update({ error: '' });
    try {
      const note = await noteStorage.get(this.problem.id);
      const document = { blocks: note?.blocks ?? [textBlock()], images: note?.images ?? {} };
      this.revision = note?.revision ?? 0; this.sessionId = crypto.randomUUID();
      this.baseline = JSON.stringify(document); this.enqueued = '';
      this.update({ ...document, ready: true, saved: !!note, dirty: false, legacy: !!note?.legacy });
    } catch (error) { this.update({ error: (error as Error).message }); }
    finally { this.reading = false; }
  }
  edit(document: Document) {
    if (!this.state.ready || this.reading) return;
    try {
      const validated = validateBlocks(document.blocks, document.images);
      const fingerprint = JSON.stringify(validated);
      this.update({ ...validated, dirty: fingerprint !== this.baseline || (this.pending > 0 && fingerprint !== this.enqueued) });
      clearTimeout(this.timer);
      // Conflicts/errors pause automatic writes until the user retries or reads the latest note.
      if (!this.state.error) this.timer = setTimeout(() => this.flush(), 750);
    } catch (error) { this.update({ error: (error as Error).message }); }
  }
  flush = (retry = false) => {
    clearTimeout(this.timer);
    if (!this.state.ready || !this.state.dirty || this.reading || (this.state.error && !retry)) return;
    const document = { blocks: this.state.blocks, images: this.state.images };
    const fingerprint = JSON.stringify(document);
    if (this.pending && fingerprint === this.enqueued) return;
    this.enqueued = fingerprint; this.pending++;
    this.update({ saving: true, error: '' });
    void noteStorage.saveBlocks(this.problem, document.blocks, document.images, this.revision, this.sessionId).then((note: StoredNote) => {
      this.revision = note.revision; this.baseline = fingerprint;
      this.update({ saved: true, error: '', dirty: JSON.stringify({ blocks: this.state.blocks, images: this.state.images }) !== fingerprint });
    }).catch((error: Error) => { this.update({ error: error.message, dirty: true }); })
      .finally(() => {
        this.pending--; this.update({ saving: this.pending > 0 });
        if (!this.pending && this.state.dirty && !this.state.error) { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 750); }
        this.release();
      });
  };
}
