"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {resetTemplateData,templateResetTables}=require('../api/_shared/erp/template-reset');
const defaults=require('../seeds/template-defaults.json');

test('template reset covers scoped application tables and deletes children before referenced parents',async()=>{
  const sql=fs.readFileSync(path.join(__dirname,'../schema/erp-schema.sql'),'utf8');
  const definitions=[...sql.matchAll(/CREATE TABLE IF NOT EXISTS (erp_[a-z_]+)\s*\(([\s\S]*?)\n\s*\);/g)];
  const calls=[];
  await resetTemplateData({query:async(text,values)=>calls.push({text,values})},'tenant','template');
  for(const [,table,body] of definitions){
    if(table==='erp_organisation'||!body.includes('organisation_id'))continue;
    assert.ok(templateResetTables.includes(table),`${table} must be reset`);
    for(const ref of body.matchAll(/REFERENCES (erp_[a-z_]+)\([^)]*\)([^,\n]*)/g)){
      const parent=ref[1];
      if(parent===table||parent==='erp_organisation'||!templateResetTables.includes(parent))continue;
      assert.ok(templateResetTables.indexOf(table)<templateResetTables.indexOf(parent),`${table} before ${parent}`);
    }
  }
  for(const call of calls){
    assert.match(call.text,/^DELETE FROM erp_[a-z_]+ WHERE tenant_id=\$1 AND organisation_id=\$2$/);
    assert.deepEqual(call.values,['tenant','template']);
  }
  assert.equal(new Set(templateResetTables).size,templateResetTables.length);
});

function loadWithAccess(overrides={}){
  const scope={module:{exports:{}},require:id=>id.endsWith('/context') ? require('../api/_shared/context') : overrides[id]||(id==='./access'?{canInitialiseTemplateOrganisation:async()=>true}:id.startsWith('node:')?require(id):require(path.resolve(__dirname,'../api/_shared/erp',id)))};
  vm.createContext(scope);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../api/_shared/erp/template-initialisation.js'),'utf8'),scope);
  return scope.module.exports;
}

test('rebuild plans a complete reset and fresh seeds together without reading deleted definitions',async()=>{
  const org={organisation_id:'template',is_template:true};
  const reads=[],batches=[];
  const ctx={broker:async(_profile,action,args)=>{
    if(action==='transaction'){
      batches.push(args.statements);
      return {results:args.statements.map(()=>({rows:[org],rowCount:1}))};
    }
    reads.push(args);
    return {rows:[{...org,__erp_snapshot:JSON.stringify([org])}],rowCount:1};
  }};
  await loadWithAccess().initialiseTemplate(ctx,{access:{tenantId:'tenant',auth:{email:'owner@example.test'}},mode:'definitions',confirmed:true});
  assert.equal(batches.length,1);
  const statements=batches[0];
  const reset=statements.filter(s=>/^DELETE FROM erp_[a-z_]+ WHERE tenant_id=\$1 AND organisation_id=\$2$/.test(s.text));
  assert.equal(reset.length,templateResetTables.length);
  assert.ok(reset.every(s=>s.values[0]==='tenant'&&s.values[1]==='template'));
  assert.ok(statements.indexOf(reset.at(-1))<statements.findIndex(s=>s.text.startsWith('INSERT INTO erp_organisation')));
  assert.ok(!reads.some(s=>/SELECT (?:workflow_path_id|tax_type_id|financial_statement_format_id|type_code,type_name,schema_json|module_code) FROM/.test(s.text)));
  const workflowWrites=statements.filter(s=>s.text.startsWith('INSERT INTO erp_workflow_path('));
  assert.deepEqual(workflowWrites.map(s=>s.values[3]),defaults.workflows.map(w=>w.path_name));
  assert.ok(!statements.some(s=>s.values?.includes('Default workflow')));
  assert.equal(statements.filter(s=>/^INSERT INTO erp_report\(/.test(s.text)).length,defaults.reportSeeds.length);
  const typeInsert=statements.find(s=>s.text.includes('INSERT INTO erp_transaction_type('));
  assert.ok(statements.indexOf(typeInsert)>statements.indexOf(reset.at(-1)));
  const schemas=require('../api/_shared/erp/transaction-schema-defaults').resolveTransactionSchemas(defaults);
  const types=JSON.parse(typeInsert.values[2]);
  assert.equal(types.length,110);
  for(const type of types)assert.deepEqual(type.schema_json,schemas[type.type_code]);
  assert.ok(!reads.some(s=>/FROM erp_transaction_type\b/.test(s.text)));
  assert.match(statements[0].text,/LOCK TABLE/);
});

test('non-template organisation with TEMPLATE code is rejected before reset',async()=>{
  const writes=[];
  const client={query:async(text)=>{
    if(/DELETE|INSERT|UPDATE erp_/.test(text))writes.push(text);
    return {rows:[{organisation_id:'other',is_template:false}],rowCount:1};
  }};
  await assert.rejects(loadWithAccess().executeTemplateInitialisation(client,{access:{tenantId:'tenant',auth:{email:'owner@example.test'}},mode:'definitions',confirmed:true}),/non-template organisation/);
  assert.equal(writes.length,0);
});

test('example initialisation adds examples without resetting template data',async()=>{
  const writes=[];
  const client={query:async(text)=>{writes.push(text);return {rows:[{organisation_id:'template',is_template:true}],rowCount:1};}};
  let examplesCalled=false;
  const service=loadWithAccess({
    './seed-record-examples':{seedRecordExamples:async()=>{examplesCalled=true;return {inserted:1};}},
    './seed-line-classifications':{seedLineClassifications:async()=>{}}
  });
  await service.executeTemplateInitialisation(client,{access:{tenantId:'tenant',auth:{email:'owner@example.test'}},mode:'examples',confirmed:true});
  assert.equal(examplesCalled,true);
  assert.ok(!writes.some(text=>text.startsWith('DELETE')));
});

test('a rebuild failure is reported from the single atomic Broker batch',async()=>{
  let batches=0;
  const ctx={broker:async(_profile,action)=>{
    if(action==='transaction'){batches++;throw new Error('Reseed failed');}
    const org={organisation_id:'template',is_template:true};
    return {rows:[{...org,__erp_snapshot:JSON.stringify([org])}],rowCount:1};
  }};
  await assert.rejects(loadWithAccess().initialiseTemplate(ctx,{access:{tenantId:'tenant',auth:{email:'owner@example.test'}},mode:'definitions',confirmed:true}),/Reseed failed/);
  assert.equal(batches,1);
});
