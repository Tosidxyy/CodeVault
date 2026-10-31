import { accountKey, applyRemote, emptyState, exportConflictArchive, readEntry, snapshot, writeEntry } from './local';
import type { Auth, Pending, State } from './local';
import { canonical, equivalent, planSync, validateDocument } from './protocol';
import type { CloudRecord, Conflict, SyncDocument } from './protocol';
import { assetHash, fromWireDocument, toWireDocument } from './assets';

let tail:Promise<unknown>=Promise.resolve(),busy=false,controller:AbortController|undefined,runId=0,completedRun=0;
const locked=<T>(task:()=>Promise<T>):Promise<T>=>{const next=tail.catch(()=>{}).then(task);tail=next;return next;};
const text={offline:'无法连接云同步服务，请检查网络或服务地址。',expired:'登录已过期，请重新登录。',bound:'请先确认账号绑定与上传授权。'};
export function validOrigin(value:unknown):string {
  if(typeof value!=='string')throw Error(text.offline);
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('请输入不含路径的 HTTPS 服务地址。');
  return url.origin;
}
async function bytes(response:Response,limit:number):Promise<Uint8Array> {
  const reader=response.body?.getReader();if(!reader)throw Error(text.offline);
  let size=0;const chunks:Uint8Array[]=[];
  try{for(;;){const row=await reader.read();if(row.done)break;size+=row.value.length;if(size>limit)throw Error('云端响应过大，同步已停止。');chunks.push(row.value);}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
}
async function request(auth:Pick<Auth,'origin'> & Partial<Auth>,path:string,method='GET',body?:unknown,png=false):Promise<{status:number;data:unknown}> {
  if(!await chrome.permissions.contains({origins:[auth.origin+'/*']}))throw Error('云同步站点权限已撤销，请重新授权。');
  let response:Response;
  try{response=await fetch(auth.origin+path,{method,credentials:'omit',redirect:'error',cache:'no-store',signal:controller?AbortSignal.any([controller.signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000),headers:{...(auth.token?{Authorization:'Bearer '+auth.token}:{}),...(body!==undefined?{'Content-Type':png?'image/png':'application/json'}:{})},...(body!==undefined?{body:png?new Uint8Array(body as Uint8Array).buffer:JSON.stringify(body)}:{})});}
  catch{throw Error(text.offline);}
  if(response.status===401){await response.body?.cancel();throw Error(path.endsWith('/verify-code')?'验证码无效或已过期。':text.expired);}
  if(response.status===403&&path==='/v1/auth/account'){await response.body?.cancel();throw Error('清除云账号前，请重新验证邮箱。');}
  if(response.status===429){await response.body?.cancel();throw Error('请求过于频繁，请稍后重试。');}
  if(response.status!==409&&!response.ok){await response.body?.cancel();throw Error(text.offline);}
  const raw=await bytes(response,2*1024*1024+1024);
  let data:unknown;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{throw Error(text.offline);}
  return {status:response.status,data};
}
async function active():Promise<Auth>{const auth=await readEntry<Auth>('auth');if(!auth||auth.expiresAt<=Date.now())throw Error(text.expired);return auth;}
async function stateFor(auth:Auth):Promise<State>{return await readEntry<State>(accountKey(auth))??emptyState();}
async function hydrate(auth:Auth,value:unknown,cache:Map<string,Uint8Array>):Promise<CloudRecord> {
  const record=value as CloudRecord;
  if(!record||typeof record.id!=='string'||!Number.isSafeInteger(record.revision)||record.revision<1||record.revision>=Number.MAX_SAFE_INTEGER)throw Error('云端记录无效，同步已停止。');
  const document=await fromWireDocument(record.id,record.document,async hash=>{
    const saved=cache.get(hash);if(saved)return saved;
    if(!await chrome.permissions.contains({origins:[auth.origin+'/*']}))throw Error(text.offline);
    let response:Response;try{response=await fetch(auth.origin+'/v1/sync/assets/'+hash,{headers:{Authorization:'Bearer '+auth.token},credentials:'omit',redirect:'error',cache:'no-store',signal:controller?AbortSignal.any([controller.signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});}catch{throw Error(text.offline);}
    if(!response.ok){await response.body?.cancel();throw Error('图片下载失败，保留本地内容。');}
    const data=await bytes(response,2*1024*1024);if(await assetHash(data)!==hash)throw Error('图片校验失败，保留本地内容。');cache.set(hash,data);return data;
  });
  return {id:record.id,revision:record.revision,document};
}
function acknowledge(state:State,record:CloudRecord){state.baseline=state.baseline.filter(row=>row.id!==record.id).concat(record);}
async function conflict(auth:Auth,state:State,remote:CloudRecord,pending:Pending){
  const local=(await snapshot()).get(pending.id);if(local===undefined)throw Error('本地快照不完整，同步已停止。');
  state.conflicts=state.conflicts.filter(row=>row.id!==pending.id).concat({id:pending.id,local,remote});
  state.pending=state.pending.filter(row=>row.mutationId!==pending.mutationId);await writeEntry(accountKey(auth),state);
}
async function flush(auth:Auth,state:State,cache:Map<string,Uint8Array>){
  for(const pending of [...state.pending]){
    const wire=await toWireDocument(pending.id,pending.document);
    for(const [hash,data] of wire.assets){const uploaded=await request(auth,'/v1/sync/assets/'+hash,'PUT',data,true);if(uploaded.status!==200)throw Error('图片上传未完成，请稍后重试。');cache.set(hash,data);}
    const response=await request(auth,'/v1/sync/records','PUT',{...pending,document:wire.document});
    const result=response.data as {record?:unknown;current?:unknown;protocol?:number};
    if(response.status===409){
      if(!result.current)throw Error('云端记录已变化，请稍后重试。');
      const remote=await hydrate(auth,result.current,cache);if(remote.id!==pending.id)throw Error(text.offline);await conflict(auth,state,remote,pending);continue;
    }
    if(result.protocol!==2)throw Error('云同步协议不兼容。');
    const record=await hydrate(auth,result.record,cache);
    if(record.id!==pending.id||record.revision!==pending.baseRevision+1||!equivalent(record.document,pending.document))throw Error('云端回执不匹配，保留待同步记录。');
    acknowledge(state,record);state.pending=state.pending.filter(row=>row.mutationId!==pending.mutationId);await writeEntry(accountKey(auth),state);
  }
}
async function cycle(){
  const auth=await active(),state=await stateFor(auth);if(!state.bound)throw Error(text.bound);if(state.deleting)throw Error('云账号清除结果待确认，已暂停同步。');
  const cache=new Map<string,Uint8Array>();await flush(auth,state,cache);
  const remote:CloudRecord[]=[];let after='',total=0;const seen=new Set<string>();
  for(let page=0;;page++){
    if(page>20000)throw Error('云端记录过多，同步已停止。');
    const reply=(await request(auth,'/v1/sync/records'+(after?'?after='+encodeURIComponent(after):''))).data as {protocol:number;records:unknown[];next:string|null};
    if(reply.protocol!==2||!Array.isArray(reply.records)||reply.records.length>1)throw Error('云同步协议不兼容。');
    for(const row of reply.records){const record=await hydrate(auth,row,cache);if(seen.has(record.id)||record.id<=after)throw Error('云端分页无效，同步已停止。');seen.add(record.id);total+=new TextEncoder().encode(canonical(record)).length;if(total>64*1024*1024)throw Error('本轮同步超过64MB，请联系开发者。');remote.push(record);}
    if(reply.next===null){if(reply.records.length)throw Error('云端分页无效，同步已停止。');break;}
    if(typeof reply.next!=='string'||reply.next<=after||reply.records.length!==1||reply.next!==remote.at(-1)?.id)throw Error('云端分页无效，同步已停止。');after=reply.next;
  }
  const local=await snapshot(),blocked=new Set(state.conflicts.map(row=>row.id));
  const plan=planSync(auth.user.id,{accountId:auth.user.id,records:state.baseline.filter(row=>!blocked.has(row.id))},new Map([...local].filter(([id])=>!blocked.has(id))),remote.filter(row=>!blocked.has(row.id)));
  state.conflicts.push(...plan.conflicts);
  state.pending.push(...plan.uploads.map(row=>({...row,mutationId:crypto.randomUUID()})));
  // Persist before external writes. The local library itself is the durable
  // change source if the worker dies before this scan/outbox insertion.
  await writeEntry(accountKey(auth),state);
  for(const record of plan.downloads)await applyRemote(auth,state,record,local.get(record.id));
  for(const record of remote){if(!blocked.has(record.id)&&!plan.conflicts.some(row=>row.id===record.id)&&!plan.downloads.some(row=>row.id===record.id)&&!plan.uploads.some(row=>row.id===record.id))acknowledge(state,record);}
  await writeEntry(accountKey(auth),state);await flush(auth,state,cache);state.lastSync=Date.now();state.error='';await writeEntry(accountKey(auth),state);
}
async function start(){
  if(busy)return {runId};busy=true;const currentRun=++runId;controller=new AbortController();
  void locked(cycle).catch(async error=>{const auth=await readEntry<Auth>('auth');if(auth){const state=await stateFor(auth);state.error=error instanceof Error?error.message:text.offline;await writeEntry(accountKey(auth),state);}}).finally(()=>{busy=false;controller=undefined;completedRun=currentRun;});
  return {runId:currentRun};
}
export async function scheduleSync(){
  const auth=await readEntry<Auth>('auth');if(!auth)return;
  const state=await stateFor(auth);if(state.bound&&state.auto&&!await chrome.alarms.get('codevault-sync-soon'))await chrome.alarms.create('codevault-sync-soon',{delayInMinutes:0.5});
}
function summary(document:SyncDocument|null){return document?{title:document.problems[0].title,trash:!!document.problems[0].deletedAt,solutions:document.solutions.map(row=>({name:row.name,code:row.code,note:row.note,analysis:row.analysis})),notes:document.notes.map(row=>({text:row.blocks.filter(block=>block.type==='text').map(block=>block.content).join('\n'),images:Object.keys(row.images??{}).length}))}:{deleted:true};}
async function handle(message:Record<string,unknown>){
  const action=message.action;
  if(action==='status'){
    const readingBusy=busy,readingRun=runId;
    const auth=await readEntry<Auth>('auth'),state=auth?await stateFor(auth):emptyState();
    return {user:auth?.user,origin:auth?.origin,expired:auth?auth.expiresAt<=Date.now():false,busy:readingBusy||busy||readingRun!==runId,runId,completedRun,bound:state.bound,auto:state.auto,deleting:!!state.deleting,pending:state.pending.length,lastSync:state.lastSync,error:state.error,notice:await readEntry<string>('sync-notice'),conflicts:state.conflicts.map(row=>({id:row.id,revision:row.remote.revision,local:summary(row.local),remote:summary(row.remote.document)}))};
  }
  if(action==='start')return start();
  if(action==='changed'){await scheduleSync();return null;}
  if(action==='export-conflicts')return exportConflictArchive();
  if(action==='request-code'){
    const origin=validOrigin(message.origin),email=String(message.email??'').trim().toLowerCase();
    const response=await request({origin},'/v1/auth/request-code','POST',{email,locale:message.locale==='en'?'en':'zh'});
    const value=response.data as {challengeId:string;expiresIn:number};
    if(response.status!==202||!/^[a-f0-9]{64}$/.test(value.challengeId)||!Number.isFinite(value.expiresIn))throw Error(text.offline);
    await writeEntry('challenge',{origin,email,id:value.challengeId,expiresAt:Date.now()+value.expiresIn*1000});return null;
  }
  if(action==='verify-code'){
    const challenge=await readEntry<{origin:string;email:string;id:string;expiresAt:number}>('challenge');if(!challenge||challenge.expiresAt<=Date.now())throw Error('验证码已过期，请重新获取。');
    const reply=await request({origin:challenge.origin},'/v1/auth/verify-code','POST',{email:challenge.email,challengeId:challenge.id,code:message.code});
    const auth=reply.data as Auth;if(reply.status!==200||!/^[a-f0-9]{64}$/.test(auth.token)||!auth.user?.id||auth.user.email!==challenge.email||!Number.isFinite(auth.expiresAt))throw Error(text.offline);
    await writeEntry('auth',{...auth,origin:challenge.origin});await writeEntry('challenge',null);await writeEntry('sync-notice','');return null;
  }
  if(action==='logout'){
    const auth=await readEntry<Auth>('auth');if(!auth)return null;
    let notice='';try{await request(auth,'/v1/auth/logout','POST');}catch{notice='已在本机退出，但服务端会话撤销未确认。';}
    await writeEntry('auth',null);await writeEntry('sync-notice',notice);return null;
  }
  const auth=await active(),state=await stateFor(auth);
  if(action==='delete-account'){
    if(message.accountId!==auth.user.id||message.confirmation!=='DELETE')throw Error('请明确确认清除当前云账号。');
    state.auto=false;state.deleting=true;await writeEntry(accountKey(auth),state);
    const response=await request(auth,'/v1/auth/account','DELETE',{confirmation:'DELETE'});
    if(response.status!==200||(response.data as {ok?:boolean}).ok!==true)throw Error('云账号清除结果待确认，已暂停同步。');
    await writeEntry('auth',null);await writeEntry('sync-notice','云账号已清除，图片已排队删除；本机知识库与备份保持不变。');return null;
  }
  if(action==='cancel-deletion'){
    const response=await request(auth,'/v1/auth/session');
    if((response.data as {user?:{id:string}}).user?.id!==auth.user.id)throw Error(text.expired);
    state.deleting=false;state.error='';await writeEntry(accountKey(auth),state);return null;
  }
  if(state.deleting)throw Error('云账号清除结果待确认，已暂停同步。');
  if(action==='bind'){
    if(message.accountId!==auth.user.id||message.consent!==true)throw Error(text.bound);
    state.bound=true;state.auto=true;await writeEntry(accountKey(auth),state);await scheduleSync();return null;
  }
  if(action==='auto'){state.auto=message.enabled===true;await writeEntry(accountKey(auth),state);if(state.auto)await scheduleSync();return null;}
  if(action==='resolve'){
    if(!state.bound)throw Error(text.bound);
    const found=state.conflicts.find(row=>row.id===message.id);if(!found||found.remote.revision!==message.revision)throw Error('冲突已变化，请刷新后重试。');
    const local=(await snapshot()).get(found.id);if(local===undefined)throw Error('本地快照不完整，同步已停止。');
    if(canonical(local)!==canonical(found.local)){found.local=local;await writeEntry(accountKey(auth),state);throw Error('本地内容已变化，请重新检查冲突。');}
    if(!['local','remote'].includes(String(message.choice)))throw Error(text.offline);
    const archive=await readEntry<Conflict[]>('archive:'+accountKey(auth))??[];if(archive.length>=100)throw Error('冲突归档已满，请先导出并联系开发者。');
    await writeEntry('archive:'+accountKey(auth),archive.concat(found));
    if(message.choice==='remote')await applyRemote(auth,state,found.remote,local);
    else{acknowledge(state,found.remote);state.conflicts=state.conflicts.filter(row=>row.id!==found.id);state.pending.push({id:found.id,baseRevision:found.remote.revision,mutationId:crypto.randomUUID(),document:validateDocument(found.id,local)});await writeEntry(accountKey(auth),state);}
    await scheduleSync();return null;
  }
  throw Error('不支持的同步操作。');
}
chrome.runtime.onMessage.addListener((message:unknown,sender,respond)=>{
  if(!message||typeof message!=='object'||(message as Record<string,unknown>).channel!=='codevault-sync')return false;
  if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('options.html')){respond({ok:false,error:'Sync settings access denied'});return false;}
  const data=message as Record<string,unknown>;
  if(['logout','auto','verify-code','request-code','delete-account','cancel-deletion'].includes(String(data.action)))controller?.abort();
  const task=['status','start','changed'].includes(String(data.action))?handle(data):locked(()=>handle(data));
  void task.then(value=>respond({ok:true,data:value})).catch(error=>respond({ok:false,error:error instanceof Error?error.message:text.offline}));return true;
});
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name.startsWith('codevault-sync'))void (async()=>{const auth=await readEntry<Auth>('auth');if(auth){const state=await stateFor(auth);if(state.bound&&state.auto)await start();}})().catch(()=>{});});
void chrome.alarms.get('codevault-sync-periodic').then(existing=>{if(!existing)return chrome.alarms.create('codevault-sync-periodic',{periodInMinutes:5});}).catch(()=>{});
