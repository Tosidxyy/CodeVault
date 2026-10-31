import { invalidateNoteSessions } from '../database/noteSessions';
import { openDatabase } from '../database/problems';
import { canonical, validateDocument } from './protocol';
import type { CloudRecord, Conflict, SyncDocument } from './protocol';
import type { StoredNote, StoredProblem, StoredSolution } from '../database/types';

export interface Auth { origin:string; token:string; user:{id:string;email:string}; expiresAt:number }
export interface Pending { id:string; baseRevision:number; mutationId:string; document:SyncDocument|null }
export interface State { bound:boolean; auto:boolean; baseline:CloudRecord[]; pending:Pending[]; conflicts:Conflict[]; lastSync?:number; error?:string; deleting?:boolean }
export const emptyState=():State=>({bound:false,auto:false,baseline:[],pending:[],conflicts:[]});
export const accountKey=(auth:Auth)=>'account:'+auth.origin+':'+auth.user.id;
export async function readEntry<T>(key:string):Promise<T|undefined> {
  const db=await openDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction('sync');const q=tx.objectStore('sync').get(key);tx.oncomplete=()=>resolve(q.result?.value);tx.onabort=()=>reject(tx.error);});
}
export async function writeEntry(key:string,value:unknown):Promise<void> {
  const db=await openDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction('sync','readwrite');tx.objectStore('sync').put({key,value});tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});
}
interface Rows { problems:StoredProblem[]; solutions:StoredSolution[]; notes:StoredNote[] }
export async function exportConflictArchive():Promise<unknown> {
  const db=await openDatabase();return new Promise((resolve,reject)=>{
    const tx=db.transaction('sync'),request=tx.objectStore('sync').getAll();
    tx.oncomplete=()=>resolve({format:'codevault-sync-conflicts',version:1,exportedAt:new Date().toISOString(),accounts:request.result.filter((row:{key:string})=>row.key.startsWith('account:')||row.key.startsWith('archive:')).map((row:{key:string;value:State|Conflict[]})=>({account:row.key,conflicts:Array.isArray(row.value)?row.value:row.value.conflicts}))});
    tx.onabort=()=>reject(tx.error);
  });
}
function bundle(rows:Rows,id:string):SyncDocument|null|undefined {
  const problem=rows.problems.find(p=>p.id===id);if(!problem)return undefined;
  if((problem as StoredProblem & {purged?:boolean}).purged)return null;
  return validateDocument(id,{problems:[problem],solutions:rows.solutions.filter(s=>s.problemId===id),notes:rows.notes.filter(n=>n.problemId===id)});
}
function readRows(tx:IDBTransaction,done:(rows:Rows)=>void) {
  const names=['problems','solutions','notes'] as const,rows={} as Rows;let count=0;
  for(const name of names){const q=tx.objectStore(name).getAll();q.onsuccess=()=>{Object.assign(rows,{[name]:q.result});if(++count===3)done(rows);};}
}
export async function snapshot():Promise<Map<string,SyncDocument|null>> {
  const db=await openDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction(['problems','solutions','notes']);let rows:Rows;readRows(tx,value=>rows=value);tx.oncomplete=()=>{try{resolve(new Map(rows.problems.map(p=>[p.id,bundle(rows,p.id)!])));}catch(error){reject(error);}};tx.onabort=()=>reject(tx.error);});
}
export function rememberFence(tx:IDBTransaction,id:string,revision:number) {
  const store=tx.objectStore('sync'),key='fence:'+id,q=store.get(key);
  q.onsuccess=()=>store.put({key,value:Math.max(q.result?.value??0,revision)});
}
/** Compare the exact current local snapshot and atomically apply + acknowledge. */
export async function applyRemote(auth:Auth,state:State,remote:CloudRecord,expected:SyncDocument|null|undefined):Promise<void> {
  const db=await openDatabase();const stagedState=structuredClone(state);return new Promise((resolve,reject)=>{
    const tx=db.transaction(['problems','solutions','notes','sync'],'readwrite');let failure:Error|undefined;
    tx.oncomplete=()=>{Object.assign(state,stagedState);invalidateNoteSessions(remote.id);resolve();};tx.onabort=()=>reject(failure??tx.error??new Error('Local sync transaction failed'));
    const all=tx.objectStore('sync').getAll();
    all.onsuccess=()=>readRows(tx,rows=>{
      try{
        if(canonical(bundle(rows,remote.id))!==canonical(expected))throw new Error('Local data changed; retry sync');
        const storedAuth=all.result.find((r:{key:string})=>r.key==='auth')?.value as Auth|undefined;
        if(!storedAuth||storedAuth.token!==auth.token)throw new Error('Sync account changed');
        const oldNote=rows.notes.find(n=>n.problemId===remote.id),oldSolutions=rows.solutions.filter(s=>s.problemId===remote.id);
        const fences=new Map<string,number>(all.result.filter((r:{key:string})=>r.key.startsWith('fence:')).map((r:{key:string;value:number})=>[r.key.slice(6),r.value]));
        const next=(id:string,...values:number[])=>{const value=Math.max(Date.now(),fences.get(id)??0,...values)+1;if(!Number.isSafeInteger(value)||value>=Number.MAX_SAFE_INTEGER)throw new Error('Revision limit reached');fences.set(id,value);tx.objectStore('sync').put({key:'fence:'+id,value});return value;};
        for(const row of oldSolutions){const value=Math.max(fences.get(row.id)??0,row.revision??0);fences.set(row.id,value);tx.objectStore('sync').put({key:'fence:'+row.id,value});tx.objectStore('solutions').delete(row.id);}
        const noteRevision=next('note:'+remote.id,oldNote?.revision??0,remote.document?.notes[0]?.revision??0);
        if(remote.document){
          for(const solution of remote.document.solutions)if(rows.solutions.some(row=>row.id===solution.id&&row.problemId!==remote.id))throw new Error('解法标识与其他题目冲突，保留本地内容。');
          const existing=rows.problems.find(row=>row.id===remote.id);
          tx.objectStore('problems').put({...remote.document.problems[0],...(existing?{lastOpenedAt:existing.lastOpenedAt??null}:{})});
          for(const row of remote.document.solutions){const revision=next(row.id,row.revision??0,oldSolutions.find(s=>s.id===row.id)?.revision??0);tx.objectStore('solutions').put({...row,revision});}
          const note=remote.document.notes[0];tx.objectStore('notes').put(note?{...note,revision:noteRevision}:emptyNote(remote.id,noteRevision));
        }else{
          tx.objectStore('problems').put({id:remote.id,purged:true,deletedAt:Date.now(),trashToken:crypto.randomUUID()});
          tx.objectStore('notes').put({...emptyNote(remote.id,noteRevision),purged:true});
        }
        stagedState.baseline=stagedState.baseline.filter(row=>row.id!==remote.id).concat(remote);
        stagedState.conflicts=stagedState.conflicts.filter(row=>row.id!==remote.id);
        tx.objectStore('sync').put({key:accountKey(auth),value:stagedState});
      }catch(error){failure=error as Error;tx.abort();}
    });
  });
}
function emptyNote(problemId:string,revision:number):StoredNote {return {problemId,revision,updatedAt:Date.now(),markdown:'',images:{},blocks:[{id:crypto.randomUUID(),type:'text',content:''}]};}
