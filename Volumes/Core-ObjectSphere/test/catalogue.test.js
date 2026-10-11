'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),crypto=require('crypto');
const {PGlite}=require('@electric-sql/pglite');
const {validateFile,prepare,commit,schema}=require('../api/_shared/catalogue');
const typeId=crypto.randomUUID(),attributeId=crypto.randomUUID();
const types=[{object_type_id:typeId,type_name:'Book',status:'active',deleted:false}];
const attributes=[{attribute_id:attributeId,object_type_id:typeId,attribute_name:'ISBN',attribute_type:'text',status:'active',deleted:false}];
const sample=()=>({format:'objectsphere-catalogue',version:1,source:'library-test',objects:[{source_key:'001',name:'Test book',type:'Book',quantity:1,attributes:{ISBN:'0486288404'}}]});
test('strict validation and stable canonical fingerprints',()=>{
 const result=validateFile(sample(),types,attributes);assert.equal(result.objects[0].values[0].value_text,'0486288404');
 for(const mutate of [f=>f.objects.push(f.objects[0]),f=>f.objects[0].type='Missing',f=>f.objects[0].quantity=1.2,f=>f.objects[0].attributes.Missing='bad',f=>f.objects[0].attributes.ISBN=123,f=>f.version=2]){
  const file=sample();mutate(file);assert.throws(()=>validateFile(file,types,attributes));
 }
 const dateAttrs=[{...attributes[0],attribute_name:'Date',attribute_type:'date'}],f=sample();f.objects[0].attributes={Date:'2026-02-30'};assert.throws(()=>validateFile(f,types,dateAttrs));
});
test('actual PostgreSQL imports atomically, skips repeats, isolates tenants, retains history and rolls back failures',async()=>{
 const db=new PGlite();
 try{
  const ddl=fs.readFileSync(require('node:path').resolve(__dirname,'../../Databases/Core-ObjectSphere/Init/001-schema.sql'),'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;','');await db.exec(ddl);await db.exec(schema);await db.exec(schema);
  const tenant=crypto.randomUUID(),parent=crypto.randomUUID(),access={tenantId:tenant,auth:{email:'fixture@example.test'}};
  await db.query('INSERT INTO objectsphere_item(item_id,tenant_id,item_name) VALUES($1,$2,$3)',[parent,tenant,'Books']);
  await db.query('INSERT INTO objectsphere_object_type(object_type_id,tenant_id,type_name) VALUES($1,$2,$3)',[typeId,tenant,'Book']);
  await db.query('INSERT INTO objectsphere_attribute(attribute_id,tenant_id,object_type_id,attribute_name,attribute_type) VALUES($1,$2,$3,$4,$5)',[attributeId,tenant,typeId,'ISBN','text']);
  const ctx={body:{parent_item_id:parent,catalogue:sample(),source_keys:['001']},broker:async(profile,action,{statements,text,values})=>{
   if(action==='query')return db.query(text,values);
   await db.exec('BEGIN');try{const results=[];for(const s of statements){const r=await db.query(s.text,s.values||[]);const rowCount=/^SELECT/i.test(s.text.trim())?r.rows.length:r.affectedRows;if(s.expectedRowCount!==undefined&&rowCount!==s.expectedRowCount)throw Error('Transaction precondition failed');results.push({rows:r.rows,rowCount});}await db.exec('COMMIT');return {results};}catch(e){await db.exec('ROLLBACK');throw e;}
  }};
  let plan=await prepare(ctx,access);assert.equal(plan.objects[0].action,'create');
  let result=await commit(ctx,access,plan);assert.equal(result.created.length,1);
  assert.equal((await db.query('SELECT value_text FROM objectsphere_attribute_value')).rows[0].value_text,'0486288404');
  assert.equal((await db.query('SELECT count(*)::int n FROM objectsphere_attribute_value_history')).rows[0].n,1);
  plan=await prepare(ctx,access);assert.equal(plan.objects[0].action,'skip');result=await commit(ctx,access,plan);assert.equal(result.created.length,0);assert.equal(result.skipped,1);
  ctx.body.catalogue.objects[0].name='Changed';plan=await prepare(ctx,access);assert.equal(plan.objects[0].action,'conflict');await assert.rejects(commit(ctx,access,plan));
  await assert.rejects(prepare(ctx,{...access,tenantId:crypto.randomUUID()}),/Destination/);
  ctx.body.catalogue=sample();ctx.body.catalogue.objects.push({...sample().objects[0],source_key:'002'});ctx.body.source_keys=['001','002'];plan=await prepare(ctx,access);assert.ok(plan.objects[1].warning);result=await commit(ctx,access,plan);assert.equal(result.created.length,1);
  // Force a mid-batch storage failure and verify neither claim nor item survives.
  await db.exec("ALTER TABLE objectsphere_item ADD CONSTRAINT fixture_failure CHECK(item_name <> 'FAIL')");
  ctx.body.catalogue=sample();ctx.body.catalogue.objects=[{...sample().objects[0],source_key:'003',name:'New'},{...sample().objects[0],source_key:'004',name:'FAIL'}];ctx.body.source_keys=['003','004'];plan=await prepare(ctx,access);await assert.rejects(commit(ctx,access,plan));
  assert.equal((await db.query("SELECT count(*)::int n FROM objectsphere_catalogue_import WHERE source_key IN ('003','004')")).rows[0].n,0);
  assert.equal((await db.query("SELECT count(*)::int n FROM objectsphere_item WHERE item_name='New'")).rows[0].n,0);
 }finally{await db.close();}
});
