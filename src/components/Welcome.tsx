export function Welcome() {
  return <section className="rounded-[20px] bg-white p-6 shadow-sm">
    <p className="mb-2 text-xs font-medium tracking-widest text-neutral-500">你的算法知识库</p>
    <h1 className="text-2xl font-bold">🚀 CodeVault</h1>
    <p className="mt-4 text-sm leading-6 text-neutral-600">打开 LeetCode，点击右下角的悬浮按钮展开面板。</p>
    <div className="my-5 rounded-xl bg-neutral-100 p-4 text-sm leading-6">
      <strong>从一道题开始积累</strong>
      <p className="mt-1 text-neutral-600">已支持识别 LeetCode 题目的标题、难度和标签。解法保存和本地知识库将在后续版本开放。</p>
    </div>
    <a className="block rounded-xl bg-neutral-900 px-4 py-3 text-center text-sm font-medium text-white hover:bg-neutral-700" href="https://leetcode.cn/problemset/" target="_blank" rel="noreferrer">打开 LeetCode</a>
  </section>;
}
