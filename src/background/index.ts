import { getProblem, listProblems, saveProblem } from '../database/problems';
import { validateProblem, validProblemId, validateSolution } from '../database/validation';
import { listSolutions, saveSolution } from '../database/solutions';
import type { StorageResponse } from '../database/types';

function trustedSender(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id || !sender.url) return false;
  if (sender.url.startsWith(chrome.runtime.getURL(''))) return true;
  try {
    const url = new URL(sender.url);
    return sender.frameId === 0 && url.protocol === 'https:' && ['leetcode.cn', 'leetcode.com'].includes(url.host);
  } catch { return false; }
}

async function handle(message: Record<string, unknown>, sender: chrome.runtime.MessageSender): Promise<StorageResponse> {
  if (!trustedSender(sender)) return { ok: false, error: '不支持的请求来源。' };
  try {
    switch (message.action) {
      case 'problems.get':
        if (!validProblemId(message.id)) return { ok: false, error: '题目ID无效。' };
        return { ok: true, data: await getProblem(message.id) };
      case 'problems.list':
        return { ok: true, data: await listProblems() };
      case 'solutions.list':
        if (!validProblemId(message.problemId)) return { ok: false, error: '题目ID无效。' };
        return { ok: true, data: await listSolutions(message.problemId) };
      case 'solutions.save': {
        let problem, solution;
        try { problem = validateProblem(message.problem); solution = validateSolution(message.solution, problem); }
        catch { return { ok: false, error: '解法数据无效，请检查名称、代码和来源。' }; }
        if (!sender.url?.startsWith(chrome.runtime.getURL('')) && new URL(sender.url!).origin !== new URL(problem.url).origin) {
          return { ok: false, error: '题目来源不匹配，请重新读取代码。' };
        }
        return { ok: true, data: await saveSolution(problem, solution) };
      }
      case 'problems.save': {
        let problem;
        try { problem = validateProblem(message.problem); }
        catch { return { ok: false, error: '题目信息无效，请重新识别。' }; }
        // sender.url can retain the initial document URL after history.pushState.
        // Scope writes to the trusted origin; the content UI checks the live route.
        if (!sender.url?.startsWith(chrome.runtime.getURL('')) && new URL(sender.url!).origin !== new URL(problem.url).origin) {
          return { ok: false, error: '题目来源不匹配，请重新识别。' };
        }
        return { ok: true, data: await saveProblem(problem) };
      }
      default: return { ok: false, error: '不支持的存储操作。' };
    }
  } catch { return { ok: false, error: '本地存储暂时不可用，请重试。' }; }
}

// Register synchronously and keep the channel open until the IDB transaction completes.
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== 'object' || (message as Record<string, unknown>).channel !== 'codevault') return false;
  void handle(message as Record<string, unknown>, sender).then(sendResponse);
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  console.info('CodeVault extension initialized');
});
