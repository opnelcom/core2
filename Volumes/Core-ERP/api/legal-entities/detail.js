'use strict';
const {authTenant,requireBusinessAccess}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const id=ctx.query.legal_entity_id;
  if(!id)return ctx.send(400,{error:'legal_entity_id is required'});
  const entity=await ctx.broker('core_erp','query',{text:`SELECT * FROM erp_legal_entity WHERE tenant_id=$1 AND legal_entity_id=$2 AND workflow_status <> 'deleted'`,values:[access.tenantId,id]});
  if(!entity.rowCount)return ctx.send(404,{error:'Legal entity not found'});
  const orgId=entity.rows[0].organisation_id;
  const denied=await requireBusinessAccess(ctx,access,orgId);
  if(denied)return ctx.send(denied.status,denied.body);
  const [identifications,addresses,relationships,accounts]=await Promise.all([
    ctx.broker('core_erp','query',{text:`SELECT * FROM erp_legal_entity_identification WHERE tenant_id=$1 AND legal_entity_id=$2 AND is_active=true ORDER BY identification_type,valid_from DESC`,values:[access.tenantId,id]}),
    ctx.broker('core_erp','query',{text:`SELECT * FROM erp_legal_entity_address WHERE tenant_id=$1 AND legal_entity_id=$2 ORDER BY is_primary DESC,address_type,valid_from DESC`,values:[access.tenantId,id]}),
    ctx.broker('core_erp','query',{
      text:`SELECT r.*,from_entity.known_name from_known_name,to_entity.known_name to_known_name
            FROM erp_legal_entity_relationship r
            JOIN erp_legal_entity from_entity ON from_entity.legal_entity_id=r.from_legal_entity_id
            JOIN erp_legal_entity to_entity ON to_entity.legal_entity_id=r.to_legal_entity_id
            WHERE r.tenant_id=$1 AND (r.from_legal_entity_id=$2 OR r.to_legal_entity_id=$2)
            ORDER BY r.relationship_type,r.valid_from DESC`,
      values:[access.tenantId,id]
    }),
    ctx.broker('core_erp','query',{
      text:`WITH gl AS (
              SELECT gl_account_id ledger_account_id, sum(debit_amount) debit_total, sum(credit_amount) credit_total, sum(debit_amount-credit_amount) balance
              FROM erp_journal_line l
              JOIN erp_journal j ON j.journal_id=l.journal_id
              WHERE j.tenant_id=$1 AND j.organisation_id=$2 AND j.workflow_status='approved'
              GROUP BY gl_account_id
            ),
            sub AS (
              SELECT subledger_account_id ledger_account_id, sum(debit_amount) debit_total, sum(credit_amount) credit_total, sum(debit_amount-credit_amount) balance
              FROM erp_journal_line l
              JOIN erp_journal j ON j.journal_id=l.journal_id
              WHERE j.tenant_id=$1 AND j.organisation_id=$2 AND j.workflow_status='approved' AND subledger_account_id IS NOT NULL
              GROUP BY subledger_account_id
            )
            SELECT a.*,t.account_type_code,t.account_type_name,d.division_name owner_division_name,
                   COALESCE(CASE WHEN a.ledger_family_code='gl' THEN gl.debit_total ELSE sub.debit_total END,0) debit_total,
                   COALESCE(CASE WHEN a.ledger_family_code='gl' THEN gl.credit_total ELSE sub.credit_total END,0) credit_total,
                   COALESCE(CASE WHEN a.ledger_family_code='gl' THEN gl.balance ELSE sub.balance END,0) balance
            FROM erp_ledger_account a
            LEFT JOIN erp_ledger_account_type t ON t.account_type_id=a.account_type_id
            JOIN erp_division d ON d.division_id=a.owner_division_id
            LEFT JOIN gl ON gl.ledger_account_id=a.ledger_account_id
            LEFT JOIN sub ON sub.ledger_account_id=a.ledger_account_id
            WHERE a.tenant_id=$1 AND a.organisation_id=$2 AND a.legal_entity_id=$3 AND a.workflow_status <> 'deleted'
            ORDER BY a.ledger_family_code,a.account_code`,
      values:[access.tenantId,orgId,id]
    })
  ]);
  return {legal_entity:entity.rows[0],identifications:identifications.rows,addresses:addresses.rows,relationships:relationships.rows,accounts:accounts.rows};
};
