import { validateBlocks } from '../database/noteBlocks';
import { imageIdPattern } from '../database/noteImages';
import { saveNoteSession, waitNoteSaves } from '../database/noteSessions';
import { getProblem, listProblems, saveProblem, visitProblem, ProblemTrashedError } from '../database/problems';
import { changeTrash, TrashConflictError } from '../database/trash';
import { listLibrary } from '../database/library';
import './navigation';
import '../ai/background';
import { validateProblem, validProblemId, validateSolution, validSolutionTarget, validateMetadata } from '../database/validation';
import { listSolutions, saveSolution, changeSolution, SolutionConflictError } from '../database/solutions';
import type { StorageResponse } from '../database/types';
import { getNote, saveNote, NoteConflictError } from '../database/notes';
import { validateNoteImages } from '../database/noteImages';

export function trustedSender(sender: chrome.runtime.MessageSender): boolean {
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
      case 'trash.list': return { ok: true, data: await listLibrary(true) };
      case 'problems.trash':
      case 'trash.restore':
      case 'trash.purge': {
        if (!validProblemId(message.id) || (message.action !== 'problems.trash' && (typeof message.token !== 'string' || !imageIdPattern.test(message.token)))) return { ok: false, error: '回收站目标无效。' };
        return { ok: true, data: await changeTrash(message.id, message.action === 'problems.trash' ? 'trash' : message.action === 'trash.restore' ? 'restore' : 'purge', message.token as string | undefined) };
      }
      case 'library.list':
        return { ok: true, data: await listLibrary() };
      case 'problems.visit':
        if (!validProblemId(message.id)) return { ok: false, error: '题目ID无效。' };
        return { ok: true, data: await visitProblem(message.id) };
      case 'notes.get':
        if (!validProblemId(message.problemId)) return { ok: false, error: '题目ID无效。' };
        await waitNoteSaves(message.problemId);
        return { ok: true, data: await getNote(message.problemId) };
      case 'notes.saveBlocks': {
        let problem, document;
        try {
          problem = validateProblem(message.problem);
          document = validateBlocks(message.blocks, message.images);
          if (!Number.isSafeInteger(message.revision) || (message.revision as number) < 0 || (message.revision as number) >= Number.MAX_SAFE_INTEGER || typeof message.sessionId !== 'string' || !imageIdPattern.test(message.sessionId)) throw new Error('笔记版本信息无效。');
        } catch (error) { return { ok: false, error: (error as Error).message }; }
        if (!sender.url?.startsWith(chrome.runtime.getURL('')) && new URL(sender.url!).origin !== new URL(problem.url).origin) return { ok: false, error: '题目来源不匹配。' };
        const key = `${sender.tab?.id ?? sender.url}:${message.sessionId}`;
        return { ok: true, data: await saveNoteSession(key, problem, document.blocks, document.images, message.revision as number) };
      }
      case 'notes.save': {
        let problem;
        try { problem = validateProblem(message.problem); }
        catch { return { ok: false, error: '题目信息无效。' }; }
        if (typeof message.markdown !== 'string' || message.markdown.length > 20000 ||
          !Number.isSafeInteger(message.revision) || (message.revision as number) < 0 || (message.revision as number) >= Number.MAX_SAFE_INTEGER) {
          return { ok: false, error: '笔记数据无效，最多支持20000字符。' };
        }
        if (!sender.url?.startsWith(chrome.runtime.getURL('')) && new URL(sender.url!).origin !== new URL(problem.url).origin) {
          return { ok: false, error: '题目来源不匹配，请重新打开面板。' };
        }
        let images;
        try { images = validateNoteImages(message.images, message.markdown); }
        catch (error) { return { ok: false, error: (error as Error).message }; }
        return { ok: true, data: await saveNote(problem, message.markdown, message.revision as number, images) };
      }
      case 'solutions.analysis.save': {
        if (!validSolutionTarget(message) || (message.revision as number) >= Number.MAX_SAFE_INTEGER || typeof message.analysis !== 'string' || !message.analysis.trim() || message.analysis.length > 12000) return { ok: false, error: '分析数据或解法版本无效。' };
        return { ok: true, data: await changeSolution(message.problemId as string, message.id as string, message.revision as number, undefined, message.analysis) };
      }
      case 'solutions.update':
      case 'solutions.delete': {
        if (!validSolutionTarget(message)) return { ok: false, error: '解法信息无效。' };
        let metadata;
        if (message.action === 'solutions.update') {
          try { metadata = validateMetadata(message.metadata); }
          catch { return { ok: false, error: '请检查名称、备注和来源链接（仅支持 HTTP/HTTPS）。' }; }
        }
        return { ok: true, data: await changeSolution(message.problemId as string, message.id as string, message.revision as number, metadata) };
      }
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
  } catch (error) { return { ok: false, error: error instanceof SolutionConflictError || error instanceof NoteConflictError || error instanceof ProblemTrashedError || error instanceof TrashConflictError ? error.message : '本地存储暂时不可用，请重试。' }; }
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
