'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {normaliseWorkflow} = require('../api/_shared/erp/workflow-configuration');
const {visibleRows, prepare} = require('../public/workflow-grid-visibility');
const seeds = require('../seeds/template-defaults.json');
const fs = require('node:fs');
const vm = require('node:vm');

function statusEndpoint(access) {
  const sandbox = {module:{exports:{}},require: name => name.endsWith('/context') ? require('../api/_shared/context') : name === 'crypto' ? require('node:crypto') : {
    authTenant:async()=>access,requireAdmin:()=>access.denied || null,
    requireBusinessAccess:async()=>null,clean:value=>String(value || '').trim(),
    normalizeStepCode:value=>String(value || '').trim().toLowerCase(),
  }};
  vm.runInNewContext(fs.readFileSync(require.resolve('../api/setup/workflow-statuses'),'utf8'),sandbox);
  return sandbox.module.exports;
}

test('status API defaults new settings and persists explicit settings within tenant and organisation', async () => {
  const endpoint=statusEndpoint({tenantId:'tenant'});
  let query;
  const ctx={req:{method:'POST'},body:{organisation_id:'org',status_code:'active',status_label:'Active',colour:'#067647'},
    send:(status,body)=>({status,body}),broker:async(profile,operation,value)=>{query=value;return {rowCount:1,rows:[{}]};}};
  await endpoint(ctx);
  assert.deepEqual(Array.from(query.values.slice(0,2)),['tenant','org']);
  assert.deepEqual(Array.from(query.values.slice(-3)),[false,true,false]);
  ctx.body={...ctx.body,workflow_status_id:'status',enabled_for_use:true,displayed:false,transitional:true};
  await endpoint(ctx);
  assert.match(query.text,/tenant_id=\$1 AND organisation_id=\$2/);
  assert.deepEqual(Array.from(query.values.slice(-3)),[true,false,true]);
  for (const key of ['displayed','transitional']) {
    const original=ctx.body[key];
    ctx.body[key]='false';
    assert.equal((await endpoint(ctx)).status,400);
    ctx.body[key]=original;
  }
});

test('status API denies unauthorised setting changes before database writes', async () => {
  const endpoint=statusEndpoint({tenantId:'tenant',denied:{status:403,body:{error:'Denied'}}});
  const result=await endpoint({req:{method:'POST'},body:{organisation_id:'org'},
    send:(status,body)=>({status,body}),broker:()=>assert.fail('No writes permitted')});
  assert.equal(result.status,403);
});

test('template seeding persists the agreed transitional statuses and resets other statuses to false', async () => {
  const expected=['submitted','requesting_archive','requesting_reactivation','team_allocation_pending','reported','assessing','new','proposal','negotiation'];
  assert.deepEqual(seeds.workflowStatuses.filter(s=>s.transitional).map(s=>s.status_code).sort(),expected.sort());
  const batches=[];
  const ctx={broker:async(profile,operation,value)=>{
    if(operation==='transaction')batches.push(value.statements);
    return {rows:[],rowCount:0};
  }};
  await require('../api/_shared/erp/workflow-seeding').seedWorkflowDefinitions(ctx,{tenantId:'tenant'},'org',{
    workflowStatuses:seeds.workflowStatuses,workflows:[]
  });
  assert.equal(batches[0].length,seeds.workflowStatuses.length);
  for(const [index,statement] of batches[0].entries()){
    assert.match(statement.text,/transitional=excluded.transitional/);
    assert.deepEqual(statement.values.slice(0,2),['tenant','org']);
    assert.equal(statement.values[8],expected.includes(seeds.workflowStatuses[index].status_code));
  }
});

test('workflow membership copies catalogue availability but preserves explicit overrides', () => {
  const statuses = [{status_code:'active',enabled_for_use:true}];
  const body = {path_name:'Example',steps:[{step_code:'active',is_initial:true,sort_order:10,actions:[]}]};
  const copied = normaliseWorkflow(body,statuses);
  assert.equal(copied.steps[0].enabled_for_use,true);
  statuses[0].enabled_for_use=false;
  assert.equal(copied.steps[0].enabled_for_use,true);
  body.steps[0].enabled_for_use=true;
  assert.equal(normaliseWorkflow(body,statuses).steps[0].enabled_for_use,true);
  body.steps[0].enabled_for_use=false;
  statuses[0].enabled_for_use=true;
  assert.equal(normaliseWorkflow(body,statuses).steps[0].enabled_for_use,false);
});

test('grid visibility follows catalogue independently of workflow availability', () => {
  const rows = [{workflow_status:'active',enabled_for_use:false},{workflow_status:'archived',enabled_for_use:true},{workflow_status:'custom'}];
  const statuses = [{status_code:'active',displayed:true},{status_code:'archived',displayed:false}];
  assert.deepEqual(visibleRows(rows,statuses),[rows[0],rows[2]]);
  assert.equal(visibleRows(rows,statuses,true),rows);
  statuses[1].displayed=true;
  assert.deepEqual(visibleRows(rows,statuses),rows);
});

test('Show hidden records can reveal and hide records repeatedly without losing source rows', () => {
  const previous = global.document;
  global.document = {
    createElement: () => ({append(){},addEventListener(event,fn){this.change=fn;}}),
    createTextNode: text => text,
  };
  try {
    let label, displayed;
    const target = {before(value){label=value;}};
    // Capture the checkbox while retaining a minimal DOM for the shared control.
    const create = global.document.createElement;
    let input;
    global.document.createElement = tag => {const node=create();if(tag==='input') input=node;return node;};
    const rows=[{workflow_status:'archived'}], statuses=[{status_code:'archived',displayed:false}];
    const refresh=()=>{displayed=prepare(target,rows,statuses,refresh);};
    refresh(); assert.ok(label); assert.equal(displayed.length,0);
    input.checked=true; input.change(); assert.equal(displayed.length,1);
    input.checked=false; input.change(); assert.equal(displayed.length,0);
  } finally {global.document=previous;}
});

test('all seeded statuses have descriptions and defaults, with hidden lifecycle and disabled opportunity outcomes', () => {
  for (const status of seeds.workflowStatuses) {
    assert.ok(status.description.trim(),status.status_code);
    assert.equal(typeof status.enabled_for_use,'boolean');
    assert.equal(typeof status.transitional,'boolean');
    assert.equal(status.displayed,!['deleted','archived'].includes(status.status_code));
  }
  for (const code of ['won','lost']) {
    assert.equal(seeds.workflowStatuses.find(s=>s.status_code===code).enabled_for_use,false);
    assert.equal(seeds.workflows.find(w=>w.path_name==='Sales Opportunity').steps.find(s=>s.step_code===code).enabled_for_use,false);
  }
});
