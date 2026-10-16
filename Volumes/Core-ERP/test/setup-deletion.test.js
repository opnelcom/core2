'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {definitions,owned,prepareSetupDeletion}=require('../api/_shared/erp/setup-deletion');
const {confirmation,install}=require('../public/setup-deletion');
const tenantId='10000000-0000-4000-8000-000000000001',organisationId='20000000-0000-4000-8000-000000000002',recordId='30000000-0000-4000-8000-000000000003';
function fixture(kind,{dependency,columns=[],references,missing=false,conflict=false}={}){
 const [table,key]=definitions[kind];
 const id=kind==='organisation'?organisationId:kind==='country'?'ZZ':kind==='currency'?'ZZZ':recordId;
 const edges=Object.entries(owned).flatMap(([parent,children])=>children.map(child=>({child_schema:'public',child_table:child,parent_table:parent,child_columns:['parent_id'],parent_columns:['parent_id']})));
 if(dependency)edges.push({child_schema:'public',parent_table:table,child_table:dependency,child_columns:[key],parent_columns:[key]});
 const calls=[],batches=[];
 let first=true;
 const ctx={broker:async(profile,operation,request)=>{
   assert.equal(profile,'core_erp');
   calls.push(request);
   if(operation==='transaction'){
     batches.push(request.statements);
     if(conflict)throw Object.assign(new Error('Transaction precondition failed'),{code:'TRANSACTION_PRECONDITION'});
     return {results:request.statements.map(()=>({rows:[],rowCount:1}))};
   }
   if(request.text.includes('FROM pg_constraint'))return {rows:edges};
   if(request.text.includes('FROM information_schema.columns'))return {rows:columns};
   if(first){first=false;return {rows:missing?[]:[{tenant_id:tenantId,organisation_id:organisationId,[key]:id,status_code:'test_status',type_code:'test_type',__erp_snapshot:'[]'}]};}
   if((dependency&&request.text.includes(`FROM "${dependency}" t WHERE EXISTS`))||references?.(request.text))return {rows:[{found:1,__erp_snapshot:'[]'}]};
   return {rows:[]};
 }};
 return {ctx,calls,batches,options:{tenantId,organisationId,kind,id}};
}

test('every saved Setup entry has a scoped permanent-deletion plan and no write occurs during preparation',async()=>{
 assert.equal(Object.keys(definitions).length,22);
 for(const kind of Object.keys(definitions)){
   const f=fixture(kind),plan=await prepareSetupDeletion(f.ctx,f.options);
   assert.equal(f.batches.length,0,kind);
   assert.deepEqual(f.calls[0].values,[tenantId,organisationId,f.options.id]);
   assert.match(f.calls[0].text,/t.tenant_id=\$1::uuid AND t.organisation_id=\$2::uuid/);
   await plan.commit();
   const batch=f.batches[0];
   assert.match(batch[0].text,/LOCK TABLE/);
   const deletes=batch.filter(s=>s.text.startsWith('DELETE FROM'));
   assert.ok(deletes.length,kind);
   assert.ok(deletes.at(-1).text.startsWith(`DELETE FROM "${definitions[kind][0]}"`));
   assert.ok(batch.some(s=>s.expectedRowCount===1));
 }
});

test('foreign-key dependencies block cascading destruction of external business records',async()=>{
 const f=fixture('division',{dependency:'erp_journal'});
 await assert.rejects(prepareSetupDeletion(f.ctx,f.options),e=>e.status===409&&/journal/.test(e.message));
 assert.equal(f.batches.length,0);
});

test('organisation deletion stages setup configuration only; business data blocks it',async()=>{
 const f=fixture('organisation',{dependency:'erp_accounting_object'});
 await assert.rejects(prepareSetupDeletion(f.ctx,f.options),e=>e.status===409);
 assert.equal(f.batches.length,0);
 assert.ok(!owned.erp_organisation.includes('erp_accounting_object'));
 assert.ok(!owned.erp_organisation.includes('erp_journal'));
});

test('logical status and permission references block deletion without relying on foreign keys',async()=>{
 const f=fixture('workflow_status',{columns:['tenant_id','organisation_id','workflow_status'].map(column_name=>({table_name:'erp_accounting_object',column_name,data_type:'text'})),references:sql=>sql.includes('FROM "erp_accounting_object" t WHERE t.tenant_id')});
 await assert.rejects(prepareSetupDeletion(f.ctx,f.options),e=>e.status===409&&/accounting object/.test(e.message));
 assert.equal(f.batches.length,0);
});

test('quoted dependency tables are locked and changed snapshots abort the transaction',async()=>{
 const f=fixture('division',{columns:['tenant_id','organisation_id','division_id'].map(column_name=>({table_name:'erp_record_comment',column_name,data_type:'text'})),conflict:true});
 const plan=await prepareSetupDeletion(f.ctx,f.options);
 await assert.rejects(plan.commit(),e=>e.status===409);
 assert.match(f.batches[0][0].text,/erp_record_comment/);
});

test('invalid kinds, cross-organisation identifiers and missing records cannot delete',async()=>{
 const f=fixture('organisation');
 for(const patch of [{kind:'erp_journal'},{id:recordId},{organisationId:'bad'}])await assert.rejects(prepareSetupDeletion(f.ctx,{...f.options,...patch}),e=>e.status===400);
 const missing=fixture('division',{missing:true});
 await assert.rejects(prepareSetupDeletion(missing.ctx,missing.options),e=>e.status===404);
 assert.equal(f.batches.length,0);
});

test('every owned relationship exists in the application schema',()=>{
 const schema=fs.readFileSync(require.resolve('../schema/erp-schema.sql'),'utf8');
 const tables=new Map([...schema.matchAll(/CREATE TABLE IF NOT EXISTS (erp_\w+)\s*\(([\s\S]*?)\n\s*\);/g)].map(m=>[m[1],m[2]]));
 for(const [parent,children]of Object.entries(owned))for(const child of children){
   assert.ok(tables.get(child)?.includes(`REFERENCES ${parent}(`),`${child} must reference ${parent}`);
 }
});

test('endpoint requires administrator access and explicit data-loss confirmation before preparing deletion',async()=>{
 const source=fs.readFileSync(require.resolve('../api/setup/delete-entry'),'utf8');
 let prepared=0;
 const access={tenantId,setupAdministrator:false};
 const sandbox={module:{exports:{}},require:name=>name.endsWith('/erp')?{authTenant:async()=>access,requireAdmin:()=>access.setupAdministrator?null:{status:403,body:{error:'Denied'}}}:{prepareSetupDeletion:async()=>{prepared++;return {commit:async()=>{}};}}};
 vm.runInNewContext(source,sandbox);
 const ctx={req:{method:'POST'},body:{organisation_id:organisationId,kind:'division',id:recordId},send:(status,body)=>({status,body})};
 assert.equal((await sandbox.module.exports(ctx)).status,403);
 access.setupAdministrator=true;
 assert.equal((await sandbox.module.exports(ctx)).status,400);
 assert.equal(prepared,0);
 ctx.body.confirm_permanent_delete=true;
 assert.equal((await sandbox.module.exports(ctx)).ok,true);assert.equal(prepared,1);
});

test('confirmation names the entry and explicitly warns of permanent destruction and data loss',()=>{
 const message=confirmation('Workflow','Approval');
 assert.match(message,/Workflow "Approval"/);
 assert.match(message,/destroys/);assert.match(message,/data loss cannot be undone/);
});

test('dismissing confirmation causes no API request; accepting submits the saved identifier and confirmation',async()=>{
 const previous={document:global.document,window:global.window,MutationObserver:global.MutationObserver};
 let button,requests=0,closed=0,refreshed=0,accepted=false;
 global.document={createElement:()=>({dataset:{},setAttribute(){},addEventListener(event,fn){this[event]=fn;}}),addEventListener(){}};
 global.window={confirm:()=>accepted};global.MutationObserver=class {observe(){}};
 try{
   const form={querySelector:selector=>selector==='[data-setup-delete]'?null:{prepend(value){button=value;}}};
   let record={id:recordId,name:'Saved record'};
   const control=install({form,kind:'division',label:'Division',getRecord:()=>record,context:()=>({orgId:organisationId}),
     api:async(path,options)=>{requests++;assert.equal(path,'setup/delete-entry');const body=JSON.parse(options.body);assert.equal(body.id,recordId);assert.equal(body.confirm_permanent_delete,true);},
     close:()=>closed++,afterDelete:async()=>refreshed++,notify:message=>assert.fail(message)});
   await button.click();assert.equal(requests,0);
   accepted=true;await button.click();assert.equal(requests,1);assert.equal(closed,1);assert.equal(refreshed,1);
   record=null;control.refresh();assert.equal(button.hidden,true);
 }finally{Object.assign(global,previous);}
});
