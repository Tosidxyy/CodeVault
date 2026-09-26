// Runs in MAIN world and exposes only a read operation, never extension storage.
type Model = { getValue(): string; getLanguageId(): string };
type Editor = { getDomNode(): HTMLElement | null; getModel(): Model | null; getRawOptions(): { readOnly?: boolean } };
type MonacoWindow = Window & { monaco?: { editor?: { getEditors?: () => Editor[] } } };

window.addEventListener('message', (event: MessageEvent) => {
  const request = event.data;
  if (event.source !== window || event.origin !== location.origin || request?.channel !== 'codevault-editor' || request.type !== 'read' ||
    typeof request.id !== 'string' || !/^[\da-f-]{36}$/i.test(request.id)) return;
  let payload;
  try {
    if (request.url !== location.href) throw new Error('页面已切换，请重新读取代码。');
    const editors = (window as MonacoWindow).monaco?.editor?.getEditors?.();
    if (!editors) throw new Error('编辑器尚未就绪，请等待代码加载后重试。');
    const candidates = editors.filter((editor) => {
      const node = editor.getDomNode();
      const model = editor.getModel();
      if (!node?.isConnected || !model || editor.getRawOptions().readOnly || model.getLanguageId() === 'plaintext') return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== 'hidden' &&
        (!request.target || node.getAttribute('data-codevault-editor') === request.target);
    });
    if (candidates.length !== 1) throw new Error(candidates.length ? '发现多个代码编辑器，请使用目标编辑器的添加按钮。' : '未找到可读取的代码编辑器，请打开题目代码区。');
    const model = candidates[0].getModel()!;
    const code = model.getValue();
    const language = model.getLanguageId();
    if (!code.trim()) throw new Error('编辑器代码为空。');
    if (code.length > 500000) throw new Error('代码超过50万字符，暂不支持保存。');
    payload = { ok: true, code, language, url: location.href };
  } catch (error) { payload = { ok: false, error: error instanceof Error ? error.message : '读取代码失败。' }; }
  window.postMessage({ channel: 'codevault-editor', type: 'result', id: request.id, ...payload }, location.origin);
});
