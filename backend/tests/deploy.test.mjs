import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTarget,validateConfig,names } from '../scripts/target.mjs';
test('cloud guard pins CodeVault resources and rejects shared/foreign deployment targets',()=>{
 const target={accountId:'a'.repeat(32),origins:['chrome-extension://'+'a'.repeat(32)],testEmails:['fixture@example.test']};
 const config={name:names.worker,account_id:target.accountId,main:'src/worker.ts',workers_dev:false,routes:[{pattern:names.domain,custom_domain:true}],observability:{enabled:false},triggers:{crons:['*/15 * * * *']},vars:{ALLOWED_ORIGINS:target.origins.join(','),AUTH_ALLOWED_EMAILS:JSON.stringify(target.testEmails)},d1_databases:[{binding:'DB',database_name:names.database,database_id:'11111111-1111-4111-8111-111111111111'}],r2_buckets:[{binding:'ASSETS',bucket_name:names.bucket}]};
 assert.equal(validateConfig(config,target),config);
 for(const patch of [{name:'guidy-api-development'},{account_id:'b'.repeat(32)},{r2_buckets:[{binding:'ASSETS',bucket_name:'guidy-images'}]},{d1_databases:[{...config.d1_databases[0],database_name:'guidy-development'}]},{vars:{...config.vars,ALLOWED_ORIGINS:'*'}},{routes:[{pattern:'api.guidy.fun',custom_domain:true}]}])assert.throws(()=>validateConfig({...config,...patch},target));
 assert.throws(()=>validateTarget({...target,origins:['https://*/*']}));assert.throws(()=>validateTarget({...target,testEmails:[]}));
 for(const triggers of [undefined,{crons:[]},{crons:['0 0 * * *']},{crons:['*/15 * * * *','0 0 * * *']}])assert.throws(()=>validateConfig({...config,triggers},target));
});
