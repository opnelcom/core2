"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function endpoint(name){
 const scope={module:{exports:{}},require:id=>id.endsWith('/context') ? require('../api/_shared/context') : id.endsWith('template-initialisation')?{initialiseTemplate:async(ctx,options)=>{ctx.plans=[...(ctx.plans||[]),options];return {organisation:{organisation_name:'TEMPLATE ORG'}};}}:require('../api/_shared/erp')};
 vm.createContext(scope);vm.runInContext(fs.readFileSync(path.join(__dirname,`../api/setup/${name}.js`),'utf8'),scope);return scope.module.exports;
}
const definitions=endpoint('init-template'),examples=endpoint('init-template-examples'),schema=require("../api/setup/schema");
function context({admin=true,confirmed=true,authenticated=true}={}) {
 const calls=[];
 return {calls,req:{method:"POST"},body:{confirmed},cookies:{current_tenant:"tenant"},tenantSession:async function(){const auth=this.auth();return auth?{auth,tenantId:this.cookies.current_tenant}:{status:401,body:{error:"Authentication required"}};},auth:()=>authenticated?{email:"user@example.com"}:null,send:(status,body)=>({status,body}),broker:async(profile,action,args)=>{
  calls.push({profile,action,args});
  if(profile==="core_saas")throw new Error("Applications must not query SaaS tables");
  if(args.text?.includes("to_regclass('erp_role')"))return {rows:[{role_table:"erp_role",user_role_table:"erp_user_role"}],rowCount:1};
  if(args.text?.includes("lower(ur.email)"))return {rows:admin?[{}]:[],rowCount:admin?1:0};
  if(action==="transaction")return {results:[{rows:[{organisation:{organisation_name:"TEMPLATE ORG"}}]}]};
  return {rows:[{}],rowCount:1};
 }};
}
test("template operations require authentication, administrator rights and explicit confirmation",async()=>{
 for(const endpoint of [definitions,examples]){
  for(const [options,status]of [[{authenticated:false},401],[{confirmed:false},400],[{admin:false},403]]){
   const ctx=context(options);assert.equal((await endpoint(ctx)).status,status);assert.ok(!ctx.calls.some(c=>c.action==="transaction"));
  }
 }
});
test("definition and example endpoints invoke ERP planning with authenticated access",async()=>{
 for(const [endpoint,mode]of [[definitions,"definitions"],[examples,"examples"]]){
  const ctx=context();await endpoint(ctx);const plan=ctx.plans[0];
  assert.equal(plan.mode,mode);assert.equal(plan.access.tenantId,"tenant");assert.equal(plan.confirmed,true);
  assert.ok(!ctx.calls.some(call=>call.args.operation));
 }
});
test("Initialise Schema dispatches structural SQL without any template seeding queries",async()=>{
 const ctx=context();ctx.body.access_organisation_id="org";await schema(ctx);
 const ddl=ctx.calls.filter(c=>c.args.text?.includes("CREATE TABLE"));assert.equal(ddl.length,1);
 assert.ok(!ddl[0].args.text.includes("INSERT INTO erp_workflow_path"));assert.ok(!ctx.calls.some(c=>c.args.operation||c.args.text?.includes("SELECT organisation_id FROM erp_organisation")));
});


test("definition initialisation executes with the shared status catalogue and multiple workflows",async()=>{
 const defaults=require('../api/_shared/erp/seeding').loadTemplateDefaults();
 assert.equal(defaults.workflowDefaults,undefined);
 const writes=[];let seeded=false;
 const scope={module:{exports:{}},require:id=>id.endsWith('/context') ? require('../api/_shared/context') : id==='./seeding'?{
   loadTemplateDefaults:()=>defaults,
   seedOrganisationDefaults:async(_ctx,access,id)=>{assert.equal(access.tenantId,'tenant');assert.equal(id,'org');assert.equal(defaults.workflows.length,8);seeded=true;}
 }:id==='./access'?{canInitialiseTemplateOrganisation:async()=>true}:id.startsWith('node:')?require(id):require(path.resolve(__dirname,'../api/_shared/erp',id))};
 vm.createContext(scope);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../api/_shared/erp/template-initialisation.js'),'utf8'),scope);
 const client={query:async(text,values)=>{writes.push({text,values});return {rows:[{organisation_id:'org',is_template:true}],rowCount:1};}};
 const result=await scope.module.exports.executeTemplateInitialisation(client,{access:{tenantId:'tenant',auth:{email:'owner@example.test'}},mode:'definitions',confirmed:true});
 assert.equal(result[0].rows[0].organisation.organisation_id,'org');assert.equal(seeded,true);
 assert.ok(writes.some(q=>q.text.includes('INSERT INTO erp_user_role')));
});
