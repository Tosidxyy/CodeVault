import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { filterLibrary } from '../src/components/libraryQuery.ts';
import { defaultFilters, normalizeNavigation } from '../src/navigation/state.ts';

const base = { platform:'leetcode',difficulty:'Medium',tags:['动态规划'],solutionNames:['优化解法'],solutionCount:1,hasNote:false,createdAt:100,updatedAt:100 };
test('library filters compose exact difficulty/tag with search and deterministic non-mutating sorts', () => {
  const rows = [{...base,id:'leetcode:1',title:'目标 A',favoriteAt:100,lastOpenedAt:300}, {...base,id:'leetcode:2',title:'目标 B',favoriteAt:200,lastOpenedAt:100}, {...base,id:'leetcode:3',title:'其他',difficulty:'Easy',tags:['数组'],favoriteAt:50,lastOpenedAt:null}];
  const ids = options => filterLibrary(rows,{...defaultFilters,...options}).map(row=>row.id);
  assert.deepEqual(ids({query:' 优化 ',difficulty:'Medium',tag:'动态规划'}),['leetcode:2','leetcode:1']);
  assert.deepEqual(ids({sort:'recent'}),['leetcode:1','leetcode:2','leetcode:3']);
  assert.deepEqual(ids({query:'目标',sort:'title'}),['leetcode:1','leetcode:2']);
  assert.deepEqual(ids({difficulty:'Easy',tag:'动态规划'}),[]);
  assert.deepEqual(ids({tag:'不存在'}),[]);
  assert.equal(rows[0].id,'leetcode:1');
  const legacy={open:true,view:'home',query:'old',scroll:70};
  assert.deepEqual(normalizeNavigation(legacy),{...legacy,difficulty:'all',tag:'',sort:'favorite'});
  for(const patch of [{difficulty:'Impossible'},{sort:'random'},{tag:'x'.repeat(101)}])assert.throws(()=>normalizeNavigation({...legacy,...patch}));
});

test('combined filters/sorts restore across navigation and reload; narrow layout and reset remain usable', {timeout:90000}, async () => {
  const extension=resolve('dist');const context=await chromium.launchPersistentContext('',{channel:process.env.CODEVAULT_BROWSER_CHANNEL||'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  const errors=[];context.on('page',page=>{page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});});
  try {
    const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
    const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);await popup.getByRole('heading',{name:'我的收藏（0）'}).waitFor();
    const rows=Array.from({length:30},(_,i)=>({...base,id:`leetcode:${i+1}`,slug:`problem-${i+1}`,url:`https://leetcode.cn/problems/problem-${i+1}/`,title:i===1?'目标 A':i===4?'目标 B':`题目 ${i+1}`,difficulty:i%3===1?'Medium':'Easy',tags:i%3===1?['动态规划']:['数组'],favoriteAt:100+i,lastOpenedAt:i===1?3000:i===4?1000:null}));
    await worker.evaluate(rows=>new Promise((resolve,reject)=>{const r=indexedDB.open('codevault',5);r.onsuccess=()=>{const db=r.result,tx=db.transaction('problems','readwrite');rows.forEach(row=>tx.objectStore('problems').put(row));tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};}),rows);
    await context.route('https://leetcode.cn/**',route=>{
      if(new URL(route.request().url()).pathname==='/graphql/'){const slug=route.request().postDataJSON().variables.titleSlug;const row=rows.find(row=>row.slug===slug);return route.fulfill({json:{data:{question:{questionId:row.id.split(':')[1],titleSlug:slug,title:row.title,translatedTitle:row.title,difficulty:row.difficulty,topicTags:row.tags.map(name=>({name}))}}}});}
      return route.fulfill({contentType:'text/html',body:'<h1>Filter navigation fixture</h1>'});
    });
    await popup.getByRole('button',{name:'刷新收藏'}).click();await popup.getByRole('heading',{name:'我的收藏（30）'}).waitFor();
    await popup.locator('.library-filter-panel > summary').click();
    await popup.getByLabel('难度筛选').selectOption('Medium');await popup.getByLabel('标签筛选').selectOption('动态规划');await popup.getByRole('searchbox').fill('目标');
    const titles=()=>popup.locator('.problem-item-title').allTextContents();
    assert.deepEqual(await titles(),['目标 B','目标 A']);
    await popup.getByLabel('排序方式').selectOption('title');assert.deepEqual(await titles(),['目标 A','目标 B']);
    await popup.getByLabel('排序方式').selectOption('recent');assert.deepEqual(await titles(),['目标 A','目标 B']);
    await mkdir('test-results',{recursive:true});await popup.locator('main').screenshot({path:'test-results/library-filters-desktop.png'});
    await popup.locator('.library-scroll').evaluate(el=>{el.scrollTop=40;el.dispatchEvent(new Event('scroll'));});
    const opening=context.waitForEvent('page');await popup.getByRole('link',{name:'目标 B',exact:true}).click();const page=await opening;
    await page.getByRole('button',{name:'返回题库',exact:false}).click();
    for(const [label,value] of [['难度筛选','Medium'],['标签筛选','动态规划'],['排序方式','recent']])assert.equal(await page.getByLabel(label).inputValue(),value);
    assert.equal(await page.getByRole('searchbox').inputValue(),'目标');assert.ok(await page.locator('.library-scroll').evaluate(el=>el.scrollTop)>0);
    await page.reload();await page.getByRole('searchbox').waitFor();assert.equal(await page.getByLabel('标签筛选').inputValue(),'动态规划');assert.equal(await page.getByLabel('排序方式').inputValue(),'recent');
    await page.setViewportSize({width:360,height:640});assert.equal(await page.getByRole('region',{name:'CodeVault 面板'}).evaluate(el=>el.scrollWidth<=el.clientWidth),true);
    await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/library-filters-mobile.png'});
    await page.getByRole('button',{name:'重置筛选',exact:true}).click();
    await page.locator('.library-filter-panel > summary').click();assert.equal(await page.getByLabel('难度筛选').inputValue(),'all');assert.equal(await page.getByLabel('标签筛选').inputValue(),'');assert.equal(await page.getByRole('searchbox').inputValue(),'目标');
    const response=await popup.evaluate(()=>chrome.runtime.sendMessage({channel:'codevault-navigation',action:'set',state:{open:true,view:'home',query:'',scroll:0,difficulty:'Wrong',tag:'',sort:'favorite'}}));assert.equal(response.ok,false);
    assert.deepEqual(errors,[]);
  } finally {await context.close();}
});
