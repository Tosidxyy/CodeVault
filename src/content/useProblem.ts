import { useCallback, useEffect, useState } from 'react';
import { leetcode } from '../platforms/leetcode';
import type { Problem } from '../platforms/types';

type ProblemState =
  | { status: 'idle' }
  | { status: 'loading'; url: string }
  | { status: 'ready'; problem: Problem }
  | { status: 'error'; message: string };

export function useProblem(enabled = true) {
  const [state, setState] = useState<ProblemState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) { setState({ status: 'idle' }); return; }
    let currentUrl: string | null | undefined;
    let active: AbortController | undefined;

    function update() {
      const route = leetcode.getProblemRoute(window.location.href);
      if (route?.url === currentUrl || (!route && currentUrl === null)) return;
      currentUrl = route?.url ?? null;
      active?.abort();
      if (!route) {
        setState({ status: 'idle' });
        return;
      }
      const controller = new AbortController();
      active = controller;
      setState({ status: 'loading', url: route.url });
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]);
      const stillCurrent = () => !controller.signal.aborted &&
        leetcode.getProblemRoute(window.location.href)?.url === route.url;
      void leetcode.getProblem(route, signal).then((problem) => {
        if (stillCurrent()) setState({ status: 'ready', problem });
      }).catch((error: unknown) => {
        if (!stillCurrent()) return;
        const message = signal.aborted ? '获取题目超时，请重试。' :
          error instanceof Error && error.message.startsWith('题目') ? error.message :
          '暂时无法获取题目，请检查网络后重试。';
        setState({ status: 'error', message });
      });
    }

    update();
    // Content scripts cannot patch the page's isolated history object. Only
    // compare the URL here; unchanged routes never trigger network requests.
    const timer = window.setInterval(update, 500);
    window.addEventListener('popstate', update);
    window.addEventListener('pageshow', update);
    return () => {
      active?.abort();
      window.clearInterval(timer);
      window.removeEventListener('popstate', update);
      window.removeEventListener('pageshow', update);
    };
  }, [attempt, enabled]);

  return { state, retry };
}
