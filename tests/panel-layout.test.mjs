import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { chromium } from 'playwright';
import { clampPanelLayout, defaultPanelLayout, validatePanelLayout } from '../src/content/panelGeometry.ts';

test('panel layout validates stored preferences and clamps root bounds to the viewport', () => {
  assert.deepEqual(validatePanelLayout(defaultPanelLayout),defaultPanelLayout);
  for(const value of [null,{...defaultPanelLayout,right:-1},{...defaultPanelLayout,bottom:Infinity},{...defaultPanelLayout,expanded:'yes'}])assert.throws(()=>validatePanelLayout(value));
  assert.deepEqual(clampPanelLayout({right:999,bottom:999,expanded:true},360,436,640,480),{right:272,bottom:36,expanded:true});
  assert.deepEqual(clampPanelLayout({right:0,bottom:0,expanded:false},44,44,320,568),{right:8,bottom:8,expanded:false});
});

test('panel drags, cancels, moves by keyboard, expands, remembers across restart and resets safely', {timeout:90000}, async () => {
  const root=resolve('test-results');await mkdir(root,{recursive:true});const profile=await mkdtemp(resolve(root,'layout-profile-'));
  const extension=resolve('dist');let context,page,probe;
  const errors=[];
  const launch=async()=>{
    context=await chromium.launchPersistentContext(profile,{channel:process.env.CODEVAULT_BROWSER_CHANNEL||'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
    const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');probe=await context.newPage();await probe.goto(`chrome-extension://${new URL(worker.url()).host}/options.html`);
    await context.route('https://leetcode.cn/**',route=>new URL(route.request().url()).pathname==='/graphql/'?route.fulfill({json:{data:{question:{questionId:'1',titleSlug:'two-sum',title:'Two Sum',difficulty:'Easy',topicTags:[]}}}}):route.fulfill({contentType:'text/html',body:'<h1>Panel layout fixture</h1>'}));
    page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto('https://leetcode.cn/problems/two-sum/');
    await page.getByRole('button',{name:'展开 CodeVault',exact:true}).click();await page.getByRole('button',{name:/^(展开浮窗|切换紧凑浮窗)$/}).waitFor();
    await page.waitForFunction(()=>!document.querySelector('#codevault-root').shadowRoot.querySelector('.header-actions button').disabled);
  };
  const panel=()=>page.getByRole('region',{name:'CodeVault 面板'});
  const header=()=>page.getByLabel('浮窗移动区域');
  const preferences=()=>probe.evaluate(()=>chrome.runtime.sendMessage({channel:'codevault-panel-layout',action:'get'}));
  const checkBounds=async()=>{
    const p=await panel().boundingBox(),v=page.viewportSize();assert.ok(p.x>=0&&p.y>=0&&p.x+p.width<=v.width&&p.y+p.height<=v.height);
    assert.equal(await panel().evaluate(el=>el.scrollWidth<=el.clientWidth),true);return p;
  };
  try {
    await launch();await page.getByRole('button',{name:'展开浮窗'}).isEnabled();
    const original=await checkBounds();assert.equal(original.width,360);assert.ok(original.height<=440);
    const h=await header().boundingBox();const x=h.x+70,y=h.y+20;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-180,y-80,{steps:6});await page.mouse.up();
    const moved=await checkBounds();assert.ok(original.x-moved.x>150);assert.ok(original.y-moved.y>50);
    await probe.waitForFunction(async()=>{const r=await chrome.runtime.sendMessage({channel:'codevault-panel-layout',action:'get'});return r.data.right>100;});
    const saved=(await preferences()).data;
    const movedHeader=await header().boundingBox();await page.mouse.move(movedHeader.x+70,movedHeader.y+20);await page.mouse.down();await page.mouse.move(movedHeader.x+150,movedHeader.y+40);await page.keyboard.press('Escape');await page.mouse.up();
    const cancelled=await checkBounds();assert.ok(Math.abs(cancelled.x-moved.x)<2&&Math.abs(cancelled.y-moved.y)<2);assert.deepEqual((await preferences()).data,saved);
    await header().focus();await page.keyboard.press('ArrowLeft');await page.keyboard.press('Shift+ArrowUp');
    const keyboard=await checkBounds();assert.ok(Math.abs(keyboard.x-(moved.x-10))<2);assert.ok(Math.abs(keyboard.y-(moved.y-40))<2);
    await page.getByRole('button',{name:'展开浮窗',exact:true}).click();assert.equal((await checkBounds()).width,560);
    await probe.waitForFunction(async()=>{const r=await chrome.runtime.sendMessage({channel:'codevault-panel-layout',action:'get'});return r.data.expanded;});
    const expandedAnchor=await page.evaluate(()=>{const el=document.querySelector('#codevault-root');return {right:parseFloat(el.style.right),bottom:parseFloat(el.style.bottom)};});
    await probe.waitForFunction(async expected=>{const r=await chrome.runtime.sendMessage({channel:'codevault-panel-layout',action:'get'});return r.data.right===expected.right&&r.data.bottom===expected.bottom;},expandedAnchor);
    await page.reload();await page.getByRole('region',{name:'CodeVault 面板'}).waitFor();await page.getByRole('button',{name:'切换紧凑浮窗'}).waitFor();assert.equal((await checkBounds()).width,560);
    await context.close();context=undefined;await launch();await page.getByRole('button',{name:'切换紧凑浮窗'}).waitFor();assert.equal((await checkBounds()).width,560);
    await page.setViewportSize({width:360,height:640});await page.waitForFunction(()=>{const p=document.querySelector('#codevault-root').shadowRoot.querySelector('.panel').getBoundingClientRect();return p.x>=0&&p.y>=0&&p.right<=innerWidth&&p.bottom<=innerHeight;});await checkBounds();
    await page.screenshot({path:'test-results/panel-expanded-mobile.png'});
    await page.setViewportSize({width:1280,height:720});await page.getByRole('button',{name:'恢复默认位置和大小'}).click();assert.equal((await checkBounds()).width,360);
    await probe.waitForFunction(async()=>{const r=await chrome.runtime.sendMessage({channel:'codevault-panel-layout',action:'get'});return r.data.right===16&&r.data.bottom===16&&!r.data.expanded;});
    const reset=await checkBounds();assert.ok(Math.abs(reset.x+reset.width-1264)<2);assert.ok(reset.height<=440);
    await page.getByRole('button',{name:'关闭面板'}).click();await page.getByRole('button',{name:'展开 CodeVault',exact:true}).click();await checkBounds();
    const invalid=await probe.evaluate(()=>chrome.runtime.sendMessage({channel:'codevault-panel-layout',action:'set',layout:{right:-1,bottom:16,expanded:false}}));assert.equal(invalid.ok,false);assert.deepEqual((await preferences()).data,defaultPanelLayout);
    await page.getByRole('button',{name:'关闭面板'}).click();
    const launcher=page.getByRole('button',{name:'展开 CodeVault',exact:true});const iconStart=await launcher.boundingBox();
    await page.mouse.move(iconStart.x+20,iconStart.y+20);await page.mouse.down();await page.mouse.move(iconStart.x-160,iconStart.y-100,{steps:6});await page.mouse.up();
    assert.equal(await panel().count(),0);const iconMoved=await launcher.boundingBox();assert.ok(iconStart.x-iconMoved.x>150);
    await probe.waitForFunction(async()=>{const r=await chrome.runtime.sendMessage({channel:'codevault-panel-layout',action:'get'});return r.data.right>150;});
    await page.reload();await launcher.waitFor();await page.waitForFunction(()=>!document.querySelector('#codevault-root').shadowRoot.querySelector('.launcher').disabled);
    const iconRestored=await launcher.boundingBox();assert.ok(Math.abs(iconRestored.x-iconMoved.x)<2&&Math.abs(iconRestored.y-iconMoved.y)<2);
    await launcher.click();await panel().waitFor();await page.getByRole('button',{name:'恢复默认位置和大小'}).click();
    await page.getByRole('button',{name:'关闭面板'}).click();await launcher.focus();await page.keyboard.press('Enter');await panel().waitFor();
    assert.deepEqual(errors,[]);await page.screenshot({path:'test-results/panel-compact-layout.png'});
  } finally {await context?.close();assert.ok(profile.startsWith(root+sep));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:250});}
});
