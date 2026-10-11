'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('crypto');
const {PGlite}=require('@electric-sql/pglite');
const {schema}=require('../api/_shared/catalogue');
test('existing tenant replacement clears source ledger atomically before deleting objects',async()=>{
 const db=new PGlite(),tenant=crypto.randomUUID(),parent=crypto.randomUUID(),item=crypto.randomUUID();
 const shared=require.resolve('../api/_shared/items');
 require.cache[shared]={id:shared,filename:shared,loaded:true,exports:{ensureSchema:async()=>{},authTenant:async()=>({tenantId:tenant,role:'owner'})}};
 const handler=require('../api/setup/import');
 try{
  await db.exec('CREATE TABLE objectsphere_item(item_id uuid PRIMARY KEY,tenant_id uuid);');await db.exec(schema);
  for(const name of ['attribute_value_history','event','item_attachment','attribute_value','item_type','attribute','event_type','object_type'])await db.exec(`CREATE TABLE objectsphere_${name}(tenant_id uuid)`);
  await db.query('INSERT INTO objectsphere_item VALUES($1,$2),($3,$2)',[parent,tenant,item]);
  await db.query("INSERT INTO objectsphere_catalogue_import(tenant_id,parent_item_id,source,source_key,payload_hash,item_id) VALUES($1,$2,'fixture','001','hash',$3)",[tenant,parent,item]);
  let fail=true;
  const ctx={req:{method:'POST'},body:{mode:'replace',export:{format:'objectsphere-tenant-export',version:1,data:{}}},broker:async(profile,action,payload)=>{
   if(action==='query')return db.query(payload.text,payload.values||[]);
   await db.exec('BEGIN');try{for(const [i,s] of payload.statements.entries()){await db.query(s.text,s.values||[]);if(fail&&i===1)throw Error('fixture failure');}await db.exec('COMMIT');return {results:[]};}catch(e){await db.exec('ROLLBACK');throw e;}
  },send:(status,body)=>{throw Error(`${status}: ${JSON.stringify(body)}`)}};
  await assert.rejects(handler(ctx),/fixture failure/);
  assert.equal((await db.query('SELECT count(*)::int n FROM objectsphere_catalogue_import')).rows[0].n,1);
  fail=false;assert.equal((await handler(ctx)).imported,true);
  assert.equal((await db.query('SELECT count(*)::int n FROM objectsphere_catalogue_import')).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int n FROM objectsphere_item')).rows[0].n,0);
 }finally{await db.close();}
});
