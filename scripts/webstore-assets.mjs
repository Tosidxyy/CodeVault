// Reproducible store assets: real extension UI, isolated demonstration data, no network/API keys.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openCurrentProblem } from '../tests/helpers.mjs';

const output = resolve('docs/webstore');
await mkdir(resolve(output, 'screenshots'), { recursive: true });
await copyFile('public/icons/icon-128.png', resolve(output, 'icon-128.png'));
const extension = resolve('dist');
const context = await chromium.launchPersistentContext('', {
  channel: process.env.CODEVAULT_BROWSER_CHANNEL || 'chromium', headless: true,
  viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.getByRole('heading', { name: '我的收藏（0）' }).waitFor();
  const send = async (message) => {
    const result = await popup.evaluate((message) => chrome.runtime.sendMessage({ channel: 'codevault', ...message }), message);
    assert.equal(result.ok, true, JSON.stringify(result));
    return result.data;
  };
  const problem = { id: 'leetcode:1', platform: 'leetcode', slug: 'two-sum', url: 'https://leetcode.cn/problems/two-sum/', title: '两数之和', difficulty: 'Easy', tags: ['数组', '哈希表'] };
  const rows = [problem,
    { ...problem, id: 'leetcode:20', slug: 'valid-parentheses', title: '有效的括号', url: 'https://leetcode.cn/problems/valid-parentheses/', tags: ['栈', '字符串'] },
    { ...problem, id: 'leetcode:206', slug: 'reverse-linked-list', title: '反转链表', url: 'https://leetcode.cn/problems/reverse-linked-list/', tags: ['链表', '递归'] },
    { ...problem, id: 'leetcode:3', slug: 'longest-substring-without-repeating-characters', title: '无重复字符的最长子串', url: 'https://leetcode.cn/problems/longest-substring-without-repeating-characters/', difficulty: 'Medium', tags: ['哈希表', '滑动窗口'] },
  ];
  for (const row of rows) await send({ action: 'problems.save', problem: row });
  const code = 'class Solution:\n    def twoSum(self, nums, target):\n        seen = {}\n        for i, value in enumerate(nums):\n            if target - value in seen:\n                return [seen[target - value], i]\n            seen[value] = i';
  for (const [name, note] of [['哈希表 · 一次遍历', '先查找补数，再记录当前位置，避免重复使用同一元素。'], ['复习版本', '时间 O(n)，空间 O(n)。']]) {
    await send({ action: 'solutions.save', problem, solution: { id: crypto.randomUUID(), name, note, code, language: 'python', source: 'own', sourceUrl: problem.url } });
  }
  const image = await popup.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 240;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f2efff'; ctx.fillRect(0, 0, 600, 240);
    ctx.font = 'bold 24px sans-serif'; ctx.fillStyle = '#5b4699'; ctx.fillText('target = 9', 30, 42);
    [2, 7, 11, 15].forEach((v, i) => { ctx.fillStyle = i < 2 ? '#ded3ff' : '#fff'; ctx.fillRect(30 + i * 140, 75, 110, 70); ctx.fillStyle = '#292334'; ctx.font = '28px sans-serif'; ctx.fillText(String(v), 68 + i * 140, 120); });
    ctx.font = '22px sans-serif'; ctx.fillStyle = '#5b4699'; ctx.fillText('2 + 7 = 9    →    [0, 1]', 30, 200);
    return canvas.toDataURL('image/png');
  });
  const imageId = crypto.randomUUID();
  await send({ action: 'notes.saveBlocks', problem, blocks: [
    { id: crypto.randomUUID(), type: 'text', content: '思路：遍历数组，用哈希表记录已经见过的数。\n每次先查找 target - value，找到后返回两个下标。\n\n易错点：先查再存，避免使用同一个元素两次。' },
    { id: crypto.randomUUID(), type: 'image', assetId: imageId },
  ], images: { [imageId]: image }, revision: 0, sessionId: crypto.randomUUID() });
  await send({ action: 'problems.visit', id: problem.id });
  const page = await context.newPage();
  // The host page is clearly labelled as a demo. The extension is unmodified production dist.
  await page.route('https://leetcode.cn/**', (route) => {
    if (new URL(route.request().url()).pathname === '/graphql/') return route.fulfill({ json: { data: { question: { questionId: '1', titleSlug: 'two-sum', title: 'Two Sum', translatedTitle: '两数之和', difficulty: 'Easy', topicTags: [{ name: 'Array', translatedName: '数组' }, { name: 'Hash Table', translatedName: '哈希表' }] } } } });
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>body{margin:0;background:#f7f8fb;color:#32323e;font:16px 'Microsoft YaHei',sans-serif}main{margin:64px 48px;width:680px}small{color:#73717f}h1{font-size:32px;margin-top:32px}section{background:white;padding:24px;border-radius:16px;margin-top:24px}pre{font:16px/1.9 Consolas,monospace;white-space:pre-wrap}span{color:#655298}</style><main><small>CodeVault · 功能演示数据</small><h1>两数之和</h1><span>数组 · 哈希表</span><section>记录自己的解法与思路，建立可复习的算法知识库。</section><section><small>Python · 示例代码（未运行、未提交）</small><pre>${code.replaceAll('<', '&lt;')}</pre></section></main></html>` });
  });
  await page.goto(problem.url);
  await page.getByRole('button', { name: '展开 CodeVault', exact: true }).click();
  await page.getByRole('heading', { name: '我的收藏（4）' }).waitFor();
  await page.screenshot({ path: resolve(output, 'screenshots/01-library.png') });
  await openCurrentProblem(page);
  await page.getByRole('textbox', { name: '笔记文字 1', exact: true }).waitFor();
  await page.getByRole('img', { name: '笔记图片', exact: true }).evaluate((img) => img.decode());
  await page.getByRole('textbox', { name: '笔记文字 1', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(output, 'screenshots/02-notes.png') });
  const settings = await context.newPage();
  await settings.goto(`chrome-extension://${id}/options.html`);
  await settings.getByRole('button', { name: '测试连接', exact: true }).waitFor();
  await settings.screenshot({ path: resolve(output, 'screenshots/03-ai-settings.png') });
  const promo = await context.newPage();
  await promo.setViewportSize({ width: 440, height: 280 });
  const icon = `data:image/png;base64,${(await readFile(resolve(output, 'icon-128.png'))).toString('base64')}`;
  await promo.setContent(`<!doctype html><html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;width:440px;height:280px;overflow:hidden;background:linear-gradient(125deg,#5c4590,#2f244c);color:#fff;font-family:'Microsoft YaHei',sans-serif}.brand{position:absolute;left:32px;top:47px;display:flex;align-items:center;gap:16px}.brand img{width:76px;height:76px;border-radius:18px}.brand b{font-size:30px;letter-spacing:-1px}.items{position:absolute;left:34px;top:160px;display:flex;gap:12px}.items span{display:block;width:112px;height:76px;border:1px solid #ffffff35;background:#ffffff12;border-radius:12px;text-align:center;padding:11px;font-size:14px}.items strong{display:block;font-size:24px;line-height:29px;font-family:Consolas,monospace}</style><div class="brand"><img src="${icon}"><b>CodeVault</b></div><div class="items"><span><strong>&lt;/&gt;</strong>解法</span><span><strong>✎</strong>笔记</span><span><strong>AI</strong>分析</span></div></html>`);
  await promo.locator('img').evaluate((img) => img.decode());
  await promo.screenshot({ path: resolve(output, 'promo-440x280.png') });
  await promo.setViewportSize({ width: 1400, height: 560 });
  await promo.setContent(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;width:1400px;height:560px;background:linear-gradient(125deg,#5c4590,#2f244c);color:white;font-family:'Microsoft YaHei',sans-serif;display:flex;align-items:center;padding:80px;gap:70px}img{width:200px;height:200px;border-radius:44px}h1{font-size:68px;margin:0 0 20px;letter-spacing:-2px}p{font-size:26px;color:#ede5ff;margin:0 0 32px}.features{display:flex;gap:16px}.features span{font-size:20px;border:1px solid #ffffff35;background:#ffffff12;border-radius:14px;padding:16px 24px}</style><img src="${icon}"><main><h1>CodeVault</h1><p>收藏题目，积累解法，留下自己的思考。</p><div class="features"><span>&lt;/&gt; 多版本解法</span><span>✎ 图文笔记</span><span>AI 可选分析</span></div></main></html>`);
  await promo.locator('img').evaluate((img) => img.decode());
  await promo.screenshot({ path: resolve(output, 'promo-1400x560.png') });
  const listing = await readFile(resolve(output, 'LISTING.md'), 'utf8');
  const description = listing.split('## 详细介绍\n')[1]?.split('\n## 分类与链接')[0]?.trim();
  assert.ok(description && description.length < 16000);
  await writeFile(resolve(output, 'description.txt'), description + '\n', 'utf8');
  for (const [name, width, height] of [['icon-128.png', 128, 128], ['promo-440x280.png', 440, 280], ['promo-1400x560.png', 1400, 560], ...['01-library', '02-notes', '03-ai-settings'].map((n) => [`screenshots/${n}.png`, 1280, 800])]) {
    const bytes = await readFile(resolve(output, name));
    assert.equal(bytes.readUInt32BE(16), width); assert.equal(bytes.readUInt32BE(20), height);
    if (name !== 'icon-128.png') { assert.equal(bytes[24], 8); assert.equal(bytes[25], 2, 'Store screenshot/promo must be 24-bit RGB without alpha'); }
    console.log(`${name}: ${width}x${height}`);
  }
} finally { await context.close(); }
