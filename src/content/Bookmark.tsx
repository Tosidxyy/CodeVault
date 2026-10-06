import { useT } from '../i18n/locale';
import { useEffect, useRef, useState } from 'react';
import { problemStorage } from '../database/client';
import { getProblemRoute } from '../platforms/leetcode';
import type { Problem } from '../platforms/types';

type State = { status: 'checking' | 'ready' | 'saving' | 'error'; saved: boolean; error?: string };

export function Bookmark({ problem }: { problem: Problem }) {
  const t = useT();
  const [state, setState] = useState<State>({ status: 'checking', saved: false });
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const token = ++generation.current;
    setState({ status: 'checking', saved: false });
    void problemStorage.get(problem.id).then((saved) => {
      if (generation.current === token) setState({ status: 'ready', saved: !!saved && !saved.deletedAt, error: saved?.deletedAt ? '题目已在回收站，请在题库恢复后编辑。' : undefined });
    }).catch((error: Error) => {
      if (generation.current === token) setState({ status: 'error', saved: false, error: error.message });
    });
    return () => { generation.current++; };
  }, [problem.id, attempt]);

  async function save() {
    if (getProblemRoute(location.href)?.url !== problem.url) return;
    const token = ++generation.current;
    setState({ status: 'saving', saved: state.saved });
    try {
      await problemStorage.save(problem);
      if (generation.current === token) setState({ status: 'ready', saved: true });
    } catch (error) {
      if (generation.current === token) setState({ status: 'ready', saved: state.saved, error: (error as Error).message });
    }
  }

  return <div className="bookmark">
    <p className="muted">{state.status === 'checking' ? t('正在读取收藏状态…') : state.status === 'error'
      ? t('收藏状态暂不可用') : state.saved ? t('已收藏 · 保存在本机') : t('已识别 · 尚未收藏')}</p>
    {t(state.error) && <p role="alert">{t(state.error)}</p>}
    {state.status === 'error' ? <button className="retry" onClick={() => setAttempt((value) => value + 1)}>{t("重试读取收藏")}</button>
      : <button className="retry" disabled={state.status !== 'ready'} onClick={() => void save()}>
        {state.status === 'saving' ? t('正在保存…') : state.saved ? t('更新收藏') : t('收藏题目')}
      </button>}
  </div>;
}
