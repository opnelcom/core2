'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {listActions}=require('../api/_shared/erp/object-actions');
const endpoint=require('../api/object-actions/list');
const {prepareLines}=require('../public/object-actions');
const fs=require('node:fs');
const vm=require('node:vm');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`
 CREATE TABLE erp_division(tenant_id,organisation_id,division_id,parent_division_id);
 CREATE TABLE erp_subledger_account(tenant_id,organisation_id,subledger_account_id,subledger_account_type_id,owner_division_id,account_code,account_name,workflow_status);
 CREATE TABLE erp_subledger_account_type(tenant_id,organisation_id,subledger_account_type_id,type_name,workflow_path_id);
 CREATE TABLE erp_accounting_object(tenant_id,organisation_id,accounting_object_id,accounting_object_type_id,owner_division_id,object_code,object_name,workflow_status);
 CREATE TABLE erp_accounting_object_type(tenant_id,organisation_id,accounting_object_type_id,type_name,workflow_path_id);
 CREATE TABLE erp_workflow_path(tenant_id,organisation_id,workflow_path_id);
 CREATE TABLE erp_workflow_step(tenant_id,organisation_id,workflow_path_id,step_code,is_initial,enabled_for_use);
 CREATE TABLE erp_transaction_type(tenant_id,organisation_id,transaction_type_id,transaction_group_id,type_code,type_name,type_description,is_active,sort_order,workflow_path_id);
 CREATE TABLE erp_transaction_group(tenant_id,organisation_id,transaction_group_id,is_active,sort_order);
 CREATE TABLE erp_gl_account(tenant_id,organisation_id,gl_account_id,account_code,account_name);
 CREATE TABLE erp_transaction_line_definition(tenant_id,organisation_id,transaction_type_id,transaction_line_definition_id,line_order,line_code,line_description,debit_credit,occurrence,amount_source,gl_account_id,subledger_account_type_id,subledger_requirement);
 CREATE TABLE erp_transaction_line_definition_object_type(tenant_id,organisation_id,transaction_line_definition_id,accounting_object_type_id,value_behaviour,accounting_object_id);
 CREATE TABLE erp_user_role(tenant_id,organisation_id,role_id,email,valid_from,valid_to);
 CREATE TABLE erp_role(role_id,is_active);
 CREATE TABLE erp_role_permission(role_id,division_id,resource_kind,resource_code,workflow_status,valid_from,valid_to,applies_to_children);
 CREATE TABLE erp_role_module(role_id,module_id);
 CREATE TABLE erp_subledger_account_type_module(subledger_account_type_id,module_id);
 CREATE TABLE erp_accounting_object_type_module(accounting_object_type_id,module_id);
 CREATE TABLE erp_transaction_type_module(transaction_type_id,module_id);
 `);
 const tenant=id(1),org=id(2),division=id(3),child=id(4),type=id(5),object=id(6),tx=id(7),group=id(8),gl=id(9),first=id(10),second=id(11),path=id(12);
 db.prepare('INSERT INTO erp_division VALUES(?,?,?,NULL)').run(tenant,org,division);db.prepare('INSERT INTO erp_division VALUES(?,?,?,?)').run(tenant,org,child,division);
 for(const table of ['erp_subledger_account','erp_accounting_object'])db.prepare(`INSERT INTO ${table} VALUES(?,?,?,?,?,?,?,?)`).run(tenant,org,object,type,division,'AS001','Delivery vehicle','active');
 for(const table of ['erp_subledger_account_type','erp_accounting_object_type'])db.prepare(`INSERT INTO ${table} VALUES(?,?,?,?,NULL)`).run(tenant,org,type,'Asset');
 db.prepare('INSERT INTO erp_transaction_group VALUES(?,?,?,?,?)').run(tenant,org,group,1,1);db.prepare('INSERT INTO erp_gl_account VALUES(?,?,?,?,?)').run(tenant,org,gl,'1500','Assets');
 db.prepare('INSERT INTO erp_workflow_path VALUES(?,?,?)').run(tenant,org,path);db.prepare('INSERT INTO erp_workflow_step VALUES(?,?,?,?,?,?)').run(tenant,org,path,'capture',1,0);
 db.prepare('INSERT INTO erp_transaction_type VALUES(?,?,?,?,?,?,?,?,?,?)').run(tenant,org,tx,group,'transfer','Asset transfer','Transfer asset',1,1,path);
 for(const [line,order,side,occurrence] of [[first,1,'credit','required'],[second,2,'debit','repeatable']]){
  db.prepare('INSERT INTO erp_transaction_line_definition VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(tenant,org,tx,line,order,'line'+order,'Asset '+order,side,occurrence,'manual',gl,type,'mandatory');
  db.prepare('INSERT INTO erp_transaction_line_definition_object_type VALUES(?,?,?,?,?,NULL)').run(tenant,org,line,type,'captured');
 }
 const requests=[];
 const broker=async(_profile,_action,request)=>{requests.push(request);const sql=request.text.replace(/::(?:uuid|text|boolean)/g,'');const stmt=db.prepare(sql);stmt.setAllowUnknownNamedParameters(true);const rows=stmt.all(Object.fromEntries(request.values.map((v,i)=>[String(i+1),typeof v==='boolean'?Number(v):v])));return {rows,rowCount:rows.length};};
 const access={tenantId:tenant,setupAdministrator:true,auth:{email:'viewer@example.test'}};
 const query={organisation_id:org,object_kind:'subledger_account',object_id:object};
 function grant({kind='transaction',status='capture',code='*',children=true,from='2020-01-01',to=null}={}){db.prepare("INSERT INTO erp_role_permission VALUES('role',?,?,?,?,?,?,?)").run(division,kind,code,status,from,to,Number(children));}
 function user(){access.setupAdministrator=false;db.exec("INSERT INTO erp_role VALUES('role',1);INSERT INTO erp_role_module VALUES('role','module')");db.prepare('INSERT INTO erp_user_role VALUES(?,?,?,?,?,NULL)').run(tenant,org,'role',access.auth.email,'2020-01-01');for(const table of ['erp_subledger_account_type_module','erp_accounting_object_type_module'])db.prepare(`INSERT INTO ${table} VALUES(?,?)`).run(type,'module');db.prepare('INSERT INTO erp_transaction_type_module VALUES(?,?)').run(tx,'module');grant({kind:'subledger_account',status:'view'});grant({kind:'accounting_object',status:'view'});}
 return {db,tenant,org,division,child,type,object,tx,group,gl,first,second,path,access,requests,user,grant,run:(overrides={})=>listActions({query:{...query,...overrides},broker},access)};
}
test('both supported classes expose matching definitions once per transaction, including repeatable lines',async()=>{
 const f=fixture();try{for(const object_kind of ['subledger_account','accounting_object']){const result=await f.run({object_kind});assert.equal(result.transactions.length,1);assert.deepEqual(result.transactions[0].lines.map(l=>l.transaction_line_definition_id),[f.first,f.second]);assert.equal(result.source_division_id,f.division);assert.equal(result.object.object_id,f.object);}assert.ok(f.requests.every(r=>Math.max(...Array.from(r.text.matchAll(/\$(\d+)/g),m=>Number(m[1])))===r.values.length));}finally{f.db.close();}
});
test('fixed allocations cannot be overridden; defaulted allocations remain selectable',async()=>{
 const f=fixture();try{f.db.prepare("UPDATE erp_transaction_line_definition_object_type SET value_behaviour='fixed',accounting_object_id=? WHERE transaction_line_definition_id=?").run(id(999),f.first);let result=await f.run({object_kind:'accounting_object'});assert.deepEqual(result.transactions[0].lines.map(l=>l.transaction_line_definition_id),[f.second]);f.db.prepare("UPDATE erp_transaction_line_definition_object_type SET value_behaviour='defaulted' WHERE transaction_line_definition_id=?").run(f.first);result=await f.run({object_kind:'accounting_object'});assert.equal(result.transactions[0].lines.length,2);f.db.prepare("UPDATE erp_transaction_line_definition_object_type SET value_behaviour='fixed',accounting_object_id=? WHERE transaction_line_definition_id=?").run(f.object,f.first);assert.equal((await f.run({object_kind:'accounting_object'})).transactions[0].lines.length,2);}finally{f.db.close();}
});
test('inactive configuration and objects not enabled for use cannot start transactions',async()=>{
 const f=fixture();try{f.db.exec('UPDATE erp_transaction_type SET is_active=0');assert.equal((await f.run()).transactions.length,0);f.db.exec('UPDATE erp_transaction_type SET is_active=1;UPDATE erp_transaction_group SET is_active=0');assert.equal((await f.run()).transactions.length,0);f.db.exec('UPDATE erp_transaction_group SET is_active=1');f.db.prepare('UPDATE erp_subledger_account_type SET workflow_path_id=?').run(f.path);const result=await f.run();assert.equal(result.transactions.length,0);assert.match(result.transaction_message,/not enabled/);await assert.rejects(f.run({transaction_type_id:f.tx}),e=>e.status===409);}finally{f.db.close();}
});
test('capture grants use the initial workflow step, division inheritance, validity and module membership',async()=>{
 const f=fixture();try{f.user();f.grant({status:'view'});assert.equal((await f.run()).transactions.length,0);f.grant();assert.equal((await f.run({source_division_id:f.child})).transactions.length,1);f.db.exec("DELETE FROM erp_role_permission WHERE resource_kind='transaction'");f.grant({children:false});assert.equal((await f.run({source_division_id:f.child})).transactions.length,0);f.db.exec("DELETE FROM erp_role_permission WHERE resource_kind='transaction'");f.grant({to:'2000-01-01'});assert.equal((await f.run()).transactions.length,0);f.db.exec("DELETE FROM erp_role_permission WHERE resource_kind='transaction'");f.grant({from:'2999-01-01'});assert.equal((await f.run()).transactions.length,0);f.db.exec("DELETE FROM erp_role_permission WHERE resource_kind='transaction'");f.grant({code:id(999)});assert.equal((await f.run()).transactions.length,0);f.grant();f.db.exec('DELETE FROM erp_transaction_type_module');assert.equal((await f.run()).transactions.length,0);}finally{f.db.close();}
});
test('foreign objects, divisions, classifications and stale line choices are rejected',async()=>{
 const f=fixture();try{await assert.rejects(f.run({object_id:id(999)}),e=>e.status===404);await assert.rejects(f.run({organisation_id:id(999)}),e=>e.status===404);await assert.rejects(f.run({source_division_id:id(999)}),e=>e.status===400);await assert.rejects(f.run({object_kind:'accounting_dimension'}),e=>e.status===400);await assert.rejects(f.run({transaction_line_definition_id:f.first}),e=>e.status===400);await assert.rejects(f.run({transaction_type_id:f.tx,transaction_line_definition_id:id(999)}),e=>e.status===409);f.db.prepare('UPDATE erp_transaction_line_definition SET subledger_account_type_id=? WHERE transaction_line_definition_id=?').run(id(999),f.first);await assert.rejects(f.run({transaction_type_id:f.tx,transaction_line_definition_id:f.first}),e=>e.status===409);f.db.prepare('UPDATE erp_transaction_type SET tenant_id=?').run(id(999));assert.equal((await f.run()).transactions.length,0);}finally{f.db.close();}
});
test('object view and module access remain mandatory, even with transaction capture grants',async()=>{
 const f=fixture();try{f.user();f.grant();f.db.exec("DELETE FROM erp_role_permission WHERE resource_kind='subledger_account'");await assert.rejects(f.run(),e=>e.status===403);f.grant({kind:'subledger_account',status:'view'});f.db.exec('DELETE FROM erp_subledger_account_type_module');await assert.rejects(f.run(),e=>e.status===403);}finally{f.db.close();}
});
test('endpoint rejects writes and unauthenticated calls',async()=>{
 const send=(status,body)=>({status,body});assert.equal((await endpoint({req:{method:'POST'},send})).status,405);assert.equal((await endpoint({req:{method:'GET'},send,tenantSession:async()=>({status:401,body:{error:'Sign in'}})})).status,401);
});
test('capture prefills only the chosen line, inserts optional/repeatable lines, and preserves fixed defaults',()=>{
 const object={object_id:'selected',object_type_id:'asset'};
 const definitions=[{transaction_line_definition_id:'a',line_order:1,subledger_requirement:'mandatory',subledger_account_type_id:'asset',object_requirements:[{accounting_object_type_id:'asset',value_behaviour:'defaulted',accounting_object_id:'default'}]},{transaction_line_definition_id:'b',line_order:2,subledger_requirement:'mandatory',subledger_account_type_id:'asset',object_requirements:[{accounting_object_type_id:'asset',value_behaviour:'captured'}]}];
 const original=[{transaction_line_definition_id:'a',subledger_account_id:'other',accounting_objects:[{accounting_object_type_id:'asset',accounting_object_id:'default'},{accounting_object_type_id:'region',accounting_object_id:'fixed-region'}],accounting_dimensions:[{accounting_dimension_id:'dimension'}]}];
 const createLine=d=>({transaction_line_definition_id:d.transaction_line_definition_id,accounting_objects:[],accounting_dimensions:[],debit_amount:'',credit_amount:''});
 const sub=prepareLines({definitions,lines:original,kind:'subledger_account',object,definitionId:'b',createLine});assert.equal(sub[0].subledger_account_id,'other');assert.equal(sub[1].subledger_account_id,'selected');assert.equal(sub.length,2);assert.equal(sub[1].debit_amount,'');assert.equal(original.length,1);
 const accounting=prepareLines({definitions,lines:original,kind:'accounting_object',object,definitionId:'a',createLine});assert.deepEqual(accounting[0].accounting_objects,[{accounting_object_type_id:'region',accounting_object_id:'fixed-region'},{accounting_object_type_id:'asset',accounting_object_id:'selected'}]);assert.equal(original[0].accounting_objects[0].accounting_object_id,'default');assert.deepEqual(accounting[0].accounting_dimensions,original[0].accounting_dimensions);
 definitions[0].object_requirements[0].value_behaviour='fixed';assert.throws(()=>prepareLines({definitions,lines:original,kind:'accounting_object',object,definitionId:'a',createLine}),/no longer accepts/);assert.throws(()=>prepareLines({definitions,lines:original,kind:'accounting_dimension',object,definitionId:'a',createLine}),/no longer accepts/);
});
test('application capture uses shared definitions, source division and only the selected allocation',async()=>{
 const source=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
 for(const kind of ['subledger_account','accounting_object']){
  const elements={'journal-division':{value:'old'}};
  const definitions=[{transaction_type_id:'tx',transaction_line_definition_id:'required',line_order:1,occurrence:'required',gl_account_id:'expense',subledger_requirement:'mandatory',subledger_account_type_id:'asset',debit_credit:'debit',object_requirements:[],dimension_requirements:[{accounting_dimension_type_id:'region',accounting_dimension_id:'fixed'}]},
   {transaction_type_id:'tx',transaction_line_definition_id:'optional',line_order:2,occurrence:'optional',gl_account_id:'asset-gl',subledger_requirement:'mandatory',subledger_account_type_id:'asset',debit_credit:'credit',object_requirements:[{accounting_object_type_id:'project',value_behaviour:'captured'}]}];
  const calls=[],scope={state:{orgId:'org',divisionId:'division',lineDefinitions:definitions},selectedTransactionTypeId:'',window:{erpObjectActions:{prepareLines}},$:(id)=>elements[id],
   ensureTransactionSetup:async force=>calls.push(['reload',force]),openTransactionType:async id=>{scope.selectedTransactionTypeId=id;calls.push(['type',id]);},openNewJournal:options=>{elements['journal-division'].value=options.sourceDivisionId;calls.push(['new',options]);},renderJournalLines:lines=>scope.lines=lines};
  vm.createContext(scope);
  vm.runInContext(source.slice(source.indexOf('  async function openObjectActionTransaction('),source.indexOf('  async function ensureReportDefinitions(')),scope);
  vm.runInContext(source.slice(source.indexOf('  function defaultJournalLineForDefinition('),source.indexOf('  function renderJournalLines(')),scope);
  await scope.openObjectActionTransaction({organisationId:'org',workspaceDivisionId:'division',sourceDivisionId:'source',kind,object:{object_type_id:kind==='subledger_account'?'asset':'project',object_id:'selected'},transaction:{transaction_type_id:'tx'},definitionId:'optional'});
  assert.deepEqual(calls[0],['reload',true]);assert.equal(scope.lines.length,2);assert.equal(scope.lines[0].gl_account_id,'expense');assert.equal(scope.lines[0].accounting_dimensions[0].accounting_dimension_id,'fixed');assert.equal(scope.lines[1].division_id,'source');assert.equal(scope.lines[1].gl_account_id,'asset-gl');assert.equal(scope.lines[1].credit_amount,'');
  if(kind==='subledger_account'){assert.equal(scope.lines[0].subledger_account_id,'');assert.equal(scope.lines[1].subledger_account_id,'selected');}else assert.equal(scope.lines[1].accounting_objects[0].accounting_object_id,'selected');
  calls.length=0;scope.state.orgId='another';await scope.openObjectActionTransaction({organisationId:'org',workspaceDivisionId:'division'});assert.equal(calls.length,0);
 }
});
