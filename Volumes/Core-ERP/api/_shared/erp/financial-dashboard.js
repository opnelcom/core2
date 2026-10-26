'use strict';
const {transactionVisibilitySql}=require('./transaction-visibility');
const {postedLineScopeSql}=require('./posted-line-scope');
const {objectVisibilitySql,classes}=require('./object-statement');

// Same scope and posting basis as object statements. No module joins: each line
// contributes once, even when a type belongs to several modules.
function financialDashboardSql(){
  const visible=transactionVisibilitySql({tenant:'$1',organisation:'$2',email:'$3',administrator:'$4',division:'l.division_id',transactionType:'j.transaction_type_id',status:"CASE WHEN j.workflow_status='reversed' THEN 'approved' ELSE j.workflow_status END"});
  const objectVisible=objectVisibilitySql(classes.subledger_account,'subledger_account',{tenant:'$1',organisation:'$2',email:'$3',administrator:'$4'});
  return `WITH scoped AS (
    SELECT l.*,${visible} visible FROM erp_journal_line l
    JOIN erp_journal j ON j.journal_id=l.journal_id AND j.tenant_id=l.tenant_id AND j.organisation_id=l.organisation_id
    WHERE ${postedLineScopeSql({tenant:'$1',organisation:'$2',asOf:'$7',selected:'$5',children:'$6'})}
  ), balances AS (
    SELECT t.type_code account_class,a.gl_account_id,a.account_code,a.account_name,
      o.subledger_account_id account_id,o.account_code subledger_code,o.account_name subledger_name,
      st.subledger_account_type_id type_id,st.type_name,
      sum(l.debit_amount-l.credit_amount)::text balance
    FROM scoped l
    JOIN erp_gl_account a ON a.gl_account_id=l.gl_account_id AND a.tenant_id=$1 AND a.organisation_id=$2
    JOIN erp_gl_account_type t ON t.gl_account_type_id=a.gl_account_type_id AND t.tenant_id=$1 AND t.organisation_id=$2
    LEFT JOIN erp_subledger_account o ON o.subledger_account_id=l.subledger_account_id AND o.tenant_id=$1 AND o.organisation_id=$2 AND ${objectVisible}
    LEFT JOIN erp_subledger_account_type st ON st.subledger_account_type_id=o.subledger_account_type_id AND st.tenant_id=$1 AND st.organisation_id=$2
    WHERE l.visible AND t.type_code IN ('asset','liability')
    GROUP BY t.type_code,a.gl_account_id,a.account_code,a.account_name,o.subledger_account_id,o.account_code,o.account_name,st.subledger_account_type_id,st.type_name
  ) SELECT balances.*,coverage.restricted FROM (SELECT COALESCE(bool_or(NOT visible),false) restricted FROM scoped) coverage
  LEFT JOIN balances ON true ORDER BY account_class,type_name,account_code,subledger_code`;
}
// Journal amounts are numeric(18,2); retain exact cents during aggregation.
function cents(value){const match=/^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));if(!match)throw new Error('Invalid journal balance');return (match[1]?-1n:1n)*(BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0')));}
function money(value){return `${value<0n?'-':''}${(value<0n?-value:value)/100n}.${String((value<0n?-value:value)%100n).padStart(2,'0')}`;}
function financialDashboardResult(rows,asOf){
  const groups=new Map();let assets=0n,liabilities=0n;
  for(const row of rows){
    if(!['asset','liability'].includes(row.account_class))continue;
    const amount=cents(row.balance)*(row.account_class==='liability'?-1n:1n);
    if(row.account_class==='asset')assets+=amount;else liabilities+=amount;
    const key=`${row.account_class}:${row.type_id||row.gl_account_id}`;
    if(!groups.has(key))groups.set(key,{id:key,account_class:row.account_class,name:row.type_name||row.account_name,total:0n,accounts:[]});
    const group=groups.get(key);group.total+=amount;
    group.accounts.push({account_id:row.account_id,type_id:row.type_id,account_code:row.subledger_code||row.account_code,account_name:row.subledger_name||row.account_name,gl_account_id:row.gl_account_id,gl_code:row.account_code,gl_name:row.account_name,balance:money(amount)});
  }
  return {as_of:asOf,restricted:rows.some(row=>row.restricted===true||row.restricted===1),assets:money(assets),liabilities:money(liabilities),net_assets:money(assets-liabilities),groups:[...groups.values()].map(group=>({...group,total:money(group.total)}))};
}
module.exports={financialDashboardSql,financialDashboardResult};
