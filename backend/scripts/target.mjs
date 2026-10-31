export const names={worker:'codevault-api-development',database:'codevault-development',bucket:'codevault-assets-development',domain:'codevault-api.guidy.fun'};
export function validateTarget(value){
 if(!value||!/^[a-f0-9]{32}$/.test(value.accountId)||!Array.isArray(value.origins)||!value.origins.length||value.origins.some(v=>!/^chrome-extension:\/\/[a-p]{32}$/.test(v)))throw Error('Invalid account or exact extension origins');
 if(!Array.isArray(value.testEmails)||!value.testEmails.length||value.testEmails.length>5||value.testEmails.some(v=>typeof v!=='string'||!v.includes('@')))throw Error('Closed pilot requires explicit test emails');
 return value;
}
export function validateConfig(config,target){
 validateTarget(target);
 if(config.account_id!==target.accountId||config.name!==names.worker||config.main!=='src/worker.ts'||config.routes?.length!==1||config.routes[0].pattern!==names.domain||config.routes[0].custom_domain!==true)throw Error('Unexpected Worker/account/domain');
 if(config.d1_databases?.length!==1||config.d1_databases[0].binding!=='DB'||config.d1_databases[0].database_name!==names.database||!/^[a-f0-9-]{36}$/.test(config.d1_databases[0].database_id)||config.d1_databases[0].database_id==='00000000-0000-0000-0000-000000000001')throw Error('Unexpected D1 target');
 if(config.r2_buckets?.length!==1||config.r2_buckets[0].binding!=='ASSETS'||config.r2_buckets[0].bucket_name!==names.bucket)throw Error('Unexpected private image bucket');
 if(config.workers_dev!==false||config.observability?.enabled!==false||config.vars.ALLOWED_ORIGINS!==target.origins.join(',')||config.vars.AUTH_ALLOWED_EMAILS!==JSON.stringify(target.testEmails))throw Error('Pilot origin/privacy configuration mismatch');
 return config;
}
