'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
function fixture(){
 let records=[],calls=0,fail=false;
 const scope={state:{orgId:'org',divisionId:'root',includeChildren:false},api:async()=>{calls++;if(fail)throw new Error('Lookup failed');return {records};},$:()=>({innerHTML:''}),addJournalLine(){},syncJournalCaptureRules(){},recalculateBalancingLines(){},addTransactionTypeLine(){}};
 vm.createContext(scope);
 for(const [start,end] of [['  const classificationValueCache = new Map();','  async function fillClassificationSelect('],['  function renderJournalLines(','  function recalculateBalancingLines('],['  function renderTransactionTypeLines(','  function transactionLineSectionIcon(']])vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))),scope);
 return {scope,setRecords:value=>{records=value;},setFail:value=>{fail=value;},calls:()=>calls};
}
test('reopening capture or setup refreshes an earlier empty object lookup after records are saved',async()=>{
 for(const render of ['renderJournalLines','renderTransactionTypeLines']){
  const f=fixture();assert.equal((await f.scope.classificationValues('object','property')).length,0);
  f.setRecords([{accounting_object_id:'new-property'}]);
  assert.equal((await f.scope.classificationValues('object','property')).length,0);
  f.scope[render]([]);
  assert.equal((await f.scope.classificationValues('object','property'))[0].accounting_object_id,'new-property');
  assert.equal(f.calls(),2);
 }
});
test('lookups are reused per scope but organisation, division and child-scope changes request fresh records',async()=>{
 const f=fixture();
 await f.scope.classificationValues('object','property');await f.scope.classificationValues('object','property');assert.equal(f.calls(),1);
 for(const [field,value] of [['divisionId','child'],['includeChildren',true],['orgId','other']]){f.scope.state[field]=value;await f.scope.classificationValues('object','property');}
 assert.equal(f.calls(),4);
});
test('failed lookups can retry and records explicitly disabled for use remain excluded',async()=>{
 const f=fixture();f.setFail(true);await assert.rejects(f.scope.classificationValues('dimension','service'),/Lookup failed/);
 f.setFail(false);f.setRecords([{id:'active',enabled_for_use:true},{id:'blocked',enabled_for_use:false}]);
 assert.deepEqual(Array.from(await f.scope.classificationValues('dimension','service'),row=>row.id),['active']);assert.equal(f.calls(),2);
});
test('an old-scope response is discarded after the organisation changes',async()=>{
 const f=fixture();let finish;f.scope.api=()=>new Promise(resolve=>{finish=resolve;});
 const result=f.scope.classificationValues('object','property');f.scope.state.orgId='other';finish({records:[{id:'old-org'}]});
 assert.equal((await result).length,0);
});
