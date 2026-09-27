import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { problemStorage } from '../database/client';
import type { LibraryProblem } from '../database/types';
import { navigationRequest, persistNavigation, useNavigation } from '../navigation/store';
const labels = { Easy: '简单', Medium: '中等', Hard: '困难' };
export function SavedProblems() {
  const view = useNavigation((state) => state.view);
  const query = useNavigation((state) => state.query);
  const [items, setItems] = useState<LibraryProblem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [navigating, setNavigating] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void problemStorage.library().then((rows) => { if (active) { setItems(rows); setError(''); } })
      .catch((reason: Error) => { if (active) setError(reason.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  useEffect(() => {
    const refresh = () => setAttempt((value) => value + 1);
    window.addEventListener('focus', refresh);
    window.addEventListener('codevault-library-changed', refresh);
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener('codevault-library-changed', refresh); };
  }, []);
  useLayoutEffect(() => { if (list.current && !loading && view === 'home') list.current.scrollTop = useNavigation.getState().scroll; }, [loading, view]);
  const filtered = items.filter((item) => [item.title, ...item.tags, ...item.solutionNames].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const recent = [...filtered].filter((item) => item.lastOpenedAt).sort((a, b) => b.lastOpenedAt! - a.lastOpenedAt!).slice(0, 3);
  const select = async (item: LibraryProblem) => {
    setNavigating(true); setError('');
    try { await persistNavigation(); await navigationRequest('navigate', { id: item.id, state: useNavigation.getState() }); }
    catch (reason) { setError((reason as Error).message); }
    finally { setNavigating(false); }
  };
  return <section className="library" aria-label="我的收藏" aria-busy={loading || navigating}>
    <input type="search" aria-label="搜索收藏题目" placeholder="搜索题目、标签、解法名称" value={query} maxLength={500} onChange={(event) => { useNavigation.setState({ query: event.target.value, scroll: 0 }); if (list.current) list.current.scrollTop = 0; void persistNavigation().catch(() => {}); }} />
    <div className="library-heading"><h2>我的收藏（{items.length}）</h2><button disabled={loading} onClick={() => setAttempt((value) => value + 1)}>刷新收藏</button></div>
    {error && <p role="alert">{error}</p>}
    {loading && !items.length && <p role="status">正在读取收藏…</p>}
    <div className="library-scroll" ref={list} onScroll={(event) => { if (view === 'home' && event.currentTarget.getClientRects().length) { useNavigation.setState({ scroll: event.currentTarget.scrollTop }); void persistNavigation().catch(() => {}); } }}>
      <h3>最近访问</h3>
      {recent.length ? <div className="recent-list">{recent.map((item) => <button disabled={navigating} key={item.id} onClick={() => void select(item)}>{item.title}</button>)}</div> : <p className="muted">打开收藏题目后，会显示在这里。</p>}
      <h3>全部收藏</h3>
      {!loading && !items.length && <p className="muted">还没有收藏。在题目面板点击“收藏题目”，即可保存到本机。</p>}
      {!!items.length && !filtered.length && <p className="muted">没有匹配的收藏题目。</p>}
      <ul>{filtered.map((item) => <li key={item.id}>
        <a aria-disabled={navigating} href={item.url} onClick={(event) => { event.preventDefault(); if (!navigating) void select(item); }}>{item.title}</a>
        <span className={`difficulty ${item.difficulty.toLowerCase()}`}>{labels[item.difficulty]}</span>
        <p>{item.solutionCount} 个解法 · {item.hasNote ? '有笔记' : '暂无笔记'}</p>
        <p>{item.tags.join(' / ') || '暂无标签'}</p>
        {item.lastOpenedAt && <p>最近访问 {new Date(item.lastOpenedAt).toLocaleString('zh-CN')}</p>}
      </li>)}</ul>
    </div>
  </section>;
}
