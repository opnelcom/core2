'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {financialDashboardResult:result,financialDashboardSql}=require('../api/_shared/erp/financial-dashboard');
const row=(account_class,balance,extra={})=>({account_class,balance,gl_account_id:account_class,account_name:account_class,account_code:'1000',...extra});
test('asset presentation combines GL balances per record without merging different assets',()=>{
  const {assetBalances}=require('../public/financial-dashboard');
  const group={id:'asset:type',account_class:'asset',name:'Asset',accounts:[
    {account_id:'vehicle',account_code:'A01',account_name:'Vehicle',balance:'240000.00',gl_account_id:'cost'},
    {account_id:'vehicle',account_code:'A01',account_name:'Vehicle',balance:'-100000.00',gl_account_id:'depreciation'},
    {account_id:'property',account_code:'A02',account_name:'Property',balance:'2800000.00',gl_account_id:'cost'},
  ]};
  const records=assetBalances(group);assert.equal(records.length,2);assert.equal(records[0].total,'140000.00');assert.equal(records[0].accounts.length,2);assert.equal(records[1].total,'2800000.00');
  assert.equal(group.accounts.length,3,'GL drill-down data is preserved');
});
test('financial position preserves GL classification within the same subledger and nets contra-assets',()=>{
  const data=result([
    row('asset','1000.00',{type_id:'asset-type',type_name:'Assets',account_id:'asset'}),
    row('asset','-200.00',{type_id:'asset-type',type_name:'Assets',account_id:'asset',gl_account_id:'depreciation'}),
    row('liability','-300.00',{type_id:'asset-type',type_name:'Assets',account_id:'asset',gl_account_id:'lease'}),
    row('asset','500.00',{type_id:'customer',type_name:'Customers'}),
    row('liability','-100.00',{type_id:'customer',type_name:'Customers'}),
    row('liability','-400.00',{type_id:'loan',type_name:'Loans'}),
    row('expense','50.00',{type_id:'loan',type_name:'Loans'}),
    row('asset','25.00',{gl_account_id:'vat',account_name:'VAT Input'}),
  ],'2026-10-26');
  assert.equal(data.assets,'1325.00');assert.equal(data.liabilities,'800.00');assert.equal(data.net_assets,'525.00');
  assert.equal(data.groups.find(g=>g.id==='asset:asset-type').total,'800.00');
  assert.equal(data.groups.find(g=>g.id==='liability:asset-type').total,'300.00');
  assert.equal(data.groups.find(g=>g.id==='liability:loan').total,'400.00','loan interest must not alter principal');
  assert.ok(data.groups.some(g=>g.name==='VAT Input'),'unallocated GL values remain included');
});
test('exact cents, negative balances, partial coverage and empty scope remain explicit',()=>{
  const data=result([row('asset','9999999999999999.99'),row('asset','0.01'),row('liability','10.01',{restricted:true})],'2026-10-26');
  assert.equal(data.assets,'10000000000000000.00');assert.equal(data.liabilities,'-10.01');assert.equal(data.net_assets,'10000000000000010.01');assert.equal(data.restricted,true);
  assert.deepEqual(result([{restricted:true}], '2026-10-26'),{as_of:'2026-10-26',restricted:true,assets:'0.00',liabilities:'0.00',net_assets:'0.00',groups:[]});
});
test('query scopes posted lines, protects allocations and excludes income and module duplication',()=>{
  const sql=financialDashboardSql();
  assert.match(sql,/j.posted_at IS NOT NULL/);assert.match(sql,/j.journal_date<=\$7::date/);
  assert.match(sql,/l.tenant_id=\$1 AND l.organisation_id=\$2/);
  assert.match(sql,/rp.resource_kind='transaction'/);assert.match(sql,/rp.resource_kind='subledger_account'/);
  assert.match(sql,/t.type_code IN \('asset','liability'\)/);assert.match(sql,/bool_or\(NOT visible\)/);
  assert.doesNotMatch(sql,/JOIN .*_module/);
});

test('financial endpoint requires authentication, business access and valid scope/date',async()=>{
  const endpoint=require('../api/dashboard/financial');
  const id='00000000-0000-0000-0000-000000000001';
  const send=(status,body)=>({status,body});
  assert.equal((await endpoint({req:{method:'GET'},query:{},send,tenantSession:async()=>({status:401,body:{error:'Sign in'}})})).status,401);
  const context={req:{method:'GET'},query:{organisation_id:id,as_of:'2026-10-26'},send,
    tenantSession:async()=>({tenantId:'tenant',auth:{email:'viewer'}}),
    broker:async(_profile,_action,{text})=>({rows:[],rowCount:text.startsWith('SELECT 1 WHERE')?1:0})};
  assert.equal((await endpoint(context)).status,403,'organisation membership does not grant business access');
  assert.equal((await endpoint({...context,query:{...context.query,as_of:'2026-02-30'}})).status,400);
  assert.equal((await endpoint({...context,query:{...context.query,active_division_id:'bad'}})).status,400);
  assert.equal((await endpoint({...context,req:{method:'POST'}})).status,405);
});

test('balance SQL executes with tenant, organisation, date, division and permission isolation',()=>{
  const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(':memory:');
  try{
    db.aggregate('bool_or',{start:0,step:(previous,value)=>previous||value?1:0});
    db.exec(`CREATE TABLE erp_division(tenant_id,organisation_id,division_id,parent_division_id);
      CREATE TABLE erp_user_role(tenant_id,organisation_id,role_id,email,valid_from,valid_to);
      CREATE TABLE erp_role(role_id,is_active);
      CREATE TABLE erp_role_permission(role_id,division_id,resource_kind,resource_code,workflow_status,valid_from,valid_to,applies_to_children);
      CREATE TABLE erp_journal(tenant_id,organisation_id,journal_id,journal_date,posted_at,workflow_status,transaction_type_id);
      CREATE TABLE erp_journal_line(tenant_id,organisation_id,journal_id,division_id,gl_account_id,subledger_account_id,debit_amount,credit_amount);
      CREATE TABLE erp_gl_account(tenant_id,organisation_id,gl_account_id,gl_account_type_id,account_code,account_name);
      CREATE TABLE erp_gl_account_type(tenant_id,organisation_id,gl_account_type_id,type_code);
      CREATE TABLE erp_subledger_account(tenant_id,organisation_id,subledger_account_id,subledger_account_type_id,owner_division_id,account_code,account_name);
      CREATE TABLE erp_subledger_account_type(tenant_id,organisation_id,subledger_account_type_id,type_name);
      INSERT INTO erp_division VALUES('tenant','org','root',NULL),('tenant','org','child','root');
      INSERT INTO erp_gl_account_type VALUES('tenant','org','asset','asset'),('tenant','org','liability','liability'),('tenant','org','expense','expense');
      INSERT INTO erp_gl_account VALUES('tenant','org','bank','asset','1010','Bank'),('tenant','org','loan','liability','2500','Loan'),('tenant','org','interest','expense','5500','Interest');
      INSERT INTO erp_subledger_account_type VALUES('tenant','org','loan-type','Loans');
      INSERT INTO erp_subledger_account VALUES('tenant','org','loan-account','loan-type','root','L01','Loan One');`);
    require('./fixtures/user-access').grantUserAccess(db,{tenantId:'tenant',organisationId:'org',email:'viewer'});
    function post(id,gl,debit,credit,{date='2026-10-01',posted='yes',division='root',tenant='tenant',org='org',status='approved',type='type'}={}){
      db.prepare('INSERT INTO erp_journal VALUES(?,?,?,?,?,?,?)').run(tenant,org,id,date,posted,status,type);
      db.prepare('INSERT INTO erp_journal_line VALUES(?,?,?,?,?,?,?,?)').run(tenant,org,id,division,gl,gl==='bank'?null:'loan-account',debit,credit);
    }
    post('bank','bank',100,0);post('loan','loan',0,70);post('interest','interest',5,0);
    post('child','bank',20,0,{division:'child'});post('future','bank',999,0,{date:'2027-01-01'});post('draft','bank',999,0,{posted:null});
    post('foreign-tenant','bank',999,0,{tenant:'other'});post('foreign-org','bank',999,0,{org:'other'});
    post('reversed','bank',10,0,{status:'reversed'});post('reversal','bank',0,10);
    const sql=financialDashboardSql().replace(/::(?:uuid|boolean|date|text)/g,'');
    function query(admin=1,division=null,children=0){const statement=db.prepare(sql);statement.setAllowUnknownNamedParameters(true);return result(statement.all({'1':'tenant','2':'org','3':'viewer','4':admin,'5':division,'6':children,'7':'2026-10-26'}),'2026-10-26');}
    assert.equal(query().assets,'120.00');assert.equal(query().liabilities,'70.00');assert.equal(query().net_assets,'50.00');
    assert.equal(query(1,'root').assets,'100.00');assert.equal(query(1,'root',1).assets,'120.00');assert.equal(query(1,'foreign').assets,'0.00');
    assert.equal(query(0).assets,'0.00');assert.equal(query(0).restricted,true);
    db.exec(`INSERT INTO erp_role VALUES('role',true);INSERT INTO erp_user_role VALUES('tenant','org','role','viewer','2000-01-01',NULL);
      INSERT INTO erp_role_permission VALUES('role','root','transaction','type','view','2000-01-01',NULL,false);`);
    const permitted=query(0);assert.equal(permitted.assets,'100.00');assert.equal(permitted.restricted,true);
    assert.equal(permitted.groups.find(g=>g.account_class==='liability').accounts[0].account_id,null,'allocation identity is withheld without object permission');
    db.exec(`UPDATE erp_role_permission SET applies_to_children=true;INSERT INTO erp_role_permission VALUES('role','root','subledger_account','loan-type','view','2000-01-01',NULL,true);`);
    assert.equal(query(0).restricted,false);assert.equal(query(0).groups.find(g=>g.account_class==='liability').accounts[0].account_id,'loan-account');
  }finally{db.close();}
});
