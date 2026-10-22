'use strict';
const {accessibleModulesSql}=require('./module-dashboard');
const {objectVisibilitySql,classes}=require('./object-statement');
const {transactionVisibilitySql}=require('./transaction-visibility');
const {divisionScopeSql,postedLineScopeSql}=require('./posted-line-scope');

function subledgerBalancesSql(){
  return `WITH accessible_modules AS (${accessibleModulesSql()}), accounts AS (
    SELECT o.* FROM erp_subledger_account o
    LEFT JOIN erp_workflow_status status ON status.tenant_id=o.tenant_id AND status.organisation_id=o.organisation_id AND status.status_code=o.workflow_status
    WHERE o.tenant_id=$1 AND o.organisation_id=$2 AND COALESCE(status.displayed,true)=true
      AND ${objectVisibilitySql(classes.subledger_account,'subledger_account',{tenant:'$1',organisation:'$2',email:'$3',administrator:'$4'})}
      AND ${divisionScopeSql({tenant:'$1',organisation:'$2',selected:'$5',children:'$6',record:'o.owner_division_id'})}
  ), matched_lines AS (
    SELECT l.subledger_account_id,l.debit_amount,l.credit_amount,
      ${transactionVisibilitySql({tenant:'$1',organisation:'$2',division:'l.division_id',transactionType:'j.transaction_type_id',status:"CASE WHEN j.workflow_status='reversed' THEN 'approved' ELSE j.workflow_status END",email:'$3',administrator:'$4'})} visible
    FROM erp_journal_line l
    JOIN erp_journal j ON j.tenant_id=l.tenant_id AND j.organisation_id=l.organisation_id AND j.journal_id=l.journal_id
    JOIN erp_gl_account gl ON gl.tenant_id=l.tenant_id AND gl.organisation_id=l.organisation_id AND gl.gl_account_id=l.gl_account_id
    JOIN accounts account ON account.subledger_account_id=l.subledger_account_id
    WHERE ${postedLineScopeSql({tenant:'$1',organisation:'$2',asOf:'$7',selected:'$5',children:'$6'})}
  ), balances AS (
    SELECT subledger_account_id,COALESCE(sum(CASE WHEN visible THEN debit_amount-credit_amount ELSE 0 END),0) balance,
      max(CASE WHEN visible THEN 0 ELSE 1 END) restricted
    FROM matched_lines GROUP BY subledger_account_id
  )
  SELECT module.module_id,type.subledger_account_type_id,type.type_name,
    account.subledger_account_id,account.account_code,account.account_name,
    COALESCE(balances.balance,0)::text balance,COALESCE(balances.restricted,0) restricted
  FROM accessible_modules module
  JOIN erp_subledger_account_type_module link ON link.module_id=module.module_id
  JOIN erp_subledger_account_type type ON type.subledger_account_type_id=link.subledger_account_type_id
    AND type.tenant_id=$1 AND type.organisation_id=$2 AND type.is_active=true
  LEFT JOIN accounts account ON account.subledger_account_type_id=type.subledger_account_type_id
  LEFT JOIN balances ON balances.subledger_account_id=account.subledger_account_id
  WHERE ($4::boolean OR EXISTS(SELECT 1 FROM accounts available WHERE available.subledger_account_type_id=type.subledger_account_type_id))
  ORDER BY module.sort_order,module.module_name,type.type_name,account.account_code,account.account_name`;
}

function attachSubledgerBalances(data,rows,asOf){
  data.as_of=asOf;
  for(const module of data.modules)module.subledger_types=[];
  for(const row of rows){
    const module=data.modules.find(module=>module.module_id===row.module_id);if(!module)continue;
    let type=module.subledger_types.find(type=>type.type_id===row.subledger_account_type_id);
    if(!type){type={type_id:row.subledger_account_type_id,type_name:row.type_name,accounts:[]};module.subledger_types.push(type);}
    if(row.subledger_account_id)type.accounts.push({account_id:row.subledger_account_id,account_code:row.account_code,account_name:row.account_name,balance:String(row.balance),restricted:row.restricted===1||row.restricted===true});
  }
  return data;
}
module.exports={subledgerBalancesSql,attachSubledgerBalances};
