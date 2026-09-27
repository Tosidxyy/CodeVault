import { Brand } from './Brand';
export function Welcome() {
  return <section className="welcome">
    <p className="eyebrow">你的算法知识库</p>
    <h1><Brand /></h1>
    <p>收藏题目，积累解法，留下自己的思考。</p>
    <p className="welcome-help">在 LeetCode 点击右下角的 CodeVault 按钮，即可查看题库、保存解法和图文笔记。选择 AI 服务后，可流式分析并保存到解法。</p>
    <a className="welcome-link" href="https://leetcode.cn/problemset/" target="_blank" rel="noreferrer">打开 LeetCode →</a>
  </section>;
}
