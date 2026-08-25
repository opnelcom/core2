'use strict';
const {authTenant}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  const term=String(ctx.query.search||'').trim();
  if(!orgId)return ctx.send(400,{error:'organisation_id is required'});
  const values=[access.tenantId,orgId,term?`%${term.toLowerCase()}%`:null];
  const r=await ctx.broker('core_erp','query',{
    text:`WITH account_totals AS (
            SELECT a.legal_entity_id,
                   count(*) account_count,
                   COALESCE(sum(CASE
                     WHEN a.ledger_family_code='gl' THEN gl.balance
                     ELSE sub.balance
                   END),0) total_balance
            FROM erp_ledger_account a
            LEFT JOIN (
              SELECT gl_account_id ledger_account_id, sum(debit_amount-credit_amount) balance
              FROM erp_journal_line l
              JOIN erp_journal j ON j.journal_id=l.journal_id
              WHERE j.tenant_id=$1 AND j.organisation_id=$2 AND j.workflow_status='approved'
              GROUP BY gl_account_id
            ) gl ON gl.ledger_account_id=a.ledger_account_id
            LEFT JOIN (
              SELECT subledger_account_id ledger_account_id, sum(debit_amount-credit_amount) balance
              FROM erp_journal_line l
              JOIN erp_journal j ON j.journal_id=l.journal_id
              WHERE j.tenant_id=$1 AND j.organisation_id=$2 AND j.workflow_status='approved' AND subledger_account_id IS NOT NULL
              GROUP BY subledger_account_id
            ) sub ON sub.ledger_account_id=a.ledger_account_id
            WHERE a.tenant_id=$1 AND a.organisation_id=$2 AND a.workflow_status <> 'deleted' AND a.legal_entity_id IS NOT NULL
            GROUP BY a.legal_entity_id
          )
          SELECT e.*,
                 COALESCE(t.account_count,0) account_count,
                 COALESCE(t.total_balance,0) total_balance
          FROM erp_legal_entity e
          LEFT JOIN account_totals t ON t.legal_entity_id=e.legal_entity_id
          WHERE e.tenant_id=$1 AND e.organisation_id=$2 AND e.workflow_status <> 'deleted'
            AND ($3::text IS NULL OR lower(e.legal_name) LIKE $3 OR lower(e.known_name) LIKE $3 OR lower(e.entity_type) LIKE $3)
          ORDER BY e.known_name,e.legal_name`,
    values
  });
  return {legal_entities:r.rows};
};
