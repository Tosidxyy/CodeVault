import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { resolve, sep, join } from 'node:path';
import ts from 'typescript';
import { chromium } from 'playwright';
import { english } from '../src/i18n/catalog.ts';
import { browserLocale, translate } from '../src/i18n/translate.ts';

test('English catalog covers UI keys and formats dynamic messages without translating captured data', async () => {
  assert.equal(browserLocale('zh-TW'),'zh'); assert.equal(browserLocale('en-US'),'en');
  assert.equal(translate('已保存：取消','en'),'Saved: 取消');
  assert.equal(translate('我的收藏（12）','en'),'My bookmarks (12)');
  assert.equal(translate('连接失败：AI 接口拒绝访问，请检查 API Key 与账户权限。','en'),'Connection failed: The AI endpoint denied access. Check your key and account permissions.');
  const missing=[];
  for(const dir of ['src/components','src/content','src/options','src/popup'])for(const name of await readdir(dir)){
    if(!name.endsWith('.tsx'))continue;const file=join(dir,name),sf=ts.createSourceFile(file,await readFile(file,'utf8'),99,true,ts.ScriptKind.TSX);
    const visit=node=>{if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='t'&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0])){const text=node.arguments[0].text;if(/\p{Script=Han}/u.test(text)&&!english[text]&&!english[text.trim()])missing.push(text);}ts.forEachChild(node,visit);};visit(sf);
  }
  assert.deepEqual(missing,[]);
});

test('English defaults, live language switching, preserved user text, English AI and restart preference', {timeout:90000}, async()=>{
  const root=resolve('test-results');await mkdir(root,{recursive:true});const profile=await mkdtemp(resolve(root,'locale-profile-'));const extension=resolve('dist');let context;
  const launch=()=>chromium.launchPersistentContext(profile,{locale:'en-US',channel:process.env.CODEVAULT_BROWSER_CHANNEL||'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  try{
    context=await launch();const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
    const options=await context.newPage();await options.goto(`chrome-extension://${id}/options.html`);await options.getByRole('heading',{name:'Connect your AI assistant'}).waitFor();
    await options.waitForFunction(()=>document.title==='CodeVault settings'&&document.documentElement.lang==='en');
    const send=message=>options.evaluate(data=>chrome.runtime.sendMessage({channel:'codevault',...data}),message);
    const problem={id:'leetcode:1',platform:'leetcode',slug:'two-sum',url:'https://leetcode.com/problems/two-sum/',title:'取消',difficulty:'Easy',tags:['用户标签']};
    await send({action:'problems.save',problem});const solution=await send({action:'solutions.save',problem,locale:'en',solution:{id:crypto.randomUUID(),name:'',code:'def solve():\n    return 1',language:'python',source:'own',sourceUrl:problem.url,note:'用户备注'}});assert.equal(solution.data.name,'Solution 1');
    await send({action:'notes.saveBlocks',problem,blocks:[{id:crypto.randomUUID(),type:'text',content:'已保存'}],images:{},revision:0,sessionId:crypto.randomUUID()});
    await worker.evaluate(()=>{chrome.permissions.contains=async()=>true;globalThis.prompts=[];globalThis.fetch=async(_url,options)=>{const data=JSON.parse(options.body);globalThis.prompts.push(data.messages[0].content);return new Response('data: '+JSON.stringify({choices:[{delta:{content:'### Approach\nEnglish explanation.'}}]})+'\n\ndata: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});};});
    const config=await options.evaluate(()=>chrome.runtime.sendMessage({channel:'codevault-ai',action:'save',config:{provider:'custom',endpoint:'https://api.example.com/v1/chat/completions',model:'fixture',apiKey:'fake-locale-key'}}));assert.equal(config.ok,true);
    const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);await popup.getByRole('heading',{name:'My algorithm library'}).waitFor();await popup.getByRole('link',{name:'取消',exact:true}).waitFor();
    assert.equal(await popup.getByRole('button',{name:'Trash (0)',exact:true}).count(),1);
    await context.route('https://leetcode.com/**',route=>new URL(route.request().url()).pathname==='/graphql/'?route.fulfill({json:{data:{question:{questionId:'1',titleSlug:'two-sum',title:'Two Sum',difficulty:'Easy',topicTags:[]}}}}):route.fulfill({contentType:'text/html',body:'<h1>English locale fixture</h1>'}));
    const page=await context.newPage();await page.goto(problem.url);await page.getByRole('button',{name:'Open CodeVault',exact:true}).click();await page.getByRole('button',{name:'View current problem →',exact:true}).click();
    const note=page.getByRole('textbox',{name:'Note text',exact:true});await note.waitFor();assert.equal(await note.inputValue(),'已保存');
    await page.getByLabel('Analysis target').selectOption(solution.data.id);await page.getByRole('button',{name:'Read code for analysis',exact:true}).click();await page.getByRole('button',{name:'Send and analyze code',exact:true}).click();await page.getByLabel('AI analysis result').getByText('English explanation.',{exact:true}).waitFor();
    assert.match((await worker.evaluate(()=>globalThis.prompts))[0],/in English/);
    await page.getByLabel('Choose note image').setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});await page.getByRole('alert').filter({hasText:'Use a PNG, JPEG or WebP image.'}).waitFor();
    await popup.locator('main').screenshot({path:'test-results/english-library.png'});
    await options.setViewportSize({width:360,height:640});assert.equal(await options.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await options.screenshot({path:'test-results/english-settings-mobile.png'});
    await options.getByRole('button',{name:'English / 中文',exact:true}).click();await popup.getByRole('heading',{name:'我的算法库'}).waitFor();await page.getByRole('button',{name:'打开 AI 设置',exact:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:'笔记文字 1',exact:true}).inputValue(),'已保存');
    await context.close();context=undefined;context=await launch();const restarted=await context.newPage();await restarted.goto(`chrome-extension://${id}/options.html`);await restarted.getByRole('heading',{name:'连接你的 AI 助手'}).waitFor();
  }finally{await context?.close();assert.ok(profile.startsWith(root+sep));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:250});}
});
