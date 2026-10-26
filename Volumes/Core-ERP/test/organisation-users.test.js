'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite');
const {userDivisionAccessSql}=require('../api/_shared/erp/user-access');
const {authTenant}=require('../api/_shared/erp/auth');
const {hasResourcePermission}=require('../api/_shared/erp/access');
const {dateRange,validateRoleUsers}=require('../api/_shared/erp/user-assignments');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;

function database(){
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE erp_organisation_user(user_id,tenant_id,organisation_id,email,known_name,full_name,title,description,is_enabled,valid_from,valid_to);
    CREATE TABLE erp_user_division(user_id,tenant_id,organisation_id,division_id,valid_from,valid_to);
    CREATE TABLE erp_division(division_id,parent_division_id,tenant_id,organisation_id,workflow_status);
    CREATE TABLE erp_user_role(tenant_id,organisation_id,role_id,email,valid_from,valid_to);
    CREATE TABLE erp_role(role_id,tenant_id,organisation_id,is_admin,is_active);
    CREATE TABLE erp_role_permission(role_id,division_id,resource_kind,resource_code,workflow_status,valid_from,valid_to,applies_to_children);
    INSERT INTO erp_organisation_user VALUES('u','tenant','org','user@example.test','User','Example User','Ms','',true,'2020-01-01',NULL);
    INSERT INTO erp_division VALUES('parent',NULL,'tenant','org','approved'),('child','parent','tenant','org','approved'),('other',NULL,'tenant','elsewhere','approved');
    INSERT INTO erp_user_division VALUES('u','tenant','org','parent','2020-01-01',NULL);
    INSERT INTO erp_role VALUES('admin','tenant','org',true,true),('capture','tenant','org',false,true);
    INSERT INTO erp_user_role VALUES('tenant','org','admin','user@example.test','2020-01-01',NULL),('tenant','org','capture','user@example.test','2020-01-01',NULL);
    INSERT INTO erp_role_permission VALUES('capture','parent','accounting_object','type','view','2020-01-01',NULL,true);`);
  const broker=async(_profile,_action,{text,values=[]})=>{
    const stmt=db.prepare(text.replace(/::(?:uuid|text|integer|boolean)/g,''));stmt.setAllowUnknownNamedParameters(true);
    const rows=stmt.all(Object.fromEntries(values.map((v,i)=>['$'+(i+1),typeof v==='boolean'?Number(v):v])));return {rows,rowCount:rows.length};
  };
  const access={tenantId:'tenant',auth:{email:'USER@example.test'},setupAdministrator:false};
  return {db,broker,access,allowed:async division=>(await broker(null,null,{text:`SELECT 1 WHERE ${userDivisionAccessSql({tenant:'$1',organisation:'$2',email:'$3',division:'$4'})}`,values:['tenant','org',access.auth.email,division]})).rowCount===1};
}

test('division assignments are exact and independent of role-permission inheritance',async()=>{
  const f=database();try{
    const check=divisionId=>hasResourcePermission({broker:f.broker},f.access,{organisationId:'org',divisionId,resourceKind:'accounting_object',resourceCode:'type',workflowStatus:'view'});
    assert.equal(await check('parent'),true);assert.equal(await check('child'),false);
    f.db.exec("INSERT INTO erp_user_division VALUES('u','tenant','org','child',NULL,NULL)");assert.equal(await check('child'),true);
    f.db.exec("DELETE FROM erp_role_permission");assert.equal(await check('child'),false,'division membership alone never grants an object permission');
    assert.equal(await f.allowed('other'),false);
  }finally{f.db.close();}
});

test('organisation status, organisation dates and assignment dates all constrain access, including administrators',async()=>{
  const f=database();try{
    for(const change of ["UPDATE erp_organisation_user SET is_enabled=false","UPDATE erp_organisation_user SET valid_from='2999-01-01'","UPDATE erp_organisation_user SET valid_to='2001-01-01'","UPDATE erp_user_division SET valid_from='2999-01-01'","UPDATE erp_user_division SET valid_to='2001-01-01'"]){
      assert.equal(await f.allowed('parent'),true);f.db.exec(change);assert.equal(await f.allowed('parent'),false);
      assert.equal(await hasResourcePermission({broker:f.broker},{...f.access,setupAdministrator:true},{organisationId:'org',divisionId:'parent',resourceKind:'accounting_object',resourceCode:'type',workflowStatus:'view'}),false);
      f.db.exec("UPDATE erp_organisation_user SET is_enabled=true,valid_from=NULL,valid_to=NULL;UPDATE erp_user_division SET valid_from=NULL,valid_to=NULL");
    }
    for(const table of ['erp_organisation_user','erp_user_division'])for(const column of ['tenant_id','organisation_id']){
      f.db.exec(`UPDATE ${table} SET ${column}='foreign'`);assert.equal(await f.allowed('parent'),false);f.db.exec(`UPDATE ${table} SET ${column}='${column==='tenant_id'?'tenant':'org'}'`);
    }
  }finally{f.db.close();}
});

test('organisation authentication invalidates setup administrators with disabled or expired user access',async()=>{
  const f=database();try{
    const ctx={query:{organisation_id:'org'},broker:f.broker,tenantSession:async()=>({tenantId:'tenant',auth:f.access.auth})};
    assert.equal((await authTenant(ctx)).setupAdministrator,true);
    f.db.exec('UPDATE erp_organisation_user SET is_enabled=false');assert.equal((await authTenant(ctx)).status,403);
    f.db.exec("UPDATE erp_organisation_user SET is_enabled=true,valid_to='2001-01-01'");assert.equal((await authTenant(ctx)).status,403);
  }finally{f.db.close();}
});

test('role selection validates active organisation users while retaining existing inactive assignments',async()=>{
  const rows=[{email:'a@example.test',is_current:true,already_assigned:false},{email:'b@example.test',is_current:false,already_assigned:true},{email:'c@example.test',is_current:false,already_assigned:false}];
  const client={query:async()=>({rows})},options={tenantId:'tenant',organisationId:'org',roleId:id(1)};
  assert.equal((await validateRoleUsers(client,{...options,rows:[{email:'A@example.test'}]}))[0].email,'a@example.test');
  await validateRoleUsers(client,{...options,rows:[{email:'b@example.test'}]});
  for(const email of ['c@example.test','foreign@example.test'])await assert.rejects(validateRoleUsers(client,{...options,rows:[{email}]}),/active organisation user/);
  await assert.rejects(validateRoleUsers(client,{...options,rows:[{email:'a@example.test'},{email:'A@example.test'}]}),/once/);
  assert.throws(()=>dateRange({valid_from:'2026-12-01',valid_to:'2026-01-01'}),/Valid to/);
  assert.throws(()=>dateRange({valid_from:'2026-02-30'}),/valid YYYY/);
});

function saveFixture({admin=true,duplicate=false,foreignRole=false,foreignDivision=false,existing=false}={}){
  const queries=[],writes=[];const access={tenantId:id(1),auth:{email:'admin@example.test'},setupAdministrator:admin};
  const previous={user_id:id(3),email:'old@example.test'};
  const broker=async(profile,action,q)=>{
    queries.push({action,...q});
    if(action==='transaction'){writes.push(...q.statements);return {results:q.statements.map(()=>({rows:[],rowCount:1}))};}
    let rows=[];
    if(q.text.includes('FROM erp_organisation WHERE'))rows=[{organisation_id:id(2)}];
    else if(q.text.includes('FROM erp_organisation_user')&&q.text.includes('email=$3'))rows=duplicate?[{user_id:id(9)}]:[];
    else if(q.text.includes('FROM erp_organisation_user'))rows=existing?[previous]:[];
    else if(q.text.includes('FROM erp_role WHERE'))rows=foreignRole?[]:[{role_id:id(4),is_active:true}];
    else if(q.text.includes('FROM erp_division'))rows=foreignDivision?[]:[{division_id:id(5)}];
    return {rows:rows.map(row=>({...row,__erp_snapshot:JSON.stringify(rows)})),rowCount:rows.length};
  };
  const deps={authTenant:async()=>access,requireAdmin:a=>a.setupAdministrator?null:{status:403,body:{error:'Administrator access required'}}};
  const context={module:{exports:{}},require:name=>name.startsWith('node:')?require(name):name.endsWith('/context')?{withContext:fn=>fn}:name.endsWith('/erp')?deps:require('../api/_shared/erp/'+name.split('/').at(-1))};
  vm.runInNewContext(fs.readFileSync(require.resolve('../api/users/save'),'utf8'),context);
  const body={organisation_id:id(2),email:'NEW@example.test',known_name:'New',is_enabled:true,valid_from:'2026-01-01',roles:[{role_id:id(4),valid_from:'2026-01-01'}],divisions:[{division_id:id(5),valid_from:'2026-01-01'}],...(existing?{user_id:id(3)}:{})};
  const run=(changes={})=>context.module.exports({req:{method:'POST'},body:{...body,...changes},broker,send:(status,body)=>({status,body})});
  return {run,queries,writes};
}

test('user save accepts arbitrary email accounts and writes identity, roles and divisions atomically',async()=>{
  const f=saveFixture();assert.equal((await f.run()).ok,true);
  const user=f.writes.find(q=>q.text.startsWith('INSERT INTO erp_organisation_user'));
  assert.equal(user.values[3],'new@example.test');
  assert.equal(f.writes.filter(q=>q.text.startsWith('INSERT INTO erp_user_role')).length,1);
  assert.equal(f.writes.filter(q=>q.text.startsWith('INSERT INTO erp_user_division')).length,1);
  assert.equal(f.queries.filter(q=>q.action==='transaction').length,1);
  assert.ok(f.writes[0].text.startsWith('LOCK TABLE'));
  assert.ok(f.writes.some(q=>q.expectedRowCount===1));
  assert.ok(f.queries.every(q=>!q.text?.includes('core_saas')));
});

test('renaming an email updates the same role-assignment source and invalidation retains the user record',async()=>{
  const f=saveFixture({existing:true});assert.equal((await f.run({is_enabled:false})).ok,true);
  assert.equal(f.writes.find(q=>q.text.startsWith('INSERT INTO erp_organisation_user')).values[8],false);
  assert.equal(f.writes.find(q=>q.text.startsWith('DELETE FROM erp_user_role')).values[2],'old@example.test');
  assert.equal(f.writes.find(q=>q.text.startsWith('INSERT INTO erp_user_role')).values[3],'new@example.test');
  assert.ok(!f.writes.some(q=>q.text.startsWith('DELETE FROM erp_organisation_user')));
});

test('user writes reject non-administrators, duplicate identities, foreign assignments and bad dates before mutation',async()=>{
  for(const [options,status] of [[{admin:false},403],[{duplicate:true},409],[{foreignRole:true},400],[{foreignDivision:true},400]]){
    const f=saveFixture(options);assert.equal((await f.run()).status,status);assert.equal(f.writes.length,0);
  }
  for(const changes of [{email:'invalid'},{valid_from:'2027-01-01',valid_to:'2026-01-01'},{roles:[{role_id:id(4)},{role_id:id(4)}]}]){const f=saveFixture();assert.equal((await f.run(changes)).status,400);assert.equal(f.writes.length,0);}
});

test('grid counts only current role and direct division assignments, retaining inactive user rows',async()=>{
  const f=database();try{
    f.db.exec("INSERT INTO erp_user_role VALUES('tenant','org','capture','user@example.test','2020-01-01','2001-01-01');INSERT INTO erp_user_division VALUES('u','tenant','org','child','2999-01-01',NULL)");
    const sandbox={module:{exports:{}},require:name=>name.endsWith('/context')?{withContext:fn=>fn}:{authTenant:async()=>f.access,requireAdmin:()=>null}};
    vm.runInNewContext(fs.readFileSync(require.resolve('../api/users/list'),'utf8'),sandbox);
    const run=()=>sandbox.module.exports({req:{method:'GET'},query:{organisation_id:'org'},broker:f.broker});
    let result=await run();assert.equal(result.users[0].active_roles,2);assert.equal(result.users[0].active_divisions,1);
    f.db.exec('UPDATE erp_organisation_user SET is_enabled=false');result=await run();assert.equal(result.users.length,1);assert.equal(result.users[0].is_current,0);
  }finally{f.db.close();}
});

test('schema upgrade authenticates existing setup roles only while the new user table is absent',async()=>{
  const {isSetupAdministrator,canBootstrapSetup}=require('../api/_shared/erp/access');
  let userTable=false;
  const ctx={broker:async(_p,_a,q)=>{
    if(q.text.includes("to_regclass('erp_role')"))return {rows:[{role_table:'erp_role',user_role_table:'erp_user_role'}]};
    if(q.text.includes('user_table'))return {rows:[{user_table:userTable?'erp_organisation_user':null}]};
    return {rows:[],rowCount:q.text.includes('access_user')?0:1};
  }};
  const options={tenantId:'tenant',organisationId:'org',email:'admin@example.test',allowUserSchemaUpgrade:true};
  assert.equal(await isSetupAdministrator(ctx,options),true);
  userTable=true;assert.equal(await isSetupAdministrator(ctx,options),false,'an existing disabled account cannot bypass organisation validity');
  assert.equal(await canBootstrapSetup(ctx,'tenant'),false,'invalidating administrators never reopens initial setup claiming');
});

test('transaction lists require role permission and direct access to every transaction division',async()=>{
  const f=database();try{
    f.db.exec(`ALTER TABLE erp_division ADD COLUMN division_name;UPDATE erp_division SET division_name=division_id;
      CREATE TABLE erp_transaction_type(transaction_type_id,type_name);
      CREATE TABLE erp_fiscal_period(fiscal_period_id,period_code);
      CREATE TABLE erp_journal(journal_id,tenant_id,organisation_id,transaction_type_id,fiscal_period_id,source_division_id,workflow_status,journal_date,created_at);
      CREATE TABLE erp_journal_line(tenant_id,organisation_id,journal_id,division_id,debit_amount,credit_amount);
      INSERT INTO erp_transaction_type VALUES('type','Type');INSERT INTO erp_fiscal_period VALUES('period','2026');
      INSERT INTO erp_journal VALUES('visible','tenant','org','type','period','parent','draft','2026-01-01','2026-01-01'),('cross-division','tenant','org','type','period','parent','draft','2026-01-01','2026-01-01');
      INSERT INTO erp_journal_line VALUES('tenant','org','visible','parent',10,0),('tenant','org','cross-division','child',20,0);
      INSERT INTO erp_role_permission VALUES('capture','parent','transaction','type','view','2020-01-01',NULL,true);`);
    const sandbox={module:{exports:{}},require:name=>name.endsWith('/context')?{withContext:fn=>fn}:name.endsWith('/erp')?{authTenant:async()=>f.access}:name.includes('workflow-presentation')?{decorateWorkflowRecords:async()=>{}}:require('../api/_shared/erp/'+name.split('/').at(-1))};
    vm.runInNewContext(fs.readFileSync(require.resolve('../api/journals/list'),'utf8'),sandbox);
    const run=async()=>Array.from((await sandbox.module.exports({query:{organisation_id:'org'},broker:f.broker})).journals,row=>row.journal_id).sort();
    assert.deepEqual(await run(),['visible']);
    f.db.exec("INSERT INTO erp_user_division VALUES('u','tenant','org','child',NULL,NULL)");assert.deepEqual(await run(),['cross-division','visible']);
    f.db.exec("UPDATE erp_role_permission SET applies_to_children=false WHERE resource_kind='transaction'");assert.deepEqual(await run(),['visible']);
    f.db.exec("UPDATE erp_role_permission SET valid_to='2001-01-01'");assert.deepEqual(await run(),[]);
  }finally{f.db.close();}
});
