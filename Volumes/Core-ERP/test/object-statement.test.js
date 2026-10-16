'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {runStatement,validate,statementSql}=require('../api/_shared/erp/object-statement');
const endpoint=require('../api/reports/object-statement');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;

test('all statement classes retain ten SQL parameters and explicitly type the child flag',()=>{
 for(const kind of ['subledger_account','accounting_object','accounting_dimension']){
 const sql=statementSql(kind);
 assert.deepEqual([...new Set([...sql.matchAll(/\$(\d+)/g)].map(match=>Number(match[1])))].sort((a,b)=>a-b),[1,2,3,4,5,6,7,8,9,10],kind);
 assert.match(sql,/\$6::boolean\b/,kind);
 }
});
test('statement endpoint requires GET and an authenticated tenant session',async()=>{
 const send=(status,body)=>({status,body});
 assert.equal((await endpoint({req:{method:'POST'},send})).status,405);
 assert.equal((await endpoint({req:{method:'GET'},send,tenantSession:async()=>({status:401,body:{error:'Sign in'}})})).status,401);
});
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`
 CREATE TABLE erp_organisation(tenant_id,organisation_id,organisation_name,base_currency_code);
 CREATE TABLE erp_division(tenant_id,organisation_id,division_id,parent_division_id);
 CREATE TABLE erp_accounting_object(tenant_id,organisation_id,accounting_object_id,accounting_object_type_id,parent_accounting_object_id,owner_division_id,object_code,object_name);
 CREATE TABLE erp_accounting_object_type(tenant_id,organisation_id,accounting_object_type_id,type_name);
 CREATE TABLE erp_subledger_account(tenant_id,organisation_id,subledger_account_id,subledger_account_type_id,owner_division_id,account_code,account_name);
 CREATE TABLE erp_subledger_account_type(tenant_id,organisation_id,subledger_account_type_id,type_name);
 CREATE TABLE erp_accounting_dimension(tenant_id,organisation_id,accounting_dimension_id,accounting_dimension_type_id,owner_division_id,dimension_code,dimension_name);
 CREATE TABLE erp_accounting_dimension_type(tenant_id,organisation_id,accounting_dimension_type_id,type_name);
 CREATE TABLE erp_journal(tenant_id,organisation_id,journal_id,journal_date,journal_number,description,created_at,posted_at,workflow_status,transaction_type_id);
 CREATE TABLE erp_journal_line(tenant_id,organisation_id,journal_id,journal_line_id,line_number,division_id,gl_account_id,subledger_account_id,description,debit_amount,credit_amount);
 CREATE TABLE erp_gl_account(tenant_id,organisation_id,gl_account_id,account_code,account_name);
 CREATE TABLE erp_journal_line_accounting_object(tenant_id,organisation_id,journal_line_id,accounting_object_id);
 CREATE TABLE erp_journal_line_accounting_dimension(tenant_id,organisation_id,journal_line_id,accounting_dimension_id);
 CREATE TABLE erp_user_role(tenant_id,organisation_id,role_id,email,valid_from,valid_to);
 CREATE TABLE erp_role(role_id,is_active);
 CREATE TABLE erp_role_permission(role_id,division_id,resource_kind,resource_code,workflow_status,valid_from,valid_to,applies_to_children);
 CREATE TABLE erp_role_module(role_id,module_id);
 CREATE TABLE erp_accounting_object_type_module(accounting_object_type_id,module_id);
 CREATE TABLE erp_accounting_dimension_type_module(accounting_dimension_type_id,module_id);
 CREATE TABLE erp_subledger_account_type_module(subledger_account_type_id,module_id);
 `);
 const tenant=id(1),org=id(2),division=id(3),type=id(4),root=id(5),child=id(6),grandchild=id(7),gl=id(8),otherGl=id(9);
 db.prepare('INSERT INTO erp_organisation VALUES(?,?,?,?)').run(tenant,org,'Example','ZAR');db.prepare('INSERT INTO erp_division VALUES(?,?,?,NULL)').run(tenant,org,division);
 db.prepare('INSERT INTO erp_accounting_object_type VALUES(?,?,?,?)').run(tenant,org,type,'Project');
 for(const [object,parent] of [[root,null],[child,root],[grandchild,child]])db.prepare('INSERT INTO erp_accounting_object VALUES(?,?,?,?,?,?,?,?)').run(tenant,org,object,type,parent,division,object,object);
 for(const [table,col] of [['erp_subledger_account_type','Customer'],['erp_accounting_dimension_type','Region']])db.prepare(`INSERT INTO ${table} VALUES(?,?,?,?)`).run(tenant,org,type,col);
 db.prepare('INSERT INTO erp_subledger_account VALUES(?,?,?,?,?,?,?)').run(tenant,org,root,type,division,'C001','Customer');db.prepare('INSERT INTO erp_accounting_dimension VALUES(?,?,?,?,?,?,?)').run(tenant,org,root,type,division,'R001','Region');
 for(const g of [gl,otherGl])db.prepare('INSERT INTO erp_gl_account VALUES(?,?,?,?,?)').run(tenant,org,g,g,'GL');
 let serial=20;
 function post(date,debit,credit,object=root,{posted=true,account=gl,orgId=org,tenantId=tenant,status='approved',extraObject=null}={}){
 const journal=id(serial++),line=id(serial++);db.prepare('INSERT INTO erp_journal VALUES(?,?,?,?,?,?,?,?,?,?)').run(tenantId,orgId,journal,date,journal,'Journal',date+'T10:00:00',posted?date:null,status,type);
 db.prepare('INSERT INTO erp_journal_line VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(tenantId,orgId,journal,line,1,division,account,root,'Line',debit,credit);
 db.prepare('INSERT INTO erp_journal_line_accounting_object VALUES(?,?,?,?)').run(tenantId,orgId,line,object);if(extraObject)db.prepare('INSERT INTO erp_journal_line_accounting_object VALUES(?,?,?,?)').run(tenantId,orgId,line,extraObject);
 db.prepare('INSERT INTO erp_journal_line_accounting_dimension VALUES(?,?,?,?)').run(tenantId,orgId,line,root);return {journal,line};
 }
 const access={tenantId:tenant,setupAdministrator:true,auth:{email:'viewer@example.test'}};
 const broker=async(_profile,_action,request)=>{const sql=request.text.replace(/::(?:uuid|date|boolean|text)/g,'').replace(/string_agg\(([^]*?), ', ' ORDER BY o\.[^]*?\)/g,"group_concat($1, ', ')");const stmt=db.prepare(sql);stmt.setAllowUnknownNamedParameters(true);const rows=stmt.all(Object.fromEntries(request.values.map((v,i)=>[String(i+1),typeof v==='boolean'?Number(v):v])));return {rows,rowCount:rows.length};};
 const query={organisation_id:org,object_class:'accounting_object',object_type_id:type,object_id:root,date_from:'2026-09-01',date_to:'2026-09-30'};
 return {db,access,tenant,org,type,root,child,grandchild,gl,otherGl,division,post,run:(overrides={})=>runStatement({query:{...query,...overrides},broker},access)};
}
test('current descendants, unique lines, posted reversals and prior years reconcile',async()=>{
 const f=fixture();try{f.post('2025-01-01',100,0);f.post('2026-09-03',25,0,f.grandchild,{extraObject:f.root});f.post('2026-09-04',10,0,f.child,{status:'reversed'});f.post('2026-09-05',0,10,f.child);f.post('2026-09-06',999,0,f.root,{posted:false});f.post('2026-10-01',999,0);f.post('2026-09-08',999,0,f.root,{tenantId:id(999)});
 const r=await f.run();assert.equal(r.opening_balance,'100');assert.equal(r.closing_balance,'125');assert.equal(r.total_count,3);assert.deepEqual(r.rows.map(x=>x.running_balance),[125,135,125]);assert.equal(r.period_debit,'35');assert.equal(r.period_credit,'10');assert.equal(r.restricted,false);
 const direct=await f.run({include_child_objects:'0'});assert.equal(direct.total_count,1);assert.equal(direct.closing_balance,'125');
 f.db.prepare('UPDATE erp_accounting_object SET parent_accounting_object_id=NULL WHERE accounting_object_id=?').run(f.child);assert.equal((await f.run()).total_count,1);
 }finally{f.db.close();}
});
test('sub-ledgers and dimensions use their own journal relationships; GL filters affect opening and movement',async()=>{
 const f=fixture();try{f.post('2025-01-01',100,0);f.post('2026-09-03',20,0,f.child);f.post('2026-09-04',30,0,f.root,{account:f.otherGl});for(const object_class of ['subledger_account','accounting_dimension']){const all=await f.run({object_class});assert.equal(all.opening_balance,'100');assert.equal(all.closing_balance,'150');assert.equal(all.total_count,2);const r=await f.run({object_class,gl_account_id:f.gl});assert.equal(r.include_child_objects,false);assert.equal(r.opening_balance,'100');assert.equal(r.closing_balance,'120');assert.equal(r.total_count,1);}
 const empty=await f.run({date_from:'2026-09-20',date_to:'2026-09-30'});assert.equal(empty.total_count,0);assert.deepEqual(empty.rows,[]);assert.equal(empty.opening_balance,empty.closing_balance);
 }finally{f.db.close();}
});
test('pagination preserves running balances and full period totals',async()=>{
 const f=fixture();try{f.post('2025-01-01',100,0);for(let n=0;n<105;n++)f.post('2026-09-03',1,0);const first=await f.run();const second=await f.run({offset:'100'});assert.equal(first.rows.length,100);assert.equal(first.next_offset,100);assert.equal(second.rows[0].running_balance,201);assert.equal(second.rows.length,5);assert.equal(second.next_offset,null);assert.equal(second.closing_balance,'205');assert.equal(second.period_debit,'105');}finally{f.db.close();}
});
test('rejects invalid scope, dates and foreign selections',async()=>{
 const f=fixture();try{await assert.rejects(f.run({object_id:id(999)}),e=>e.status===404);await assert.rejects(f.run({object_type_id:id(999)}),e=>e.status===404);await assert.rejects(f.run({organisation_id:id(999)}),e=>e.status===404);await assert.rejects(f.run({gl_account_id:id(999)}),e=>e.status===404);assert.throws(()=>validate({object_class:'unsafe'}));await assert.rejects(f.run({date_from:'2026-09-31'}),e=>e.status===400);await assert.rejects(f.run({offset:'-1'}),e=>e.status===400);}finally{f.db.close();}
});
test('object and transaction permissions flag incomplete balances without revealing hidden allocations',async()=>{
 const f=fixture();try{
 f.post('2026-09-03',10,0);f.post('2026-09-04',20,0,f.child);
 const childDivision=id(500);f.db.prepare('INSERT INTO erp_division VALUES(?,?,?,NULL)').run(f.tenant,f.org,childDivision);f.db.prepare('UPDATE erp_accounting_object SET owner_division_id=? WHERE accounting_object_id=?').run(childDivision,f.child);
 f.db.exec("INSERT INTO erp_role VALUES('role',1); INSERT INTO erp_role_module VALUES('role','module')");f.db.prepare('INSERT INTO erp_user_role VALUES(?,?,?,?,?,NULL)').run(f.tenant,f.org,'role',f.access.auth.email,'2020-01-01');f.db.prepare('INSERT INTO erp_accounting_object_type_module VALUES(?,?)').run(f.type,'module');
 for(const kind of ['accounting_object','transaction'])f.db.prepare("INSERT INTO erp_role_permission VALUES('role',?,?,?,'view','2020-01-01',NULL,0)").run(f.division,kind,'*');
 f.access.setupAdministrator=false;const r=await f.run();assert.equal(r.restricted,true);assert.equal(r.closing_balance,'10');assert.equal(r.total_count,1);assert.ok(!r.rows[0].allocated_objects.includes(f.child));
 f.db.exec("DELETE FROM erp_role_permission WHERE resource_kind='transaction'");const hidden=await f.run();assert.equal(hidden.restricted,true);assert.equal(hidden.total_count,0);
 f.db.exec("DELETE FROM erp_role_permission");await assert.rejects(f.run(),e=>e.status===403);
 }finally{f.db.close();}
});
