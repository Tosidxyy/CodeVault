// Runs in MAIN world. No extension storage or arbitrary script execution.
export {};
type Range = { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
type Model = { getValue(): string; getLanguageId(): string; getVersionId(): number; getFullModelRange(): Range };
type Editor = {
  getDomNode(): HTMLElement | null; getModel(): Model | null; getRawOptions(): { readOnly?: boolean };
  pushUndoStop(): boolean; executeEdits(source: string, edits: { range: Range; text: string; forceMoveMarkers: boolean }[]): boolean;
};
type MonacoWindow = Window & { monaco?: { editor?: { getEditors?: () => Editor[] } } };
type Ticket = { editor: Editor; model: Model; version: number; code: string; language: string; url: string; expires: number };
const tickets = new Map<string, Ticket>();

function visible(editor: Editor): boolean {
  const node = editor.getDomNode();
  if (!node?.isConnected || editor.getRawOptions().readOnly) return false;
  const rect = node.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== 'hidden';
}

window.addEventListener('message', (event: MessageEvent) => {
  const request = event.data;
  if (event.source !== window || event.origin !== location.origin || request?.channel !== 'codevault-editor' || !['read', 'prepare-load', 'load'].includes(request.type) ||
    typeof request.id !== 'string' || !/^[\da-f-]{36}$/i.test(request.id)) return;
  let payload;
  try {
    if (request.url !== location.href) throw new Error('页面已切换，请重新读取代码。');
    for (const [key, ticket] of tickets) if (ticket.expires < Date.now()) tickets.delete(key);
    if (request.type === 'load') {
      if (typeof request.deadline !== 'number' || !Number.isFinite(request.deadline) || Date.now() > request.deadline) throw new Error('加载请求已过期，请重新点击加载。');
      const ticket = tickets.get(request.ticket);
      tickets.delete(request.ticket);
      if (!ticket || ticket.url !== location.href) throw new Error('加载请求已过期，请重新点击加载。');
      const { editor, model } = ticket;
      if (!visible(editor) || editor.getModel() !== model || model.getVersionId() !== ticket.version || model.getValue() !== ticket.code) {
        throw new Error('编辑器内容已变化，本次未替换，请重新点击加载。');
      }
      if (model.getLanguageId() !== ticket.language || request.language !== ticket.language) throw new Error('编辑器语言已变化，请切换到解法语言后重试。');
      if (typeof request.code !== 'string' || !request.code.trim() || request.code.length > 500000) throw new Error('解法代码无效。');
      const normalize = (value: string) => value.replace(/\r\n?/g, '\n');
      if (normalize(model.getValue()) !== normalize(request.code)) {
        editor.pushUndoStop();
        const applied = editor.executeEdits('codevault.load', [{ range: model.getFullModelRange(), text: request.code, forceMoveMarkers: true }]);
        editor.pushUndoStop();
        if (!applied) throw new Error('编辑器拒绝加载，请检查代码区是否可编辑。');
        if (normalize(model.getValue()) !== normalize(request.code)) throw new Error('加载结果与解法不一致，请检查编辑器，可用 Ctrl+Z 撤销。');
      }
      payload = { ok: true, loaded: true, url: location.href };
    } else {
      const editors = (window as MonacoWindow).monaco?.editor?.getEditors?.();
      if (!editors) throw new Error('编辑器尚未就绪，请等待代码加载后重试。');
      const candidates = editors.filter((editor) => {
        const node = editor.getDomNode();
        const model = editor.getModel();
        if (!node || !model || !visible(editor) || model.getLanguageId() === 'plaintext') return false;
        return !request.target || node.getAttribute('data-codevault-editor') === request.target;
      });
      if (candidates.length !== 1) throw new Error(candidates.length ? (request.type === 'read' ? '发现多个代码编辑器，请使用目标编辑器的添加按钮。' : '发现多个代码编辑器，请只保留一个可编辑代码区后重试。') : '未找到可读取的代码编辑器，请打开题目代码区。');
      const model = candidates[0].getModel()!;
      const code = model.getValue();
      const language = model.getLanguageId();
      if (request.type === 'read' && !code.trim()) throw new Error('编辑器代码为空。');
      if (code.length > 500000) throw new Error('代码超过50万字符，暂不支持保存。');
      if (request.type === 'prepare-load') {
        const editor = candidates[0];
        if (typeof editor.executeEdits !== 'function' || typeof editor.pushUndoStop !== 'function' || typeof model.getVersionId !== 'function' || typeof model.getFullModelRange !== 'function') throw new Error('当前编辑器不支持可撤销加载。');
        if (request.language !== language) throw new Error(`语言不匹配：解法为 ${String(request.language).slice(0,40)}，当前为 ${language}。请先在网页切换语言。`);
        if (tickets.size >= 16) tickets.delete(tickets.keys().next().value!);
        const ticket = crypto.randomUUID();
        tickets.set(ticket, { editor, model, code, language, version: model.getVersionId(), url: location.href, expires: Date.now() + 3000 });
        payload = { ok: true, ticket, url: location.href };
      } else payload = { ok: true, code, language, url: location.href };
    }
  } catch (error) { payload = { ok: false, error: error instanceof Error ? error.message : '读取代码失败。' }; }
  window.postMessage({ channel: 'codevault-editor', type: 'result', id: request.id, ...payload }, location.origin);
});
