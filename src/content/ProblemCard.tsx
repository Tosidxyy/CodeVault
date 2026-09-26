import { useProblem } from './useProblem';

const difficultyLabels = { Easy: '简单', Medium: '中等', Hard: '困难' };

export function ProblemCard() {
  const { state, retry } = useProblem();
  return <div className="card problem" aria-live="polite" aria-busy={state.status === 'loading'}>
    <strong>当前题目</strong>
    {state.status === 'idle' && <p>打开一道 LeetCode 题目，即可查看题目信息。</p>}
    {state.status === 'loading' && <p role="status">正在识别题目…</p>}
    {state.status === 'error' && <><p role="alert">{state.message}</p><button className="retry" onClick={retry}>重新识别</button></>}
    {state.status === 'ready' && <>
      <h3><a href={state.problem.url} target="_blank" rel="noreferrer">{state.problem.title}</a></h3>
      <span className={`difficulty ${state.problem.difficulty.toLowerCase()}`}>{difficultyLabels[state.problem.difficulty]}</span>
      <div className="tags" aria-label="题目标签">{state.problem.tags.length
        ? state.problem.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)
        : <span className="muted">暂无标签</span>}</div>
      <p className="problem-url">{state.problem.url}</p>
      <p className="muted">已识别 · 尚未收藏</p>
    </>}
  </div>;
}
