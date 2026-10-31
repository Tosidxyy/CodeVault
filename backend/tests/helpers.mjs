import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';

export async function database() {
  const db=new DatabaseSync(':memory:');
  for(const name of ['0001_sync.sql','0002_auth.sql','0003_assets.sql'])db.exec(await readFile(new URL('../migrations/'+name,import.meta.url),'utf8'));
  const adapter={
    beforeRun:undefined,
    prepare(sql){
      let args=[];
      const execute=()=>{adapter.beforeRun?.(sql,args);return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};};
      const statement={bind(...values){args=values;return statement;},async first(){return db.prepare(sql).get(...args)??null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return execute();},execute};
      return statement;
    },
    async batch(statements){
      db.exec('BEGIN');
      try{const results=statements.map(s=>s.execute());db.exec('COMMIT');return results;}
      catch(error){db.exec('ROLLBACK');throw error;}
    },
  };
  return {db,adapter};
}
