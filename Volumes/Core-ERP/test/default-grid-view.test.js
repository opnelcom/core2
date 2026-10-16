"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const {createRequire} = require("node:module");
const {validateDefaultGridView} = require("../api/_shared/erp/grid-views");
const {seedGridViews} = require("../api/_shared/erp/seed-grid-views");
const defaults = require("../seeds/template-defaults.json");
const endpoints = [
  ["subledger-account-types/save", "subledger_account_type_id"],
  ["accounting-objects/save-type", "accounting_object_type_id"],
  ["accounting-dimensions/save-type", "accounting_dimension_type_id"],
  ["transaction-types/save", "transaction_type_id"],
];
function fixture(endpoint, {admin=true}={}) {
  const file=require.resolve("../api/"+endpoint), actualRequire=createRequire(file), calls=[];
  const scope={module:{exports:{}},require:name=>{
    if(name.endsWith("/erp"))return {
      authTenant:async()=>({tenantId:"tenant"}),requireAdmin:()=>admin?null:{status:403,body:{error:"Administrator required"}},
      clean:(v,f="")=>String(v??f),nullable:v=>v||null,bool:v=>v!==false,
      parseJson:(v,f)=>v===undefined?f:typeof v==="string"?JSON.parse(v):v,
      validateSchemaDefinition:()=>[],validateWorkflowPath:async()=>null,
    };
    if(name.endsWith("/modules"))return {moduleIds:()=>[],validateModules:async()=>null,replaceLinks:async()=>{}};
    return actualRequire(name);
  }};
  vm.runInNewContext(fs.readFileSync(file,"utf8"),scope);
  const ctx={req:{method:"POST"},body:{organisation_id:"org",type_code:"contract",type_name:"Contract",workflow_path_id:"workflow",
    schema_json:"{}",ui_schema_json:"{}",transaction_group_id:"group",is_financial:false},
    send:(status,body)=>({status,body}),broker:async(_profile,action,q)=>{
      calls.push({action,...q});return {rows:[{subledger_account_type_id:"id",accounting_object_type_id:"id",accounting_dimension_type_id:"id",transaction_type_id:"id"}],rowCount:1};
    }};
  return {save:scope.module.exports,ctx,calls};
}
test("default view validation accepts only the shared enum and preserves omitted updates",()=>{
  for(const view of ["columnar","status"])assert.equal(validateDefaultGridView(view).value,view);
  for(const view of [null,"Status","invalid",{},0])assert.ok(validateDefaultGridView(view).error);
  assert.equal(validateDefaultGridView(undefined).value,null);
});
for(const [endpoint,id] of endpoints) {
  test(`${endpoint}: saves default with tenant/organisation scope, rejects invalid values and enforces administrator access`,async()=>{
    for(const editing of [false,true]) {
      const {save,ctx,calls}=fixture(endpoint);ctx.body.default_grid_view="status";
      if(editing)ctx.body[id]="existing";
      await save(ctx);
      const write=calls.find(q=>q.text?.startsWith(editing?"UPDATE":"INSERT INTO"));
      assert.ok(write.text.includes("default_grid_view"));assert.ok(write.values.includes("status"));
      assert.equal(write.values[0],"tenant");assert.ok(write.values.includes("org"));
      const placeholders=[...write.text.matchAll(/\$(\d+)/g)].map(m=>Number(m[1]));
      assert.equal(Math.max(...placeholders),write.values.length);
      if(editing){assert.match(write.text,/tenant_id=\$1/);assert.match(write.text,/organisation_id=/);assert.match(write.text,/COALESCE\(\$\d+,default_grid_view\)/);}
    }
    const invalid=fixture(endpoint);invalid.ctx.body.default_grid_view="bad";
    assert.equal((await invalid.save(invalid.ctx)).status,400);assert.equal(invalid.calls.length,0);
    const denied=fixture(endpoint,{admin:false});denied.ctx.body.default_grid_view="status";
    assert.equal((await denied.save(denied.ctx)).status,403);assert.equal(denied.calls.length,0);
  });
}
test("seeding applies configured defaults only to JSON-defined types in the selected tenant and organisation",async()=>{
  let batch;
  await seedGridViews({broker:async(_p,_a,b)=>{batch=b;}},{tenantId:"tenant"},"org",defaults);
  assert.equal(batch.statements.length,8);
  for(const s of batch.statements.slice(0,4)){assert.match(s.text,/tenant_id=\$1 AND organisation_id=\$2 AND type_code=ANY/);assert.equal(s.values[0],"tenant");assert.equal(s.values[1],"org");assert.equal(s.values[3],"columnar");assert.ok(s.values[2].length);}
  assert.deepEqual(batch.statements.slice(4).map(s=>s.values),[["tenant","org","work_order","status"],["tenant","org","fleet_vehicle","columnar"],["tenant","org","sales_lead","status"],["tenant","org","sales_opportunity","status"]]);
  await assert.rejects(()=>seedGridViews({broker:async()=>{}},{tenantId:"tenant"},"org",{...defaults,defaultGridViews:{...defaults.defaultGridViews,transaction:"bad"}}),/Invalid seeded/);
});
test("Initialise Schema updates existing type tables and organisation copy retains all four defaults",()=>{
  const sql=fs.readFileSync(require.resolve("../schema/erp-schema.sql"),"utf8");
  assert.match(sql,/ADD COLUMN IF NOT EXISTS default_grid_view text NOT NULL DEFAULT ''columnar''/);
  assert.match(sql,/CHECK \(default_grid_view IN \(''columnar'',''status''\)\)/);
  const copy=fs.readFileSync(require.resolve("../api/organisations/copy-organisation-setup.js"),"utf8");
  for(const [,id] of endpoints){const kind=id.replace(/_type_id$/,""),start=copy.indexOf(`INSERT INTO erp_${kind}_type(`),block=copy.slice(start,copy.indexOf('`',start));assert.ok(block.includes("default_grid_view=excluded.default_grid_view"));assert.match(block,/source_types?\.default_grid_view/);}
});
