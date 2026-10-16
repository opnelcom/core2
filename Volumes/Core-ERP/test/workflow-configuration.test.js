"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {normaliseWorkflow,workflowStatements,workflowUseSql}=require('../api/_shared/erp/workflow-configuration');
const seeds=require('../seeds/template-defaults.json');
const catalogue=[{status_code:'draft'},{status_code:'active'},{status_code:'closed'}];
const base=()=>({path_name:'Example',steps:[
 {step_code:'draft',is_initial:true,enabled_for_use:false,sort_order:30,actions:[
  {action_label:'Activate',next_step_code:'active',sort_order:20},
  {action_label:'Close',next_step_code:'closed',sort_order:10}]},
 {step_code:'active',enabled_for_use:true,sort_order:10,actions:[]},
 {step_code:'closed',enabled_for_use:false,sort_order:20,actions:[]}
]});
test('configurable record workflows accept custom statuses and upgrade existing fixed constraints',()=>{
 const sql=fs.readFileSync(require.resolve('../schema/erp-schema.sql'),'utf8');
 const upgrade=sql.match(/FOREACH table_name IN ARRAY ARRAY\[([^\]]+)\] LOOP[\s\S]*?END LOOP/)[0];
 for(const table of ['erp_subledger_account','erp_accounting_object','erp_accounting_dimension']){
  const definition=sql.split(`CREATE TABLE IF NOT EXISTS ${table}(`)[1].split('\n    );')[0];
  assert.match(definition,/workflow_status text NOT NULL DEFAULT 'draft',/);
  assert.doesNotMatch(definition,/CHECK\(workflow_status IN/);
  assert.ok(upgrade.includes(`'${table}'`));
 }
 assert.match(upgrade,/contype='c'/);
 assert.match(upgrade,/pg_get_constraintdef\(oid\) LIKE '%workflow_status%'/);
 assert.match(upgrade,/ALTER TABLE %I DROP CONSTRAINT %I/);
});
test('status settings are stored once and action sort is independent of status sort',()=>{
 const d=normaliseWorkflow(base(),catalogue);
 assert.equal(d.steps.length,3);assert.equal(d.actions.length,2);
 assert.equal(d.steps[0].is_initial,true);assert.equal(d.steps[0].enabled_for_use,false);
 const statements=workflowStatements('tenant','org','path',d);
 const memberships=statements.filter(s=>s.text.includes('INSERT INTO erp_workflow_path_status'));
 const actions=statements.filter(s=>s.text.includes('INSERT INTO erp_workflow_next'));
 assert.equal(memberships.length,3);assert.equal(actions.length,2);
 assert.deepEqual(memberships[0].values.slice(3),['draft',true,false,30]);
 assert.deepEqual(actions.map(s=>s.values.at(-1)),[20,10]);
 assert.ok(statements.every(s=>s.values.includes('tenant')&&s.values.includes('org')));
 assert.ok(!statements.some(s=>s.text.includes('initial_step_code')));
});
test('workflow validation rejects duplicate statuses, zero/multiple initials and invalid actions',()=>{
 for(const change of [b=>b.steps.push({...b.steps[0]}),b=>b.steps.forEach(r=>r.is_initial=false),
  b=>b.steps[1].is_initial=true,b=>b.steps[0].step_code='foreign',
  b=>b.steps[0].actions[0].next_step_code='foreign',b=>b.steps[0].actions[0].next_step_code='',
  b=>b.steps[0].sort_order=1.5,b=>b.steps[0].actions[0].sort_order=1.5,
  b=>b.steps[0].actions[1].action_label='ACTIVATE',b=>b.steps.pop(),
  b=>b.steps[0].actions={},b=>b.steps=[]]){
  const b=base();change(b);assert.throws(()=>normaliseWorkflow(b,catalogue));
 }
});
test('different actions may share the same target status',()=>{
 const b=base();b.steps[0].actions[1].next_step_code='active';assert.equal(normaliseWorkflow(b,catalogue).actions.length,2);
});
test('a terminal status requires no placeholder action',()=>{
 const b=base();const d=normaliseWorkflow(b,catalogue);
 assert.deepEqual(d.steps.find(s=>s.step_code==='closed').actions,[]);
 assert.equal(d.steps.filter(s=>s.is_initial).length,1);
});
test('the illustrated workflows have valid targets, one initial and terminal statuses',()=>{
 assert.deepEqual(seeds.workflows.map(w=>w.path_name),['No Workflow','Simple Master Data','Full Master Data Management','Transaction Management','Maintenance','Insurance Claim','Sales Lead','Sales Opportunity']);
 for(const w of seeds.workflows){const d=normaliseWorkflow(w,seeds.workflowStatuses);assert.ok(d.steps.length);assert.equal(d.steps.filter(s=>s.is_initial).length,1);}
 assert.ok(seeds.workflowStatuses.some(s=>s.status_code==='requesting_archive'&&s.status_label==='Requesting Archive'));
 assert.ok(seeds.workflowStatuses.some(s=>s.status_code==='requesting_reactivation'&&s.status_label==='Requesting Reactivation'));
});
test('availability SQL binds a status to its workflow, tenant and organisation',()=>{
 const sql=workflowUseSql('record','type');assert.match(sql,/usable.tenant_id=record.tenant_id/);assert.match(sql,/usable.organisation_id=record.organisation_id/);assert.match(sql,/usable.enabled_for_use=true/);assert.throws(()=>workflowUseSql('request;DROP','type'));
});
function journalFixture({target='posted',status='submitted',posted=false,financial=true,permission=null,invalid=false,invalidAllocations=false,actionRoleAllowed=true}={}){
 const calls=[],writes=[];
 const journal={journal_id:'journal',organisation_id:'org',transaction_type_id:'type',source_division_id:'division',workflow_path_id:'path',workflow_status:status,posted_at:posted?'date':null,is_financial:financial,fiscal_period_id:'period'};
 const plan={client:{query:async(sql)=>({rows:sql.includes('FROM erp_journal j')?[journal]:[{workflow_next_id:'action',next_step_code:target,action_label:'Post'}],rowCount:1})},write:s=>writes.push(s),commit:async()=>calls.push('commit')};
 const erp={authTenant:async()=>({tenantId:'tenant',setupAdministrator:true,auth:{email:'owner'}}),requireModuleAccess:async()=>null,requireResourcePermission:async()=>permission,validateJournal:async()=>{calls.push('balance');if(invalid)throw new Error('Unbalanced');},checkPeriodOpen:async()=>calls.push('period'),nullable:v=>v||null};
 const scope={module:{exports:{}},require:name=>name.includes('workflow-action-roles')?{hasWorkflowActionRole:async()=>actionRoleAllowed}:name.includes('transaction-plan')?{createTransactionPlan:()=>plan}:name.includes('workflow-journals')?{validateJournalAllocationUse:async()=>{calls.push('allocations');if(invalidAllocations)throw new Error('Disabled allocation');}}:erp};
 vm.createContext(scope);vm.runInContext(fs.readFileSync(require.resolve('../api/journals/workflow.js'),'utf8'),scope);
 return {calls,writes,run:()=>scope.module.exports({req:{method:'POST'},body:{journal_id:'journal',workflow_next_id:'action'},send:(status,body)=>({status,body})})};
}
test('Post validates balance, period and allocation availability before setting posting marker and audit',async()=>{
 const f=journalFixture();assert.equal((await f.run()).ok,true);assert.deepEqual(f.calls,['balance','period','allocations','commit']);assert.equal(f.writes.length,1);assert.match(f.writes[0].text,/posted_at=CASE WHEN/);assert.match(f.writes[0].text,/erp_workflow_history/);assert.equal(f.writes[0].values[4],true);
});
test('failed accounting validation or disabled allocations never writes a journal transition',async()=>{
 for(const options of [{invalid:true},{invalidAllocations:true}]){const f=journalFixture(options);await assert.rejects(f.run());assert.equal(f.writes.length,0);assert.ok(!f.calls.includes('commit'));}
});
test('posted journals and denied target permissions cannot transition',async()=>{
 for(const options of [{posted:true},{permission:{status:403,body:{error:'Denied'}}}]){const f=journalFixture(options);assert.ok((await f.run()).status>=400);assert.equal(f.writes.length,0);}
});
test('free-text non-posting actions do not post transactions',async()=>{
 const f=journalFixture({target:'draft'});await f.run();assert.equal(f.writes[0].values[4],false);assert.deepEqual(f.calls,['commit']);
});


test('database membership and action foreign keys preserve organisation boundaries and one initial status',()=>{
 const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(':memory:');
 try{
  db.exec(`PRAGMA foreign_keys=ON;
   CREATE TABLE erp_workflow_path(tenant_id,organisation_id,workflow_path_id,path_name,is_active,is_seeded,updated_at,UNIQUE(tenant_id,organisation_id,workflow_path_id));
   CREATE TABLE erp_workflow_status(tenant_id,organisation_id,status_code,UNIQUE(tenant_id,organisation_id,status_code));
   CREATE TABLE erp_workflow_path_status(tenant_id,organisation_id,workflow_path_id,step_code,is_initial,enabled_for_use,sort_order,
    UNIQUE(tenant_id,organisation_id,workflow_path_id,step_code),
    FOREIGN KEY(tenant_id,organisation_id,workflow_path_id) REFERENCES erp_workflow_path(tenant_id,organisation_id,workflow_path_id),
    FOREIGN KEY(tenant_id,organisation_id,step_code) REFERENCES erp_workflow_status(tenant_id,organisation_id,status_code));
   CREATE UNIQUE INDEX only_initial ON erp_workflow_path_status(tenant_id,organisation_id,workflow_path_id) WHERE is_initial=1;
   CREATE TABLE erp_workflow_next(workflow_next_id,tenant_id,organisation_id,workflow_path_id,current_step_code,next_step_code,action_label,sort_order,
    FOREIGN KEY(tenant_id,organisation_id,workflow_path_id,current_step_code) REFERENCES erp_workflow_path_status(tenant_id,organisation_id,workflow_path_id,step_code),
    FOREIGN KEY(tenant_id,organisation_id,workflow_path_id,next_step_code) REFERENCES erp_workflow_path_status(tenant_id,organisation_id,workflow_path_id,step_code));
   INSERT INTO erp_workflow_status VALUES('tenant','org','draft'),('tenant','org','active'),('tenant','org','closed'),('tenant','foreign','other');`);
  for(const statement of workflowStatements('tenant','org','path',normaliseWorkflow(base(),catalogue))){
   const q=db.prepare(statement.text);const values=Object.fromEntries(statement.values.map((v,i)=>[String(i+1),typeof v==='boolean'?Number(v):v]));q.setAllowUnknownNamedParameters(true);q.all(values);
  }
  assert.equal(db.prepare('SELECT count(*) count FROM erp_workflow_path_status WHERE is_initial=1').get().count,1);
  assert.throws(()=>db.exec("UPDATE erp_workflow_path_status SET is_initial=1 WHERE step_code='active'"),/UNIQUE/);
  assert.throws(()=>db.exec("INSERT INTO erp_workflow_path_status VALUES('tenant','org','path','other',0,0,40)"),/FOREIGN KEY/);
  assert.throws(()=>db.exec("INSERT INTO erp_workflow_next VALUES('bad','tenant','foreign','path','draft','active','Bad',10)"),/FOREIGN KEY/);
 }finally{db.close();}
});

test('a journal action without an assigned user role is denied before accounting checks or writes',async()=>{
 const f=journalFixture({actionRoleAllowed:false});assert.equal((await f.run()).status,403);assert.equal(f.writes.length,0);assert.deepEqual(f.calls,[]);
});
