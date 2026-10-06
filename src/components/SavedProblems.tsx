import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Problem } from '../platforms/types';
import { problemStorage } from '../database/client';
import type { LibraryProblem } from '../database/types';
import { navigationRequest, persistNavigation, useNavigation } from '../navigation/store';
const labels = { Easy: '简单', Medium: '中等', Hard: '困难' };
export function SavedProblems({ currentProblem, onOpenCurrent }: { currentProblem?: Problem; onOpenCurrent?: () => void }) {
  const view = useNavigation((state) => state.view);
  const query = useNavigation((state) => state.query);
  const [items, setItems] = useState<LibraryProblem[]>([]);
  const [trash, setTrash] = useState<LibraryProblem[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [pending, setPending] = useState<{ item: LibraryProblem; action: 'trash' | 'purge' }>();
  const [working, setWorking] = useState(false);
  const operationLock = useRef(false);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [navigating, setNavigating] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([problemStorage.library(), problemStorage.trashList()]).then(([rows, removed]) => { if (active) { setItems(rows); setTrash(removed); setError(''); } })
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
  useLayoutEffect(() => { if (list.current && !loading && view === 'home') list.current.scrollTop = showTrash ? 0 : useNavigation.getState().scroll; }, [loading, view, showTrash]);
  async function changeTrash(item: LibraryProblem, action: 'trash' | 'restore' | 'purge') {
    if (operationLock.current) return;
    operationLock.current = true; setWorking(true); setError(''); setNotice('');
    try {
      if (action === 'trash') await problemStorage.trash(item.id);
      else if (action === 'restore') await problemStorage.restore(item.id, item.trashToken!);
      else await problemStorage.purge(item.id, item.trashToken!);
      setPending(undefined); setNotice(action === 'trash' ? '题目已移入回收站，解法和笔记已保留。' : action === 'restore' ? '题目已恢复。' : '题目及关联内容已永久删除。');
      setAttempt(value => value + 1);
    } catch (reason) { setError((reason as Error).message); }
    finally { operationLock.current = false; setWorking(false); }
  }
  const filtered = items.filter((item) => [item.title, ...item.tags, ...item.solutionNames].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const filteredTrash = trash.filter((item) => [item.title, ...item.tags, ...item.solutionNames].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const recent = [...filtered].filter((item) => item.lastOpenedAt).sort((a, b) => b.lastOpenedAt! - a.lastOpenedAt!).slice(0, 3);
  const select = async (item: LibraryProblem) => {
    setNavigating(true); setError('');
    try { await persistNavigation(); await navigationRequest('navigate', { id: item.id, state: useNavigation.getState() }); }
    catch (reason) { setError((reason as Error).message); }
    finally { setNavigating(false); }
  };
  return <section className="library" aria-label="我的收藏" aria-busy={loading || navigating}>
    <h1 className="library-title">{showTrash ? '回收站' : '我的算法库'}</h1>
    <p className="library-intro">{showTrash ? '找回移出的题目，保留你的积累。' : '把每次练习，变成可以复习的积累。'}</p>
    <label className="library-search">{showTrash ? '搜索回收站' : '搜索题库'}<input type="search" aria-label={showTrash ? '搜索回收站' : '搜索收藏题目'} placeholder="搜索题目、标签、解法名称" value={query} maxLength={500} onChange={(event) => { useNavigation.setState({ query: event.target.value, scroll: 0 }); if (list.current) list.current.scrollTop = 0; void persistNavigation().catch(() => {}); }} /></label>
    {onOpenCurrent && !showTrash && <div className="current-problem-card"><span>正在浏览</span><div>{currentProblem && <strong>{currentProblem.title}</strong>}<button onClick={onOpenCurrent}>查看当前题目 →</button></div></div>}
    <div className="library-tools"><button disabled={working} onClick={() => { setShowTrash(value => !value); setPending(undefined); setNotice(''); }}>{showTrash ? '返回收藏' : `回收站（${trash.length}）`}</button></div>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {pending && <div className="trash-confirm" role="alertdialog" aria-label={pending.action === 'trash' ? '移入回收站确认' : '永久删除题目确认'}><strong>{pending.action === 'trash' ? '移入回收站？' : '永久删除？'}</strong><p>“{pending.item.title}”的全部解法、分析、笔记和图片{pending.action === 'trash' ? '将一起移入回收站，可以恢复。' : '将被清除，无法通过回收站恢复。已有备份文件不会被删除。'}</p><div><button disabled={working} onClick={() => void changeTrash(pending.item, pending.action)}>{pending.action === 'trash' ? '确认移入回收站' : '确认永久删除题目'}</button><button disabled={working} onClick={() => setPending(undefined)}>取消</button></div></div>}
    {loading && !items.length && <p role="status">正在读取收藏…</p>}
    <div className="library-scroll" ref={list} onScroll={(event) => { if (!showTrash && view === 'home' && event.currentTarget.getClientRects().length) { useNavigation.setState({ scroll: event.currentTarget.scrollTop }); void persistNavigation().catch(() => {}); } }}>
      {showTrash ? <><div className="library-heading"><h2>回收站 {trash.length}</h2><button disabled={loading || working} onClick={() => setAttempt(value => value + 1)}>刷新回收站</button></div><p>不会自动清空。恢复保留所有关联内容。</p>{!loading && !trash.length && <p>回收站是空的。</p>}{!!trash.length && !filteredTrash.length && <p>没有匹配的回收站题目。</p>}<ul>{filteredTrash.map(item => <li className="trash-item" key={item.id}><div className="problem-item"><span className="problem-item-title">{item.title}</span><p>{item.solutionCount} 个解法 · {item.hasNote ? '有笔记' : '暂无笔记'} · {new Date(item.deletedAt!).toLocaleDateString()}</p><div className="trash-actions"><button disabled={working} aria-label={`恢复题目：${item.title}`} onClick={() => void changeTrash(item, 'restore')}>恢复</button><button disabled={working} aria-label={`永久删除题目：${item.title}`} onClick={() => setPending({ item, action: 'purge' })}>永久删除</button></div></div></li>)}</ul></> : <>
      <h3>最近访问</h3>
      {recent.length ? <div className="recent-list">{recent.map((item) => <button disabled={navigating} key={item.id} onClick={() => void select(item)}>{item.title}</button>)}</div> : <p className="muted">打开收藏题目后，会显示在这里。</p>}
      <div className="library-heading"><h2 aria-label={`我的收藏（${items.length}）`}>全部收藏 {items.length}</h2><button disabled={loading} onClick={() => setAttempt((value) => value + 1)}>刷新收藏</button></div>
      {!loading && !items.length && <p className="muted">还没有收藏。在题目面板点击“收藏题目”，即可保存到本机。</p>}
      {!!items.length && !filtered.length && <p className="muted">没有匹配的收藏题目。</p>}
      <ul>{filtered.map((item) => <li key={item.id}>
        <a className="problem-item" aria-label={item.title} aria-disabled={navigating} href={item.url} onClick={(event) => { event.preventDefault(); if (!navigating) void select(item); }}>
          <div className="problem-item-heading"><span className="problem-item-title">{item.title}</span><span className={`difficulty ${item.difficulty.toLowerCase()}`}>{labels[item.difficulty]}</span></div>
          <p className="library-tags">{item.tags.join(' · ') || '暂无标签'}</p>
          <div className="problem-item-footer"><span>{item.solutionCount} 个解法</span><span className={item.hasNote ? 'has-note' : undefined}>{item.hasNote ? '有笔记' : '暂无笔记'}</span><span className="problem-item-arrow" aria-hidden="true">打开题目 ›</span></div>
        </a>
        <div className="problem-item-actions"><button disabled={working || navigating} aria-label={`移入回收站：${item.title}`} onClick={() => setPending({ item, action: 'trash' })}>移入回收站</button></div>
      </li>)}</ul></>}
    </div>
  </section>;
}
