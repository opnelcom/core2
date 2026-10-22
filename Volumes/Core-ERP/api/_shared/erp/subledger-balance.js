'use strict';
const {transactionVisibilitySql}=require('./transaction-visibility');

// Parameter contract matches subledger-accounts/list. All SQL identifiers are fixed.
function subledgerBalanceSql(){
  const visible=transactionVisibilitySql({tenant:'$1',organisation:'$2',division:'l.division_id',transactionType:'j.transaction_type_id',status:"CASE WHEN j.workflow_status='reversed' THEN 'approved' ELSE j.workflow_status END",email:'$4',administrator:'$5'});
  return `LEFT JOIN LATERAL (
    SELECT COALESCE(sum(l.debit_amount-l.credit_amount) FILTER (WHERE ${visible}),0) transaction_balance,
           COALESCE(bool_or(NOT ${visible}),false) balance_restricted
    FROM erp_journal_line l
    JOIN erp_journal j ON j.journal_id=l.journal_id AND j.tenant_id=l.tenant_id AND j.organisation_id=l.organisation_id
    WHERE l.tenant_id=$1 AND l.organisation_id=$2 AND l.subledger_account_id=account.subledger_account_id
      AND j.posted_at IS NOT NULL AND j.journal_date<=CURRENT_DATE
      AND ($6::uuid IS NULL OR l.division_id IN (
        WITH RECURSIVE selected_scope AS (
          SELECT division_id FROM erp_division WHERE tenant_id=$1 AND organisation_id=$2 AND division_id=$6::uuid
          UNION ALL
          SELECT child.division_id FROM erp_division child JOIN selected_scope parent ON child.parent_division_id=parent.division_id
          WHERE child.tenant_id=$1 AND child.organisation_id=$2 AND $7::boolean
        ) SELECT division_id FROM selected_scope
      ))
  ) balance ON true`;
}
module.exports={subledgerBalanceSql};
