'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
function fixture({failMove=false,failReload=false,changeOrganisation=false}={}){
 const calls=[],renders=[];
 const original={account_id:'asset',subledger_account_id:'asset',scope_code:'asset_intangibles',workflow_status:'draft',workflow_step_label:'Draft'};
 const unrelated={account_id:'bank',scope_code:'bank',workflow_status:'active'};
 const scope={state:{orgId:'organisation',accounts:[original,unrelated],subledgerAccountTypes:[{type_code:'asset_intangibles',subledger_account_type_id:'asset-type'}]},selectedAccountScopeCode:'asset_intangibles',loadedAccountFamilies:new Set(['asset_intangibles','bank']),
  api:async(path,options)=>{
   calls.push({path,options});
   if(path==='subledger-accounts/workflow'){
    if(failMove)throw new Error('Workflow transition denied');
    if(changeOrganisation)scope.state.orgId='different-organisation';
    return {record:{workflow_status:'active'}};
   }
   if(failReload)throw new Error('Account reload failed');
   return {subledger_accounts:[{subledger_account_id:'asset',subledger_account_type_id:'asset-type',workflow_status:'active',workflow_step_label:'Active',enabled_for_use:true,available_workflow_steps:[{action_label:'Archive',workflow_next_id:'archive'}]}]};
  },renderAccounts:()=>renders.push(scope.state.accounts.find(r=>r.account_id==='asset')),refreshWorkflowEditor:()=>{}};
 vm.createContext(scope);
 vm.runInContext(source.slice(source.indexOf('  async function loadAccountsForFamily('),source.indexOf('  async function loadAllAccounts(')),scope);
 vm.runInContext(source.slice(source.indexOf('  async function moveSubledgerWorkflow('),source.indexOf('  async function moveDimensionWorkflow(')),scope);
 return {scope,calls,renders,original,unrelated,move:()=>scope.moveSubledgerWorkflow(original,'activate')};
}
test('successful transition reloads a cached sub-ledger family and renders its new status and actions',async()=>{
 const f=fixture();await f.move();assert.equal(f.calls.length,2);assert.match(f.calls[1].path,/subledger-accounts\/list\?organisation_id=organisation&subledger_account_type_id=asset-type/);assert.equal(f.renders.length,1);assert.equal(f.renders[0].workflow_status,'active');assert.equal(f.renders[0].workflow_step_label,'Active');assert.equal(f.renders[0].enabled_for_use,true);assert.equal(f.renders[0].available_workflow_steps[0].workflow_next_id,'archive');assert.equal(f.scope.state.accounts.find(r=>r.account_id==='bank'),f.unrelated);assert.equal(f.scope.loadedAccountFamilies.has('bank'),true);assert.equal(f.scope.loadedAccountFamilies.has('asset_intangibles'),true);
});
test('rejected transitions preserve the previous status and do not reload or invalidate the cache',async()=>{
 const f=fixture({failMove:true});await assert.rejects(f.move(),/denied/);assert.equal(f.calls.length,1);assert.equal(f.renders.length,0);assert.equal(f.scope.state.accounts[0],f.original);assert.equal(f.scope.loadedAccountFamilies.has('asset_intangibles'),true);
});
test('failed reloads remain retryable and do not redraw stale status as a successful refresh',async()=>{
 const f=fixture({failReload:true});await assert.rejects(f.move(),/reload failed/);assert.equal(f.renders.length,0);assert.equal(f.scope.loadedAccountFamilies.has('asset_intangibles'),false);assert.equal(f.scope.state.accounts[0].workflow_status,'draft');
});
test('an organisation switch while saving cannot invalidate the new organisation cache',async()=>{
 const f=fixture({changeOrganisation:true});await f.move();assert.equal(f.calls.length,1);assert.equal(f.renders.length,0);assert.equal(f.scope.loadedAccountFamilies.has('asset_intangibles'),true);
});
