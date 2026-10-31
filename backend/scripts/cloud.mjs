import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { names,validateTarget,validateConfig } from './target.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const target=validateTarget(JSON.parse(await readFile(new URL('../.cloud-target.json',import.meta.url),'utf8')));
const configPath=new URL('../wrangler.cloud.json',import.meta.url);
function cli(args,{input,quiet=false}={}){
 const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],{cwd:root,encoding:'utf8',input,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:target.accountId,WRANGLER_SEND_METRICS:'false',DO_NOT_TRACK:'1',CI:'true'}});
 if(result.status!==0){if(result.stdout)process.stderr.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);throw Error('Wrangler command failed: '+args.slice(0,2).join(' '));}
 if(!quiet)process.stdout.write(result.stdout);return result.stdout;
}
function databases(){return JSON.parse(cli(['d1','list','--json'],{quiet:true}));}
const action=process.argv[2];
if(!['prepare','build','migrate','secrets','deploy','status'].includes(action))throw Error('Choose prepare/build/migrate/secrets/deploy/status');
// No credentials are read from Guidy or any other project.
if(action==='prepare'){
 // Fail before creating D1 if R2 subscription/authentication is unavailable.
 const buckets=cli(['r2','bucket','list'],{quiet:true});
 if(!buckets.includes(names.bucket))cli(['r2','bucket','create',names.bucket]);
 let list=databases();if(!list.some(row=>row.name===names.database)){cli(['d1','create',names.database]);list=databases();}
 const database=list.filter(row=>row.name===names.database);if(database.length!==1)throw Error('D1 identity is ambiguous');
 const config={name:names.worker,account_id:target.accountId,main:'src/worker.ts',compatibility_date:'2026-10-30',workers_dev:false,routes:[{pattern:names.domain,custom_domain:true}],observability:{enabled:false},triggers:{crons:['*/15 * * * *']},vars:{AUTH_ENABLED:'false',EMAIL_FROM:'codevault@auth.guidy.fun',ALLOWED_ORIGINS:target.origins.join(','),AUTH_ALLOWED_EMAILS:JSON.stringify(target.testEmails)},d1_databases:[{binding:'DB',database_name:names.database,database_id:database[0].uuid,migrations_dir:'migrations'}],r2_buckets:[{binding:'ASSETS',bucket_name:names.bucket}]};
 // Preserve explicit closed-pilot activation on subsequent preparation.
 try{const old=JSON.parse(await readFile(configPath,'utf8'));validateConfig(old,target);if(old.d1_databases[0].database_id!==database[0].uuid)throw Error('D1 changed');config.vars.AUTH_ENABLED=old.vars.AUTH_ENABLED;}catch(error){if(error.code!=='ENOENT')throw error;}
 validateConfig(config,target);await writeFile(configPath,JSON.stringify(config,null,2)+'\n');console.log('Independent CodeVault pilot configuration prepared.');
}else{
 const config=validateConfig(JSON.parse(await readFile(configPath,'utf8')),target);
 const args=['--config','wrangler.cloud.json'];
 if(action==='build'){cli(['deploy',...args,'--dry-run','--outdir','../test-results/backend-cloud-build']);}
 else{
  const database=databases().find(row=>row.name===names.database);if(!database||database.uuid!==config.d1_databases[0].database_id)throw Error('Remote D1 name/ID mismatch');
  if(action==='migrate')cli(['d1','migrations','apply',names.database,'--remote',...args]);
  if(action==='secrets'){
   const secrets=JSON.parse(await readFile(new URL('../.cloud-secrets.json',import.meta.url),'utf8'));
   if(Object.keys(secrets).sort().join(',')!=='AUTH_SECRET,RESEND_API_KEY'||secrets.AUTH_SECRET.length<32||!/^re_[A-Za-z0-9_]+$/.test(secrets.RESEND_API_KEY))throw Error('Invalid independent secrets file');
   cli(['secret','bulk',...args],{input:JSON.stringify(secrets)});
  }
  if(action==='deploy')cli(['deploy',...args]);
  if(action==='status')cli(['deployments','list',...args]);
 }
}
