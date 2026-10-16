'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
function fixture(kind,{denied=false,otherRecord=false,removed=false,switched=false}={}){
 const prefix=kind==='subledger'?'account':`accounting-${kind}`;
 const idField=kind==='subledger'?'subledger_account_id':`accounting_${kind}_id`;
 const old={[idField]:'record',scope_code:'asset',workflow_status:'draft',workflow_history:[]};
 const fresh={...old,workflow_status:'active',workflow_step_label:'Active',enabled_for_use:true,available_workflow_steps:[{workflow_next_id:'archive'}],workflow_history:[{new_step_code:'active'}]};
 const elements={[`${prefix}-form`]:{hidden:false},[`${prefix}-id`]:{value:otherRecord?'other':'record'},[`${prefix}-name`]:{value:'Unsaved name'}};
 const updates=[],requests=[];
 const scope={state:{orgId:'org',accounts:[old],accountingObjects:[old],accountingDimensions:[old]},selectedAccountScopeCode:'asset',loadedAccountFamilies:new Set(['asset']),$:(id)=>elements[id],alert:()=>{},
  api:async(path,options)=>{requests.push({path,body:JSON.parse(options.body)});if(denied)throw new Error('Denied');if(switched)scope.state.orgId='other-org';return {record:fresh};},
  loadAccountsForFamily:async()=>scope.state.accounts=removed?[]:[fresh],renderAccounts:()=>{},
  loadAccountingMasterRecords:async loadedKind=>{scope.state[loadedKind==='object'?'accountingObjects':'accountingDimensions']=removed?[]:[fresh];},
  renderWorkflowFooter:(editor,record,onMove)=>{updates.push({editor,record,onMove});},renderWorkflowHistory:(target,record)=>updates.push({target,record})};
 vm.createContext(scope);
 vm.runInContext(source.slice(source.indexOf('  function refreshWorkflowEditor('),source.indexOf('  function renderWorkflowHistory(')),scope);
 const method=kind==='subledger'?'moveSubledgerWorkflow':kind==='object'?'moveAccountingObjectWorkflow':'moveDimensionWorkflow';
 return {scope,elements,prefix,fresh,updates,requests,move:()=>scope[method](old,'activate')};
}
for(const kind of ['subledger','object','dimension']){
 test(`${kind}: open editor gets fresh workflow status, actions and history without resetting unsaved fields`,async()=>{
  const f=fixture(kind);await f.move();assert.equal(f.updates.length,2);assert.equal(f.updates[0].record,f.fresh);assert.equal(f.updates[0].record.workflow_step_label,'Active');assert.equal(f.updates[1].record.workflow_history[0].new_step_code,'active');assert.equal(f.elements[`${f.prefix}-name`].value,'Unsaved name');assert.equal(f.elements[`${f.prefix}-form`].hidden,false);
  await f.updates[0].onMove('archive');assert.equal(f.requests[1].body.workflow_next_id,'archive');
 });
 test(`${kind}: rejected transitions and changed editor/organisation context cannot replace the footer`,async()=>{
  const denied=fixture(kind,{denied:true});await assert.rejects(denied.move(),/Denied/);assert.equal(denied.updates.length,0);
  for(const options of [{otherRecord:true},{switched:true}]){const f=fixture(kind,options);await f.move();assert.equal(f.updates.length,0);assert.equal(f.elements[`${f.prefix}-name`].value,'Unsaved name');}
 });
 test(`${kind}: a record no longer returned by the authorised list closes its stale editor`,async()=>{
  const f=fixture(kind,{removed:true});await f.move();assert.equal(f.elements[`${f.prefix}-form`].hidden,true);assert.equal(f.updates.length,0);assert.equal(f.elements[`${f.prefix}-name`].value,'Unsaved name');
 });
}
