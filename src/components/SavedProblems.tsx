import { useEffect, useState } from 'react';
import { problemStorage } from '../database/client';
import type { StoredProblem } from '../database/types';

const labels = { Easy: '简单', Medium: '中等', Hard: '困难' };

export function SavedProblems() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ loading: boolean; items: StoredProblem[]; error?: string }>({ loading: true, items: [] });
  useEffect(() => {
    let active = true;
    setState({ loading: true, items: [] });
    void problemStorage.list().then((items) => {
      if (active) setState({ loading: false, items });
    }).catch((error: Error) => {
      if (active) setState({ loading: false, items: [], error: error.message });
    });
    return () => { active = false; };
  }, [attempt]);
  useEffect(() => {
    const refresh = () => setAttempt((value) => value + 1);
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  return <section className="mt-3 rounded-[20px] bg-white p-5 shadow-sm" aria-label="我的收藏" aria-busy={state.loading}>
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-base font-bold">我的收藏{!state.loading && !state.error ? `（${state.items.length}）` : ''}</h2>
      <button className="cursor-pointer text-xs text-neutral-600 underline disabled:opacity-50" disabled={state.loading} onClick={() => setAttempt((value) => value + 1)}>刷新收藏</button>
    </div>
    {state.loading && <p className="mt-3 text-sm text-neutral-500" role="status">正在读取收藏…</p>}
    {state.error && <p className="mt-3 text-sm text-red-700" role="alert">{state.error}</p>}
    {!state.loading && !state.error && (state.items.length ? <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
      {state.items.map((problem) => <li key={problem.id} className="rounded-xl bg-neutral-100 p-3">
        <a className="block break-words text-sm font-medium hover:underline" href={problem.url} target="_blank" rel="noreferrer">{problem.title}</a>
        <p className="mt-1 text-xs text-neutral-500">{labels[problem.difficulty]} · {problem.tags.join(' / ') || '暂无标签'}</p>
      </li>)}
    </ul> : <p className="mt-3 text-sm leading-6 text-neutral-500">还没有收藏。在题目面板点击“收藏题目”，即可保存到本机。</p>)}
  </section>;
}
