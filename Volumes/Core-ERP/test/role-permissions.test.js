"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite');
const modules=require('../api/_shared/erp/permission-modules');
const {hasResourcePermission}=require('../api/_shared/erp/access');

function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE erp_role(role_id,tenant_id,organisation_id,role_name,is_active);
 CREATE TABLE erp_user_role(role_id,tenant_id,organisation_id,email,valid_from,valid_to);
 CREATE TABLE erp_role_permission(role_id,tenant_id,organisation_id,division_id,resource_kind,resource_code,workflow_status,valid_from,valid_to,applies_to_children);
 CREATE TABLE erp_division(division_id,parent_division_id,tenant_id,organisation_id);
 INSERT INTO erp_division VALUES('root',NULL,'tenant','org'),('child','root','tenant','org');
 CREATE TABLE erp_module(module_id,tenant_id,organisation_id,module_name,sort_order,is_active);
 INSERT INTO erp_module VALUES('sales','tenant','org','Sales',1,true),('finance','tenant','org','Finance',2,true),('reports','tenant','org','Reports',3,true),('private','tenant','org','Private',4,true);
 INSERT INTO erp_role VALUES('objects','tenant','org','Objects',true),('transactions','tenant','org','Transactions',true),('reports','tenant','org','Reports',true);
 INSERT INTO erp_user_role SELECT role_id,tenant_id,organisation_id,'user@example.test','2000-01-01',NULL FROM erp_role;`);
 for(const [table,id] of [['erp_subledger_account_type','subledger_account_type_id'],['erp_accounting_object_type','accounting_object_type_id'],['erp_accounting_dimension_type','accounting_dimension_type_id'],['erp_transaction_type','transaction_type_id'],['erp_report','report_id']])db.exec(`CREATE TABLE ${table}(${id},tenant_id,organisation_id,is_active);CREATE TABLE ${table}_module(${id},module_id);`);
 db.exec(`INSERT INTO erp_accounting_object_type VALUES('customer','tenant','org',true),('private-type','tenant','org',true);
 INSERT INTO erp_accounting_object_type_module VALUES('customer','sales'),('private-type','private');
 INSERT INTO erp_transaction_type VALUES('invoice','tenant','org',true);
 INSERT INTO erp_transaction_type_module VALUES('invoice','finance'),('invoice','sales');
 INSERT INTO erp_report VALUES('trial','tenant','org',true);INSERT INTO erp_report_module VALUES('trial','reports');
 INSERT INTO erp_role_permission VALUES
 ('objects','tenant','org','root','accounting_object','customer','view','2000-01-01',NULL,true),
 ('transactions','tenant','org','root','transaction','invoice','draft','2000-01-01',NULL,true),
 ('reports','tenant','org','root','report','trial','view','2000-01-01',NULL,true);`);
 const access={tenantId:'tenant',auth:{email:'USER@example.test'}};
 const broker=async(_profile,_action,query)=>{
  const stmt=db.prepare(query.text.replace(/::(?:text|uuid|boolean)/g,''));
  const params=Object.fromEntries(query.values.map((value,index)=>['$'+(index+1),typeof value==='boolean'?Number(value):value]));
  const rows=stmt.all(params);return {rows,rowCount:rows.length};
 };
 const list=async()=> (await broker(null,null,{text:modules.accessibleModulesSql()+' ORDER BY module.sort_order',values:['tenant','org',access.auth.email]})).rows.map(row=>row.module_id);
 const permission=options=>hasResourcePermission({broker},access,{organisationId:'org',divisionId:'root',resourceKind:'accounting_object',resourceCode:'customer',workflowStatus:'view',...options});
 require('./fixtures/user-access').grantUserAccess(db,{tenantId:'tenant',organisationId:'org',email:access.auth.email});
 return {db,broker,access,list,permission};
}

test('module navigation combines object, transaction and report grants across roles without explicit module assignments',async()=>{
 const f=fixture();try{
  assert.deepEqual(await f.list(),['sales','finance','reports']);
  assert.equal(await f.permission(),true);
  assert.equal(await f.permission({resourceKind:'transaction',resourceCode:'invoice',workflowStatus:'draft'}),true);
  assert.equal(await f.permission({resourceCode:'private-type'}),false);
  assert.equal(await f.permission({resourceKind:'transaction',resourceCode:'invoice',workflowStatus:'approved'}),false);
  assert.equal(await f.permission({divisionId:'child'}),true);
  f.db.exec("UPDATE erp_role_permission SET applies_to_children=false");assert.equal(await f.permission({divisionId:'child'}),false);
  f.db.exec("UPDATE erp_role SET is_active=false WHERE role_id='transactions'");assert.deepEqual(await f.list(),['sales','reports']);
  f.db.exec("UPDATE erp_user_role SET valid_to='2001-01-01' WHERE role_id='objects'");assert.deepEqual(await f.list(),['reports']);
  f.db.exec("UPDATE erp_role_permission SET valid_from='2999-01-01' WHERE role_id='reports'");assert.deepEqual(await f.list(),[]);
 }finally{f.db.close();}
});

test('derived navigation honours wildcards, active definitions, valid grants and tenant/organisation ownership',async()=>{
 const f=fixture();try{
  f.db.exec("UPDATE erp_role_permission SET resource_code='*' WHERE role_id='objects'");assert.deepEqual(await f.list(),['sales','finance','reports','private']);
  for(const [table,where] of [['erp_module',"module_id='private'"],['erp_accounting_object_type',"accounting_object_type_id='private-type'"]]){
   f.db.exec(`UPDATE ${table} SET is_active=false WHERE ${where}`);assert.deepEqual(await f.list(),['sales','finance','reports']);f.db.exec(`UPDATE ${table} SET is_active=true WHERE ${where}`);
  }
  for(const table of ['erp_role','erp_user_role','erp_role_permission','erp_accounting_object_type','erp_transaction_type','erp_report','erp_module']){
   for(const column of ['tenant_id','organisation_id']){
    const original=column==='tenant_id'?'tenant':'org';f.db.exec(`UPDATE ${table} SET ${column}='foreign'`);assert.deepEqual(await f.list(),({erp_accounting_object_type:['sales','finance','reports'],erp_transaction_type:['sales','reports','private'],erp_report:['sales','finance','private']})[table]||[],`${table}.${column} boundaries`);f.db.exec(`UPDATE ${table} SET ${column}='${original}'`);
   }
  }
  f.db.exec("UPDATE erp_role_permission SET valid_to='2001-01-01'");assert.deepEqual(await f.list(),[]);
 }finally{f.db.close();}
});

test('navigation endpoint retains separate role groups while combining module access',async()=>{
 const f=fixture();try{
  const sandbox={module:{exports:{}},require:name=>name.endsWith('/context')?{withContext:handler=>handler}:name.endsWith('permission-modules')?modules:{authTenant:async()=>f.access,isAdministrator:()=>false}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../api/navigation/menu'),'utf8'),sandbox);
  const result=await sandbox.module.exports({query:{organisation_id:'org'},broker:f.broker,send:(status,body)=>({status,body})});
  assert.deepEqual(Array.from(result.modules,row=>row.module_id),['sales','finance','reports']);
  assert.deepEqual(Array.from(result.roles.find(row=>row.role_id==='transactions').module_ids).sort(),['finance','sales']);
  assert.equal(result.permissions.length,3);
 }finally{f.db.close();}
});

test('non-administrator roles save permissions and users without a module selection',async()=>{
 const queries=[];const access={tenantId:'tenant',auth:{email:'admin@example.test'}};
 const sandbox={module:{exports:{}},require:name=>name.startsWith('node:')?require(name):name.endsWith('/context')?{withContext:handler=>handler}:name.endsWith('transaction-plan')?require('../api/_shared/erp/transaction-plan'):name.endsWith('user-assignments')?require('../api/_shared/erp/user-assignments'):{authTenant:async()=>access,requireAdmin:()=>null,clean:(value,fallback='')=>String(value??'').trim()||fallback,nullable:value=>value||null,bool:value=>!!value}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../api/permissions/save'),'utf8'),sandbox);
 const result=await sandbox.module.exports({req:{method:'POST'},body:{organisation_id:'org',role_name:'Capture',is_admin:false,master_permissions:[{resource_kind:'accounting_object',resource_code:'customer',division_id:'root',workflow_status:'view'}],transaction_permissions:[{transaction_type_id:'invoice',division_id:'root',workflow_status:'draft'}],role_users:[{email:'User@example.test'}]},send:(status,body)=>({status,body}),broker:async(profile,action,query)=>{queries.push({action,...query});if(action==='transaction')return {results:query.statements.map(()=>({rowCount:1,rows:[]}))};return {rows:query.text.includes('user_account')?[{email:'user@example.test',is_current:true,__erp_snapshot:'[]'}]:[],rowCount:0};}});
 assert.equal(result.ok,true);const statements=queries.find(query=>query.action==='transaction').statements;
 assert.equal(statements.filter(query=>query.text.startsWith('INSERT INTO erp_role_permission')).length,2);
 assert.equal(statements.find(query=>query.text.startsWith('INSERT INTO erp_user_role')).values[3],'user@example.test');
 assert.ok(queries.every(query=>!JSON.stringify(query).includes('erp_role_module')));
});


test('existing and new role editors open all remaining tabs without module controls or a module lookup',async()=>{
 const app=fs.readFileSync(require.resolve('../public/app.js'),'utf8');const elements={};
 for(const id of ['role-form','role-id','role-name','role-description','role-admin','role-active',...['users','master','transaction','reports'].map(tab=>'role-tab-'+tab)])elements[id]={hidden:false,value:'',checked:false};
 elements['role-form'].reset=()=>{};
 const scope={state:{rolePermissions:[],roleUsers:[]},$:id=>{assert.ok(elements[id],`unexpected control ${id}`);return elements[id];},document:{querySelectorAll:()=>[]},renderMasterPermissionTree:()=>{},renderPermissionLines:()=>{},renderRoleUserLines:()=>{}};
 vm.createContext(scope);vm.runInContext(app.slice(app.indexOf('  async function selectRole('),app.indexOf('  function renderMasterPermissionTree(')),scope);
 await scope.selectRole({role_id:'role',role_name:'Capture',is_active:true});assert.equal(elements['role-name'].value,'Capture');
 for(const name of ['users','master','transaction','reports']){scope.showRoleTab(name);for(const tab of ['users','master','transaction','reports'])assert.equal(elements['role-tab-'+tab].hidden,tab!==name);}
 scope.openNewRole();assert.equal(elements['role-id'].value,'');assert.equal(elements['role-active'].checked,true);assert.equal(elements['role-tab-users'].hidden,false);
});


test('accounting object search enforces combined object and division grants without module gates',async()=>{
 const f=fixture();try{
  f.db.exec(`ALTER TABLE erp_accounting_object_type ADD COLUMN type_code;ALTER TABLE erp_accounting_object_type ADD COLUMN type_name;
  UPDATE erp_accounting_object_type SET type_code=accounting_object_type_id,type_name=accounting_object_type_id;
  ALTER TABLE erp_division ADD COLUMN division_name;UPDATE erp_division SET division_name=division_id;
  CREATE TABLE erp_accounting_object(accounting_object_id,object_code,object_name,accounting_object_type_id,owner_division_id,tenant_id,organisation_id,workflow_status);
  INSERT INTO erp_accounting_object VALUES('allowed','A','Allowed','customer','root','tenant','org','active'),('child','C','Child','customer','child','tenant','org','active'),('hidden','H','Hidden','private-type','root','tenant','org','active'),('foreign','F','Foreign','customer','root','foreign','org','active');`);
  f.db.function('concat_ws',(...args)=>args.slice(1).join(args[0]));
  const sandbox={module:{exports:{}},require:name=>name.endsWith('/context')?{withContext:handler=>handler}:name.endsWith('workflow-configuration')?{workflowUseSql:()=> 'true'}:name.endsWith('/erp')?{authTenant:async()=>f.access,clean:value=>String(value||''),nullable:value=>value||null,isAdministrator:()=>false}:require('../api/_shared/erp/'+name.split('/').at(-1))};
  vm.runInNewContext(fs.readFileSync(require.resolve('../api/accounting-objects/search'),'utf8'),sandbox);
  const run=async()=> (await sandbox.module.exports({query:{organisation_id:'org'},broker:f.broker})).records.map(row=>row.accounting_object_id);
  assert.deepEqual(await run(),['allowed','child']);
  f.db.exec('UPDATE erp_role_permission SET applies_to_children=false');assert.deepEqual(await run(),['allowed']);
  f.db.exec("UPDATE erp_user_role SET valid_to='2001-01-01' WHERE role_id='objects'");assert.deepEqual(await run(),[]);
 }finally{f.db.close();}
});
