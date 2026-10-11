'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store}=require('../lib/store'),{Runner}=require('../lib/runner');
function fixture(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'erp-acceptance-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const store=new Store(directory),state={records:[],journals:[],writes:0,workflow:[],wrongGL:false,reportError:false};
  const client={async request(endpoint,method='GET',body={}){
    if(endpoint==='/erp/api/gl-accounts/list')return{records:state.records};
    if(endpoint==='/erp/api/gl-accounts/save'){state.writes++;state.records.push({...body,id:'record-1'});return{record:state.records[0]};}
    if(endpoint==='/erp/api/setup/reference')return{line_definitions:[{transaction_type_id:'type-1',line_code:'bank',transaction_line_definition_id:'bank-def'},{transaction_type_id:'type-1',line_code:'equity',transaction_line_definition_id:'equity-def'}]};
    if(endpoint==='/erp/api/journals/list')return{journals:state.journals};
    if(endpoint==='/erp/api/journals/save'){state.writes++;state.journals.push({...body,journal_id:'journal-1',workflow_status:'draft'});return{journal:state.journals[0]};}
    if(endpoint==='/erp/api/journals/workflow'){state.workflow.push(body.action);state.journals[0].workflow_status=body.action==='submit'?'submitted':'approved';return{journal:state.journals[0]};}
    if(endpoint==='/erp/api/journals/detail')return{journal:state.journals[0],lines:state.journals[0].lines.map(l=>({...l,gl_account_code:state.wrongGL?'2999':l.gl_account_id,subledger_account_code:l.subledger_account_id,accounting_objects:[],accounting_dimensions:[]}))};
    if(endpoint==='/erp/api/reports/financial')return{rows:[{account_code:'1010',debit_total:state.reportError?'200':'100',credit_total:'0',balance:state.reportError?'200':'100'},{account_code:'3000',debit_total:'0',credit_total:'100',balance:'-100'}]};
    throw new Error(`Unexpected ${method} ${endpoint}`);
  }};
  const runner=new Runner(store,client),pack={steps:[
    {id:'setup',kind:'entity',title:'Setup',dependsOn:[],endpoint:'/erp/api/gl-accounts/save',body:{code:'BANK',requires_subledger:true},lookup:{endpoint:'/erp/api/gl-accounts/list',collection:'records',match:{code:'BANK'}},expected:{requires_subledger:true}},
    {id:'fund',kind:'journal',title:'Fund',dependsOn:['setup'],organisation:'org-1',body:{organisation_id:'org-1',transaction_type_id:'type-1',lines:[{definition:'bank',gl_account_id:'1010',subledger_account_id:'BANK',debit_amount:'100',credit_amount:'0'},{definition:'equity',gl_account_id:'3000',debit_amount:'0',credit_amount:'100'}]},expectedJournal:{organisation_id:'org-1',transaction_type_id:'type-1'},expectedPostings:[{gl:'1010',subledger:'BANK',debit:'100',credit:'0'},{gl:'3000',debit:'0',credit:'100'}]},
    {id:'reconcile',kind:'checkpoint',title:'Reconcile',dependsOn:['fund'],query:{organisation_id:'org-1',report:'ledger'}}
  ]};
  const run=runner.create(pack,{},{});return{state,runner,store,run};
}
test('unattended capture submits and approves; restart/resume makes no duplicate writes',async t=>{
  const {state,runner,store,run}=fixture(t);const result=await runner.all(run.id);assert.equal(result.status,'complete');assert.equal(state.writes,2);assert.deepEqual(state.workflow,['submit','approve']);
  const restarted=new Runner(store,runner.client);await restarted.all(run.id);assert.equal(state.writes,2);
  await restarted.step(run.id,'fund','auto');assert.equal(state.writes,2);assert.equal(store.get(run.id).results.reconcile,undefined);
});
test('manual verification never writes or passes a missing record',async t=>{
  const {state,runner,run}=fixture(t);const failed=await runner.step(run.id,'setup','manual');assert.equal(failed.results.setup.status,'failed');assert.equal(state.writes,0);
  state.records.push({code:'BANK',requires_subledger:true});const passed=await runner.step(run.id,'setup','manual');assert.equal(passed.results.setup.status,'passed');assert.equal(state.writes,0);
});
test('wrong posted GL prevents dependent report verification',async t=>{
  const {state,runner,run}=fixture(t);state.wrongGL=true;const result=await runner.all(run.id);assert.equal(result.results.fund.status,'failed');assert.equal(result.results.reconcile,undefined);assert.notEqual(result.status,'complete');
});
test('a report discrepancy fails even when journals are correct',async t=>{
  const {state,runner,run}=fixture(t);state.reportError=true;const result=await runner.all(run.id);assert.equal(result.results.fund.status,'passed');assert.equal(result.results.reconcile.status,'failed');
});
test('checkpoint refuses a missing approved prerequisite even if reports would hide it',async t=>{
  const {state,runner,run}=fixture(t);await runner.all(run.id);state.journals[0].workflow_status='blocked';const result=await runner.step(run.id,'reconcile','manual');assert.equal(result.results.reconcile.status,'failed');assert.match(result.results.reconcile.error,/missing/);
});
test('ambiguous existing records are never overwritten',async t=>{
  const {state,runner,run}=fixture(t);state.records.push({code:'BANK'},{code:'BANK'});const result=await runner.step(run.id,'setup','auto');assert.match(result.results.setup.error,/Ambiguous/);assert.equal(state.writes,0);
});
test('capability gap invalidates dependent passes and cannot certify completion',async t=>{
  const {runner,run}=fixture(t);await runner.all(run.id);const result=runner.annotate(run.id,'setup','capability_gap','Required control is unavailable');assert.equal(result.results.setup.status,'capability_gap');assert.equal(result.results.fund,undefined);assert.equal(result.results.reconcile,undefined);assert.notEqual(result.status,'complete');
});
test('pause takes effect after the current step',async t=>{
  const {runner,run}=fixture(t);const original=runner.client.request;runner.client.request=async(...args)=>{const result=await original(...args);if(args[0]==='/erp/api/gl-accounts/save')runner.pause(run.id);return result;};
  const result=await runner.all(run.id);assert.equal(result.results.setup.status,'passed');assert.equal(result.results.fund,undefined);
});
test('new organisation admin claim handles protected role lookup',async t=>{
  const {runner,store}=fixture(t);let claimed=false,writes=0;runner.client={async request(endpoint,method){if(method==='POST'){claimed=true;writes++;return{};}if(!claimed)throw Object.assign(new Error('Administrator access required'),{status:403});return{roles:[{role_id:'security-role',role_code:'security_administrator',is_admin:true}],role_users:[{role_id:'security-role',email:'test@example.com'}]};}};
  const run=runner.create({steps:[{id:'claim',title:'Claim',kind:'entity',dependsOn:[],endpoint:'/erp/api/permissions/claim-admin',body:{organisation_id:'org'},lookup:{endpoint:'/erp/api/permissions/list',collection:'roles',match:{role_code:'security_administrator'}},expected:{is_admin:true}}]}, {},{email:'test@example.com'});
  await runner.step(run.id,'claim','auto');assert.equal(store.get(run.id).results.claim.status,'passed');assert.equal(writes,1);
});
