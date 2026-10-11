"use strict";
const {PGlite}=require('@electric-sql/pglite'),fs=require('fs'),assert=require('node:assert/strict');
const {initialiseTemplate}=require('../../../Volumes/Core-ERP/api/_shared/erp/template-initialisation');
const defaults=require('../../../Volumes/Core-ERP/seeds/template-defaults.json');
(async()=>{const db=new PGlite();try{
const sql=fs.readFileSync('Volumes/Core-ERP/schema/erp-schema.sql','utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;','');await db.exec(sql);
for(const table of ['erp_organisation','erp_module','erp_gl_account','erp_legal_entity','erp_subledger_account','erp_accounting_object','erp_accounting_dimension','erp_resource','erp_workflow_path'])assert.equal((await db.query('SELECT count(*) n FROM '+table)).rows[0].n,0,table+' seeded by schema');
const access={tenantId:'10000000-0000-0000-0000-000000000001',auth:{email:'test@example.com'},setupAdministrator:true};
let maxBatchBytes=0,injectFailure=false;
const ctx={broker:async(profile,action,args)=>{
 assert.equal(profile,'core_erp');assert.equal(args.operation,undefined,'No application dispatch may reach Broker');
 if(action==='query'){const r=await db.query(args.text,args.values);return {...r,rowCount:Math.max(r.affectedRows||0,r.rows.length)};}
 maxBatchBytes=Math.max(maxBatchBytes,Buffer.byteLength(JSON.stringify(args)));
 return db.transaction(async tx=>{const results=[];for(const s of args.statements){const r=await tx.query(s.text,s.values||[]);const count=Math.max(r.affectedRows||0,r.rows.length);if(s.expectedRowCount!==undefined&&count!==s.expectedRowCount)throw Object.assign(new Error('Transaction precondition failed'),{code:'TRANSACTION_PRECONDITION'});results.push({...r,rowCount:count});}if(injectFailure){injectFailure=false;throw Error('Injected rollback');}return {results};});
}};
const run=async(mode,patch={})=>[{rows:[await initialiseTemplate(ctx,{access,mode,confirmed:true,...patch})],rowCount:1}];
await assert.rejects(()=>run('examples'),/Initialise Template Org/);await assert.rejects(()=>run('definitions',{confirmed:false}),/Confirmed/);
const first=(await run('definitions'))[0].rows[0],id=first.organisation.organisation_id;assert.equal(first.organisation.organisation_name,'TEMPLATE ORG');
for(const table of ['erp_legal_entity','erp_subledger_account','erp_accounting_object','erp_resource'])assert.equal((await db.query('SELECT count(*) n FROM '+table+' WHERE organisation_id=$1',[id])).rows[0].n,0,table+' example leaked');
for(const [type]of defaults.accountingObjectTypeSeeds.filter(r=>r[0].startsWith('tour')))assert.ok((await db.query('SELECT 1 FROM erp_accounting_object_type WHERE organisation_id=$1 AND type_code=$2',[id,type])).rows.length);
await db.exec(sql);assert.equal((await db.query('SELECT count(*) n FROM erp_accounting_object')).rows[0].n,0);
assert.equal((await run('examples'))[0].rows[0].examples.inserted,defaults.exampleData.length);
const records=async()=>(await db.query('SELECT r.*,t.type_code FROM erp_accounting_object r JOIN erp_accounting_object_type t USING(accounting_object_type_id) WHERE r.organisation_id=$1 ORDER BY r.object_code',[id])).rows;
const job=(await records()).find(r=>r.type_code==='tour_job_card');assert.ok(job.additional_data.guides[0].guide&&job.additional_data.vehicles[0].vehicle);
await db.query("UPDATE erp_accounting_object SET object_name='Keep edited example' WHERE accounting_object_id=$1",[job.accounting_object_id]);assert.equal((await run('examples'))[0].rows[0].examples.inserted,0);
await db.query("UPDATE erp_accounting_object_type SET type_name='Changed',schema_json='{}' WHERE organisation_id=$1 AND type_code='tour_booking'",[id]);
await db.query("DELETE FROM erp_accounting_object_type_module WHERE accounting_object_type_id IN (SELECT accounting_object_type_id FROM erp_accounting_object_type WHERE organisation_id=$1 AND type_code='tour_booking')",[id]);
const before=JSON.stringify(await records());assert.equal((await run('definitions'))[0].rows[0].organisation.organisation_id,id);assert.equal(JSON.stringify(await records()),before);
const type=(await db.query("SELECT * FROM erp_accounting_object_type WHERE organisation_id=$1 AND type_code='tour_booking'",[id])).rows[0];assert.equal(type.type_name,defaults.accountingObjectTypeSeeds.find(r=>r[0]==='tour_booking')[1]);assert.deepEqual(type.schema_json,defaults.accountingObjectTypeMetadata.tour_booking.schema_json);
for(const code of ['USD','GBP','EUR','ZAR'])assert.ok((await db.query('SELECT 1 FROM erp_currency WHERE organisation_id=$1 AND currency_code=$2',[id,code])).rows.length);
const snapshot=JSON.stringify((await db.query('SELECT * FROM erp_module WHERE organisation_id=$1 ORDER BY module_code',[id])).rows);injectFailure=true;await assert.rejects(()=>run('definitions'),/Injected rollback/);assert.equal(JSON.stringify((await db.query('SELECT * FROM erp_module WHERE organisation_id=$1 ORDER BY module_code',[id])).rows),snapshot);
assert.equal((await db.query('SELECT 1 FROM erp_organisation WHERE tenant_id=$1',['20000000-0000-0000-0000-000000000001'])).rows.length,0);
await db.query("UPDATE erp_workflow_step SET step_label='Custom draft' WHERE organisation_id=$1 AND step_code='draft'",[id]);await db.exec(sql);assert.equal((await db.query("SELECT step_label FROM erp_workflow_step WHERE organisation_id=$1 AND step_code='draft'",[id])).rows[0].step_label,'Custom draft');
assert.ok(maxBatchBytes<1024*1024,`Broker batch payload ${maxBatchBytes} exceeds default request limit`);
console.log('PASS: ERP template planning with generic Broker batches, definitions/examples, stable IDs, records, schemas, currencies and rollback; maximum batch bytes '+maxBatchBytes);
}finally{await db.close()}})().catch(e=>{console.error(e);process.exitCode=1});
