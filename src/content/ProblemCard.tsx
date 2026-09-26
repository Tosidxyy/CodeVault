import { useProblem } from './useProblem';
import { Bookmark } from './Bookmark';
import { useState } from 'react';
import { Solutions } from './Solutions';
import { Note } from './Note';
import type { CaptureIntent } from '../platforms/editor';

const difficultyLabels = { Easy: '简单', Medium: '中等', Hard: '困难' };

export function ProblemCard({ intent, onIntentHandled }: { intent?: CaptureIntent; onIntentHandled: () => void }) {
  const { state, retry } = useProblem();
  const [revision, setRevision] = useState(0);
  return <><div className="card problem" aria-live="polite" aria-busy={state.status === 'loading'}>
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
      <Bookmark key={`${state.problem.url}:${revision}`} problem={state.problem} />
    </>}
  </div>{state.status === 'ready' && <><Solutions key={state.problem.url} problem={state.problem} intent={intent} onIntentHandled={onIntentHandled} onSaved={() => setRevision((value) => value + 1)} /><Note key={`note:${state.problem.url}`} problem={state.problem} onSaved={() => setRevision((value) => value + 1)} /></>}</>;
}
