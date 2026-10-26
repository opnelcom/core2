'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {dashboardSql,dashboardResult}=require('../api/_shared/erp/module-dashboard');
const {subledgerBalancesSql,attachSubledgerBalances}=require('../api/_shared/erp/dashboard-subledgers');

function fixture(){
  const db=new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE erp_module(module_id,tenant_id,organisation_id,module_name,module_icon_svg,sort_order,is_active);
    CREATE TABLE erp_role(role_id,tenant_id,organisation_id,is_active);
    CREATE TABLE erp_user_role(role_id,tenant_id,organisation_id,email,valid_from,valid_to);
    CREATE TABLE erp_role_permission(tenant_id DEFAULT 'tenant',organisation_id DEFAULT 'org',role_id,division_id,resource_kind,resource_code,workflow_status,valid_from,valid_to,applies_to_children);
    CREATE TABLE erp_report(report_id,tenant_id,organisation_id,is_active);
    CREATE TABLE erp_report_module(report_id,module_id);
    CREATE TABLE erp_division(division_id,parent_division_id,tenant_id,organisation_id);
    CREATE TABLE erp_workflow_status(tenant_id,organisation_id,status_code,status_label,transitional);
    CREATE TABLE erp_workflow_path_status(tenant_id,organisation_id,workflow_path_id,step_code);
    CREATE TABLE erp_journal_line(tenant_id,organisation_id,journal_id,debit_amount,credit_amount);
    INSERT INTO erp_module VALUES('crm','tenant','org','CRM',NULL,1,true),('sales','tenant','org','Sales',NULL,2,true),('empty','tenant','org','Empty',NULL,3,true),('secret','tenant','org','Secret',NULL,4,true);
    INSERT INTO erp_role VALUES('role','tenant','org',true);
    INSERT INTO erp_user_role VALUES('role','tenant','org','user@example.test','2000-01-01',NULL);
    INSERT INTO erp_division VALUES('root',NULL,'tenant','org'),('child','root','tenant','org'),('foreign',NULL,'other','org');
    INSERT INTO erp_workflow_status VALUES('tenant','org','submitted','Custom submitted label',true),('tenant','org','active','Active',false),('tenant','org','draft','Draft',false),('other','org','submitted','Foreign',true);
    INSERT INTO erp_workflow_path_status VALUES('tenant','org','path','submitted'),('tenant','org','path','active');
  `);
  for(const [table,id,recordId,division] of [
    ['subledger_account','subledger_account_type_id','subledger_account_id','owner_division_id'],
    ['accounting_object','accounting_object_type_id','accounting_object_id','owner_division_id'],
    ['accounting_dimension','accounting_dimension_type_id','accounting_dimension_id','owner_division_id'],
    ['journal','transaction_type_id','journal_id','source_division_id']
  ]){
    const typeTable=table==='journal'?'erp_transaction_type':`erp_${table}_type`;
    db.exec(`CREATE TABLE ${typeTable}(${id},tenant_id,organisation_id,type_name,is_active,workflow_path_id);
      CREATE TABLE ${typeTable}_module(${id},module_id);
      CREATE TABLE erp_${table}(${recordId},${id},tenant_id,organisation_id,${division},workflow_status,created_by_email);
      INSERT INTO ${typeTable} VALUES('${table}-type','tenant','org','${table}',true,'path');
      INSERT INTO ${typeTable}_module VALUES('${table}-type','crm'),('${table}-type','sales'),('${table}-secret','secret');
      INSERT INTO erp_${table} VALUES('${table}-root','${table}-type','tenant','org','root','submitted','author@example.test'),
        ('${table}-child','${table}-type','tenant','org','child','submitted','author@example.test'),
        ('${table}-active','${table}-type','tenant','org','root','active','author@example.test'),
        ('${table}-foreign','${table}-type','other','org','foreign','submitted','author@example.test'),
        ('${table}-foreign-org','${table}-type','tenant','foreign-org','root','submitted','author@example.test');`);
  }
  const sql=dashboardSql().replace(/::(?:uuid|boolean|text|integer|numeric)/g,'').replace('count(DISTINCT (kind,record_id))',"count(DISTINCT kind || ':' || record_id)");
  const query=(overrides={})=>dashboardResult(db.prepare(sql).all({$1:'tenant',$2:'org',$3:'user@example.test',$4:0,$5:'root',$6:0,...overrides}));
  const grant=(kind,children=0,status='view')=>db.prepare('INSERT INTO erp_role_permission(role_id,division_id,resource_kind,resource_code,workflow_status,valid_from,valid_to,applies_to_children) VALUES(?,?,?,?,?,?,?,?)').run('role','root',kind,'*',status,'2000-01-01',null,children);
 require('./fixtures/user-access').grantUserAccess(db,{tenantId:'tenant',organisationId:'org',email:'user@example.test'});
  return {db,query,grant};
}

test('dashboard derives modules from permissions and honours view permissions, divisions, transitional flags and distinct overview counts',()=>{
  const f=fixture();
  try{
    let data=f.query();assert.deepEqual(data.modules,[]);assert.equal(data.total_records,0);
    f.grant('accounting_object');
    data=f.query();assert.equal(data.total_records,1);assert.equal(data.modules[0].total,1);assert.equal(data.modules[1].total,1);assert.equal(data.modules.length,2);
    assert.equal(data.modules[0].types[0].statuses[0].status_label,'Custom submitted label');
    assert.equal(f.query({$6:1}).total_records,1,'parent permission without inheritance cannot expose child objects');
    f.db.exec('UPDATE erp_role_permission SET applies_to_children=true');assert.equal(f.query({$6:1}).total_records,2);
    assert.equal(f.query({$5:'child'}).total_records,1);assert.equal(f.query({$5:'foreign'}).total_records,0);
    assert.equal(f.query({$2:'foreign-org'}).modules.length,0);assert.equal(f.query({$1:'other'}).modules.length,0);
    f.db.exec("UPDATE erp_user_role SET valid_to='2001-01-01'");assert.equal(f.query().modules.length,0);
  }finally{f.db.close();}
});

test('all supported object classes and transactions retain their existing list visibility rules',()=>{
  const f=fixture();try{
    for(const kind of ['subledger_account','accounting_object','accounting_dimension','transaction'])f.grant(kind,1);
    assert.equal(f.query().total_records,4);assert.equal(f.query({$6:1}).total_records,8);
    f.db.exec('DELETE FROM erp_role_permission');
    assert.equal(f.query({$4:1}).total_records,0,'without grants no module navigation is derived');
    assert.equal(f.query({$3:'author@example.test'}).total_records,0,'creator still needs accessible modules');
    f.db.exec("UPDATE erp_journal SET created_by_email='user@example.test'");f.grant('accounting_object');assert.equal(f.query().total_records,1,'creation alone does not grant transaction access');
    f.grant('transaction',0,'submitted');assert.equal(f.query().total_records,2,'current-status transaction permission');
    f.db.exec("UPDATE erp_workflow_status SET transitional=false WHERE status_code='submitted'");assert.equal(f.query({$4:1}).total_records,0);
  }finally{f.db.close();}
});

test('debit totals sum lines once per journal and respect status, scope, access and module boundaries',()=>{
  const f=fixture();try{
    f.db.exec(`INSERT INTO erp_journal_line VALUES
      ('tenant','org','journal-root',100.25,0),('tenant','org','journal-root',100.25,0),
      ('tenant','org','journal-root',0,200.50),('tenant','org','journal-child',50.75,0),
      ('tenant','org','journal-active',9000,0),('other','org','journal-root',9999,0),
      ('tenant','foreign-org','journal-root',8888,0),('other','org','journal-foreign',7777,0);`);
    assert.equal(f.query().total_records,0);
    f.grant('transaction');
    const totals=data=>data.modules.filter(m=>m.types.length).map(m=>m.types[0].statuses[0].debit_total);
    assert.deepEqual(totals(f.query()),['200.5','200.5'],'same-value debit lines must both count, credits and linked modules must not multiply the sum');
    assert.deepEqual(totals(f.query({$6:1})),['251.25','251.25']);
    assert.deepEqual(totals(f.query({$5:'child'})),['50.75','50.75']);
    f.db.exec("INSERT INTO erp_journal VALUES('journal-no-lines','journal-type','tenant','org','root','submitted','author@example.test')");
    const module=f.query().modules[0];assert.equal(module.total,2);assert.equal(module.types[0].statuses[0].debit_total,'200.5');
    f.db.exec('DELETE FROM erp_role_permission');assert.equal(f.query().total_records,0);
    f.grant('accounting_object');assert.equal('debit_total' in f.query().modules[0].types[0].statuses[0],false);
  }finally{f.db.close();}
});

test('sub-ledger cards include non-transitional and zero accounts with scoped posted balances and partial-access warnings',()=>{
  const f=fixture();try{
    f.db.exec(`ALTER TABLE erp_workflow_status ADD COLUMN displayed DEFAULT true;
      ALTER TABLE erp_subledger_account ADD COLUMN account_code;
      ALTER TABLE erp_subledger_account ADD COLUMN account_name;
      UPDATE erp_subledger_account SET account_code=subledger_account_id,account_name=subledger_account_id;
      UPDATE erp_subledger_account SET workflow_status='active' WHERE subledger_account_id='subledger_account-root';
      ALTER TABLE erp_journal ADD COLUMN journal_date;
      ALTER TABLE erp_journal ADD COLUMN posted_at;
      ALTER TABLE erp_journal_line ADD COLUMN division_id;
      ALTER TABLE erp_journal_line ADD COLUMN subledger_account_id;
      ALTER TABLE erp_journal_line ADD COLUMN gl_account_id;
      CREATE TABLE erp_gl_account(tenant_id,organisation_id,gl_account_id);
      INSERT INTO erp_gl_account VALUES('tenant','org','gl');`);
    const post=(id,date,debit,credit,{posted=true,division='root',status='posted',tenant='tenant',org='org'}={})=>{
      f.db.prepare('INSERT INTO erp_journal(journal_id,transaction_type_id,tenant_id,organisation_id,source_division_id,workflow_status,created_by_email,journal_date,posted_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,'journal-type',tenant,org,division,status,'author@example.test',date,posted?date:null);
      f.db.prepare('INSERT INTO erp_journal_line(tenant_id,organisation_id,journal_id,debit_amount,credit_amount,division_id,subledger_account_id,gl_account_id) VALUES(?,?,?,?,?,?,?,?)').run(tenant,org,id,debit,credit,division,'subledger_account-root','gl');
    };
    post('old','2025-01-01',100,0);post('today','2026-10-21',50,0);post('credit','2026-10-21',0,25);
    post('child','2026-10-21',30,0,{division:'child'});post('future','2026-10-22',999,0);
    post('draft','2026-10-21',999,0,{posted:false});post('foreign','2026-10-21',999,0,{tenant:'other'});
    post('reversed','2026-10-21',10,0,{status:'reversed'});post('reversal','2026-10-21',0,10);
    const sql=subledgerBalancesSql().replace(/::(?:uuid|boolean|text|date)/g,'');
    const run=(overrides={})=>{
      const rows=f.db.prepare(sql).all({$1:'tenant',$2:'org',$3:'user@example.test',$4:0,$5:'root',$6:0,$7:'2026-10-21',...overrides});
      return attachSubledgerBalances(f.query(),rows,'2026-10-21');
    };
    f.grant('subledger_account',1);f.grant('transaction',1);
    let data=run();let accounts=data.modules[0].subledger_types[0].accounts;
    const account=rows=>rows.find(a=>a.account_id==='subledger_account-root');
    assert.equal(account(accounts).balance,'125');assert.equal(account(accounts).restricted,false);
    assert.equal(accounts.length,2,'root-owned zero account is included, child-owned and foreign accounts excluded');
    assert.equal(accounts.find(a=>a.account_id==='subledger_account-active').balance,'0');
    assert.equal(data.modules[1].subledger_types[0].accounts.find(a=>a.account_id==='subledger_account-root').balance,'125','module mappings do not multiply amounts');
    assert.equal(account(run({$6:1}).modules[0].subledger_types[0].accounts).balance,'155');
    f.db.exec("DELETE FROM erp_role_permission WHERE resource_kind='transaction'");
    const partial=account(run().modules[0].subledger_types[0].accounts);assert.equal(partial.balance,'0');assert.equal(partial.restricted,true);
    f.db.exec("UPDATE erp_workflow_status SET displayed=false WHERE status_code='active'");
    assert.equal(run().modules[0].subledger_types.length,0,'hidden accounts are excluded independently of transitional status');
  }finally{f.db.close();}
});
