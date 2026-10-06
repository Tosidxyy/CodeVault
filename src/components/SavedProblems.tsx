import { useT } from '../i18n/locale';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Problem } from '../platforms/types';
import { problemStorage } from '../database/client';
import type { LibraryProblem } from '../database/types';
import { navigationRequest, persistNavigation, useNavigation } from '../navigation/store';
import { defaultFilters } from '../navigation/state';
import type { LibraryFilters } from '../navigation/state';
import { filterLibrary } from './libraryQuery';
const labels = { Easy: '简单', Medium: '中等', Hard: '困难' };
export function SavedProblems({ currentProblem, onOpenCurrent }: { currentProblem?: Problem; onOpenCurrent?: () => void }) {
  const t = useT();
  const view = useNavigation((state) => state.view);
  const query = useNavigation((state) => state.query);
  const difficulty = useNavigation((state) => state.difficulty);
  const tag = useNavigation((state) => state.tag);
  const sort = useNavigation((state) => state.sort);
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
  const filters = { query, difficulty, tag, sort };
  const filtered = filterLibrary(items, filters);
  const filteredTrash = filterLibrary(trash, filters);
  const tags = [...new Set((showTrash ? trash : items).flatMap(item => item.tags))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const hasFilters = difficulty !== 'all' || !!tag || sort !== 'favorite';
  function changeFilters(patch: Partial<LibraryFilters>) {
    useNavigation.setState({ ...patch, scroll: 0 });
    if (list.current) list.current.scrollTop = 0;
    void persistNavigation().catch(() => {});
  }
  const recent = [...filtered].filter((item) => item.lastOpenedAt).sort((a, b) => b.lastOpenedAt! - a.lastOpenedAt!).slice(0, 3);
  const select = async (item: LibraryProblem) => {
    setNavigating(true); setError('');
    try { await persistNavigation(); await navigationRequest('navigate', { id: item.id, state: useNavigation.getState() }); }
    catch (reason) { setError((reason as Error).message); }
    finally { setNavigating(false); }
  };
  return <section className="library" aria-label={t("我的收藏")} aria-busy={loading || navigating}>
    <h1 className="library-title">{showTrash ? t('回收站') : t('我的算法库')}</h1>
    <p className="library-intro">{showTrash ? t('找回移出的题目，保留你的积累。') : t('把每次练习，变成可以复习的积累。')}</p>
    <label className="library-search">{showTrash ? t('搜索回收站') : t('搜索题库')}<input type="search" aria-label={showTrash ? t('搜索回收站') : t('搜索收藏题目')} placeholder={t("搜索题目、标签、解法名称")} value={query} maxLength={500} onChange={event => changeFilters({ query: event.target.value })} /></label>
    <details className="library-filter-panel" open={hasFilters}><summary>{t("筛选与排序")}{hasFilters && <span>{t(" · 已启用")}</span>}</summary><div className="library-filters">
      <label>{t("难度")}<select aria-label={t("难度筛选")} value={difficulty} onChange={event => changeFilters({ difficulty: event.target.value as LibraryFilters['difficulty'] })}><option value="all">{t("全部难度")}</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
      <label>{t("标签")}<select aria-label={t("标签筛选")} value={tag} onChange={event => changeFilters({ tag: event.target.value })}><option value="">{t("全部标签")}</option>{tag && !tags.includes(tag) && <option value={tag}>{tag}{t("（无匹配）")}</option>}{tags.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>{t("排序")}<select aria-label={t("排序方式")} value={sort} onChange={event => changeFilters({ sort: event.target.value as LibraryFilters['sort'] })}><option value="favorite">{t("收藏时间")}</option><option value="recent">{t("最近访问")}</option><option value="title">{t("题目名称")}</option></select></label>
    </div><button onClick={() => changeFilters({ difficulty: defaultFilters.difficulty, tag: defaultFilters.tag, sort: defaultFilters.sort })}>{t("重置筛选")}</button></details>
    {(hasFilters || query.trim()) && <p className="library-filter-count">{t("匹配 ")}{showTrash ? filteredTrash.length : filtered.length} / {showTrash ? trash.length : items.length}{t(" 个题目")}</p>}
    {onOpenCurrent && !showTrash && <div className="current-problem-card"><span>{t("正在浏览")}</span><div>{currentProblem && <strong>{currentProblem.title}</strong>}<button onClick={onOpenCurrent}>{t("查看当前题目 →")}</button></div></div>}
    <div className="library-tools"><button disabled={working} onClick={() => { setShowTrash(value => !value); setPending(undefined); setNotice(''); }}>{showTrash ? t('返回收藏') : t(`回收站（${trash.length}）`)}</button></div>
    {t(error) && <p role="alert">{t(error)}</p>}
    {notice && <p role="status">{t(notice)}</p>}
    {pending && <div className="trash-confirm" role="alertdialog" aria-label={pending.action === 'trash' ? t('移入回收站确认') : t('永久删除题目确认')}><strong>{pending.action === 'trash' ? t('移入回收站？') : t('永久删除？')}</strong><p>“{pending.item.title}{t("”的全部解法、分析、笔记和图片")}{pending.action === 'trash' ? t('将一起移入回收站，可以恢复。') : t('将被清除，无法通过回收站恢复。已有备份文件不会被删除。')}</p><div><button disabled={working} onClick={() => void changeTrash(pending.item, pending.action)}>{pending.action === 'trash' ? t('确认移入回收站') : t('确认永久删除题目')}</button><button disabled={working} onClick={() => setPending(undefined)}>{t("取消")}</button></div></div>}
    {loading && !items.length && <p role="status">{t("正在读取收藏…")}</p>}
    <div className="library-scroll" ref={list} onScroll={(event) => { if (!showTrash && view === 'home' && event.currentTarget.getClientRects().length) { useNavigation.setState({ scroll: event.currentTarget.scrollTop }); void persistNavigation().catch(() => {}); } }}>
      {showTrash ? <><div className="library-heading"><h2>{t("回收站 ")}{trash.length}</h2><button disabled={loading || working} onClick={() => setAttempt(value => value + 1)}>{t("刷新回收站")}</button></div><p>{t("不会自动清空。恢复保留所有关联内容。")}</p>{!loading && !trash.length && <p>{t("回收站是空的。")}</p>}{!!trash.length && !filteredTrash.length && <p>{t("没有匹配的回收站题目。")}</p>}<ul>{filteredTrash.map(item => <li className="trash-item" key={item.id}><div className="problem-item"><span className="problem-item-title">{item.title}</span><p>{item.solutionCount}{t(" 个解法 · ")}{item.hasNote ? t('有笔记') : t('暂无笔记')} · {new Date(item.deletedAt!).toLocaleDateString()}</p><div className="trash-actions"><button disabled={working} aria-label={t(`恢复题目：${item.title}`)} onClick={() => void changeTrash(item, 'restore')}>{t("恢复")}</button><button disabled={working} aria-label={t(`永久删除题目：${item.title}`)} onClick={() => setPending({ item, action: 'purge' })}>{t("永久删除")}</button></div></div></li>)}</ul></> : <>
      <h3>{t("最近访问")}</h3>
      {recent.length ? <div className="recent-list">{recent.map((item) => <button disabled={navigating} key={item.id} onClick={() => void select(item)}>{item.title}</button>)}</div> : <p className="muted">{t("打开收藏题目后，会显示在这里。")}</p>}
      <div className="library-heading"><h2 aria-label={t(`我的收藏（${items.length}）`)}>{t("全部收藏 ")}{items.length}</h2><button disabled={loading} onClick={() => setAttempt((value) => value + 1)}>{t("刷新收藏")}</button></div>
      {!loading && !items.length && <p className="muted">{t("还没有收藏。在题目面板点击“收藏题目”，即可保存到本机。")}</p>}
      {!!items.length && !filtered.length && <p className="muted">{t("没有匹配的收藏题目。")}</p>}
      <ul>{filtered.map((item) => <li key={item.id}>
        <a className="problem-item" aria-label={item.title} aria-disabled={navigating} href={item.url} onClick={(event) => { event.preventDefault(); if (!navigating) void select(item); }}>
          <div className="problem-item-heading"><span className="problem-item-title">{item.title}</span><span className={`difficulty ${item.difficulty.toLowerCase()}`}>{t(labels[item.difficulty])}</span></div>
          <p className="library-tags">{item.tags.join(' · ') || t('暂无标签')}</p>
          <div className="problem-item-footer"><span>{item.solutionCount}{t(" 个解法")}</span><span className={item.hasNote ? 'has-note' : undefined}>{item.hasNote ? t('有笔记') : t('暂无笔记')}</span><span className="problem-item-arrow" aria-hidden="true">{t("打开题目 ›")}</span></div>
        </a>
        <div className="problem-item-actions"><button disabled={working || navigating} aria-label={t(`移入回收站：${item.title}`)} onClick={() => setPending({ item, action: 'trash' })}>{t("移入回收站")}</button></div>
      </li>)}</ul></>}
    </div>
  </section>;
}
