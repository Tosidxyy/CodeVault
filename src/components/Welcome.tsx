export function Welcome({ compact = false }: { compact?: boolean }) {
  return <section className="rounded-[20px] bg-white p-6 shadow-sm">
    <p className="mb-2 text-xs font-medium tracking-widest text-neutral-500">你的算法知识库</p>
    <h1 className="text-2xl font-bold">🚀 CodeVault</h1>
    <p className="mt-4 text-sm leading-6 text-neutral-600">打开 LeetCode，点击右下角的悬浮按钮展开面板。</p>
    {!compact && <div className="my-5 rounded-xl bg-neutral-100 p-4 text-sm leading-6">
      <strong>从一道题开始积累</strong>
      <p className="mt-1 text-neutral-600">已支持识别、收藏题目，保存多个解法并加载回编辑器。笔记和 AI 将在后续版本开放。</p>
    </div>}
    <a className="mt-5 block rounded-xl bg-neutral-900 px-4 py-3 text-center text-sm font-medium text-white hover:bg-neutral-700" href="https://leetcode.cn/problemset/" target="_blank" rel="noreferrer">打开 LeetCode</a>
  </section>;
}
