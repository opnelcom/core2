'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {subledgerBalanceSql}=require('../api/_shared/erp/subledger-balance');

// Execute the aggregate with SQLite, translating PostgreSQL casts and bool_or only.
function fixture(){
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE erp_journal(journal_id,tenant_id,organisation_id,transaction_type_id,workflow_status,journal_date,posted_at);
    CREATE TABLE erp_journal_line(journal_id,tenant_id,organisation_id,subledger_account_id,division_id,debit_amount,credit_amount);
    CREATE TABLE erp_division(division_id,parent_division_id,tenant_id,organisation_id);
    CREATE TABLE erp_user_role(role_id,tenant_id,organisation_id,email,valid_from,valid_to);
    CREATE TABLE erp_role(role_id,is_active);
    CREATE TABLE erp_role_permission(role_id,division_id,resource_kind,resource_code,workflow_status,valid_from,valid_to,applies_to_children);
    INSERT INTO erp_division VALUES('root',NULL,'tenant','org'),('child','root','tenant','org'),('other',NULL,'tenant','org');
    INSERT INTO erp_role VALUES('role',true);
    INSERT INTO erp_user_role VALUES('role','tenant','org','viewer','2000-01-01',NULL);
    INSERT INTO erp_role_permission VALUES('role','root','transaction','type','view','2000-01-01',NULL,false);`);
  function post(id,debit,credit,{date='2026-10-21',posted=true,division='root',tenant='tenant',org='org',account='account',status='posted'}={}){
    db.prepare('INSERT INTO erp_journal VALUES(?,?,?,?,?,?,?)').run(id,tenant,org,'type',status,date,posted?date:null);
    db.prepare('INSERT INTO erp_journal_line VALUES(?,?,?,?,?,?,?)').run(id,tenant,org,account,division,debit,credit);
  }
  function balance({admin=true,division=null,children=false,account='account'}={}){
    const sql=subledgerBalanceSql().replace(/^LEFT JOIN LATERAL \(/,'').replace(/\) balance ON true$/,'')
      .replaceAll('account.subledger_account_id','$8').replace(/::(?:uuid|boolean|text)/g,'')
      .replaceAll('bool_or(', 'max(').replaceAll('CURRENT_DATE',"'2026-10-21'");
    return db.prepare(sql).get({$1:'tenant',$2:'org',$4:'viewer',$5:Number(admin),$6:division,$7:Number(children),$8:account});
  }
 require('./fixtures/user-access').grantUserAccess(db,{tenantId:'tenant',organisationId:'org',email:'viewer'});
  return {db,post,balance};
}
test('posted cumulative signed balance excludes future, drafts, other accounts and foreign scope',()=>{
  const {db,post,balance}=fixture();
  try{
    post('opening',100,0,{date:'2025-01-01'});post('payment',0,130);
    post('future',900,0,{date:'2026-10-22'});post('draft',900,0,{posted:false});
    post('other-account',900,0,{account:'another'});post('foreign-tenant',900,0,{tenant:'foreign'});
    post('foreign-org',900,0,{org:'foreign'});
    assert.equal(balance().transaction_balance,-30);
    assert.equal(balance({account:'empty'}).transaction_balance,0);
  }finally{db.close();}
});
test('division scope, child scope and transaction permissions constrain balances',()=>{
  const {db,post,balance}=fixture();
  try{
    post('root',100,0);post('child',40,0,{division:'child'});post('other',20,0,{division:'other'});
    assert.equal(balance({division:'root'}).transaction_balance,100);
    assert.equal(balance({division:'root',children:true}).transaction_balance,140);
    assert.equal(balance().transaction_balance,160);
    const limited=balance({admin:false});assert.equal(limited.transaction_balance,100);assert.equal(limited.balance_restricted,1);
    assert.equal(balance({admin:false,division:'root'}).balance_restricted,0);
    db.exec('UPDATE erp_role_permission SET applies_to_children=true');
    assert.equal(balance({admin:false,division:'root',children:true}).transaction_balance,140);
  }finally{db.close();}
});
test('posted reversals remain included after a workflow status change',()=>{
  const {db,post,balance}=fixture();
  try{post('original',100,0,{status:'reversed'});post('reversal',0,100);assert.equal(balance().transaction_balance,0);}
  finally{db.close();}
});
