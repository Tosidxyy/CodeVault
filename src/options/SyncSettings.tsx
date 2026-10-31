import { useEffect, useState } from 'react';
import { getLocale, useT } from '../i18n/locale';
interface Status {user?:{id:string;email:string};origin?:string;expired:boolean;busy:boolean;bound:boolean;auto:boolean;deleting?:boolean;pending:number;lastSync?:number;error?:string;notice?:string;conflicts:{id:string;revision:number;local:unknown;remote:unknown}[]}
async function rpc(action:string,fields:Record<string,unknown>={}){
  const reply=await chrome.runtime.sendMessage({channel:'codevault-sync',action,...fields});
  if(!reply?.ok)throw Error(reply?.error||'无法连接云同步服务，请检查网络或服务地址。');return reply.data;
}
export function SyncSettings(){
  const t=useT(),[status,setStatus]=useState<Status>(),[origin,setOrigin]=useState('https://codevault-api.guidy.fun'),[email,setEmail]=useState(''),[code,setCode]=useState(''),[sent,setSent]=useState(false),[consent,setConsent]=useState(false),[working,setWorking]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [reauth,setReauth]=useState(false),[showDelete,setShowDelete]=useState(false),[deleteConsent,setDeleteConsent]=useState(false);
  useEffect(()=>{
    let alive=true;
    const refresh=()=>{void rpc('status').then(value=>{if(alive)setStatus(value);}).catch(()=>{if(alive)setError('无法连接云同步服务，请检查网络或服务地址。');});};
    refresh();const timer=setInterval(refresh,2000);
    const changed=()=>{void rpc('changed').catch(()=>{});};window.addEventListener('codevault-library-changed',changed);
    return()=>{alive=false;clearInterval(timer);window.removeEventListener('codevault-library-changed',changed);};
  },[]);
  async function act(action:string,fields:Record<string,unknown>={}){
    setWorking(true);setError('');setMessage('');
    try{const value=await rpc(action,fields);setStatus(await rpc('status'));return value;}catch(reason){setError((reason as Error).message);throw reason;}finally{setWorking(false);}
  }
  async function send(){
    setError('');
    try{
      const url=new URL(origin);
      if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('请输入不含路径的 HTTPS 服务地址。');
      const granted=await chrome.permissions.request({origins:[url.origin+'/*']});if(!granted)throw Error('未授权云同步服务地址。');
      await act('request-code',{origin:url.origin,email,locale:getLocale()});setSent(true);setMessage('验证码邮件已请求，请检查收件箱。');
    }catch(reason){setError((reason as Error).message);}
  }
  async function download(){
    try{const value=await act('export-conflicts');const url=URL.createObjectURL(new Blob([JSON.stringify(value)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='CodeVault-sync-conflicts.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch{/* act already reports the error */}
  }
  const execute=(action:string,fields?:Record<string,unknown>)=>{void act(action,fields).catch(()=>{});};
  return <section className="data-settings cloud-settings" aria-label={t('云同步')}>
    <h2>{t('云同步')}</h2><p>{t('开发预览：默认服务仅向受邀测试邮箱开放。登录并明确授权后才会上传。离线使用与手动备份保持可用。')}</p>
    <p>{t('同步题目、解法、图文笔记、分析与回收站，不同步 API Key。同步后请刷新已打开的题目页；未保存草稿不会上传。')}</p>
    {!status?.user||status.expired||reauth?<div className="cloud-login">
      <label>{t('云同步服务地址')}<input type="url" aria-label={t('云同步服务地址')} value={origin} onChange={event=>{setOrigin(event.target.value);setSent(false);}} disabled={working}/></label>
      <label>{t('登录邮箱')}<input type="email" aria-label={t('登录邮箱')} autoComplete="email" value={email} onChange={event=>{setEmail(event.target.value);setSent(false);}} disabled={working}/></label>
      <button type="button" disabled={working||status?.busy} onClick={()=>void send()}>{t('获取登录验证码')}</button>
      {sent&&<><label>{t('邮箱验证码')}<input aria-label={t('邮箱验证码')} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={event=>setCode(event.target.value)} disabled={working}/></label><button type="button" disabled={working||!/^\d{6}$/.test(code)} onClick={()=>{void act('verify-code',{code}).then(()=>{setCode('');setSent(false);setConsent(false);setReauth(false);setDeleteConsent(false);setShowDelete(false);}).catch(()=>{});}}>{t('登录云同步')}</button></>}
    </div>:<>
      <p>{t('当前云账号')}: {status.user.email}<br/>{status.origin}</p>
      {!status.bound&&<><p>{t('绑定会将当前本机知识库与此账号合并。同一题的不同内容会保留为冲突，不自动覆盖。切换账号可能上传原账号留在本机的内容，请确认。')}</p><label className="cloud-consent"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)}/>{t('我同意将当前知识库上传到此账号的服务，并启用自动同步。')}</label><button disabled={!consent||working} onClick={()=>execute('bind',{accountId:status.user!.id,consent:true})}>{t('确认绑定并启用同步')}</button></>}
      {status.bound&&<><label className="cloud-consent"><input type="checkbox" checked={status.auto} disabled={working||status.deleting} onChange={event=>execute('auto',{enabled:event.target.checked})}/>{t('自动同步已保存内容（约每5分钟检查）')}</label><button disabled={working||status.busy||status.deleting} onClick={()=>execute('start')}>{t('立即同步')}</button></>}
    </>}
    {status?.user&&<button disabled={working} onClick={()=>execute('logout')}>{t('退出云账号（保留本机内容）')}</button>}
    {status?.user&&<>
      <button disabled={working||status.busy} onClick={()=>{setOrigin(status.origin!);setEmail(status.user!.email);setSent(false);setCode('');setReauth(true);}}>{t('重新验证邮箱')}</button>
      <button disabled={working||status.busy} onClick={()=>{setShowDelete(value=>!value);setDeleteConsent(false);}}>{t('清除云端账号')}</button>
      {showDelete&&<div className="trash-confirm" role="group" aria-label={t('清除云账号确认')}><p>{t('这会清除当前账号的云端题目、解法、笔记与图片访问，并撤销全部设备登录。图片排队物理删除；本机知识库、冲突归档和已导出的备份不会删除。')}</p><label className="cloud-consent"><input type="checkbox" checked={deleteConsent} onChange={event=>setDeleteConsent(event.target.checked)}/>{t('我确认清除当前云账号，保留本机内容。')}</label><button disabled={!deleteConsent||working||status.busy} onClick={()=>execute('delete-account',{accountId:status.user!.id,confirmation:'DELETE'})}>{t('确认清除云账号')}</button><button disabled={working} onClick={()=>{setShowDelete(false);setDeleteConsent(false);}}>{t('取消')}</button></div>}
      {status.deleting&&<><p role="alert">{t('云账号清除结果待确认，已暂停同步。')}</p><button disabled={working} onClick={()=>execute('cancel-deletion')}>{t('验证账号仍存在并取消待确认清除')}</button></>}
    </>}
    {status?.bound&&<p role="status">{t(status.busy?'正在同步…':'同步空闲')} · {t('待同步')}: {status.pending}<br/>{t('上次同步')}: {status.lastSync?new Date(status.lastSync).toLocaleString():t('尚未同步')}</p>}
    {!!status?.conflicts.length&&<div className="cloud-conflicts"><h3>{t('同步冲突')}</h3><p>{t('逐题选择保留本机或采用云端版本。双方完整内容会保存在本机冲突归档，可先导出查看；导出文件含私人内容和图片，未加密。')}</p>{status.conflicts.map(row=><article key={row.id}><strong>{row.id}</strong><details><summary>{t('查看双方内容摘要')}</summary><p>{t('本机版本')}</p><pre>{JSON.stringify(row.local,null,2).slice(0,12000)}</pre><p>{t('云端版本')}</p><pre>{JSON.stringify(row.remote,null,2).slice(0,12000)}</pre></details><div className="data-actions"><button disabled={working||status.busy} onClick={()=>execute('resolve',{id:row.id,revision:row.revision,choice:'local'})}>{t('保留本机版本')}</button><button disabled={working||status.busy} onClick={()=>execute('resolve',{id:row.id,revision:row.revision,choice:'remote'})}>{t('采用云端版本')}</button></div></article>)}</div>}
    <button disabled={working||status?.busy} onClick={()=>void download()}>{t('导出冲突与归档')}</button>
    {!!(error||status?.error)&&<p role="alert">{t(error||status?.error)}</p>}{!!(message||status?.notice)&&<p role="status">{t(message||status?.notice)}</p>}
  </section>;
}
