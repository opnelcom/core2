'use strict';
const {authTenant}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  if(!orgId)return ctx.send(400,{error:'organisation_id is required'});
  const transactionTypeId=ctx.query.transaction_type_id||null;
  const r=await ctx.broker('core_erp','query',{
    text:`SELECT j.*,tt.type_name transaction_type_name,fp.period_code,d.division_name source_division_name,
                 COALESCE(sum(l.debit_amount),0) debit_total,COALESCE(sum(l.credit_amount),0) credit_total
          FROM erp_journal j
          LEFT JOIN erp_transaction_type tt ON tt.transaction_type_id=j.transaction_type_id
          JOIN erp_fiscal_period fp ON fp.fiscal_period_id=j.fiscal_period_id
          JOIN erp_division d ON d.division_id=j.source_division_id
          LEFT JOIN erp_journal_line l ON l.journal_id=j.journal_id
          WHERE j.tenant_id=$1 AND j.organisation_id=$2 AND j.workflow_status <> 'deleted'
          AND ($4::uuid IS NULL OR j.transaction_type_id=$4::uuid)
          AND (
            EXISTS (
              WITH RECURSIVE ancestors AS (
                SELECT division_id,parent_division_id FROM erp_division WHERE division_id=j.source_division_id
                UNION ALL
                SELECT parent.division_id,parent.parent_division_id
                FROM erp_division parent
                JOIN ancestors child ON child.parent_division_id=parent.division_id
              )
              SELECT 1
              FROM erp_user_role ur
              JOIN erp_role role ON role.role_id=ur.role_id
              JOIN erp_role_permission rp ON rp.role_id=role.role_id
              JOIN ancestors scope ON scope.division_id=rp.division_id
              WHERE ur.tenant_id=$1 AND ur.organisation_id=$2 AND lower(ur.email)=lower($3)
              AND role.is_active=true AND ur.valid_from <= CURRENT_DATE AND (ur.valid_to IS NULL OR ur.valid_to >= CURRENT_DATE)
              AND rp.resource_kind='transaction'
              AND (rp.workflow_status='view' OR rp.workflow_status='*' OR rp.workflow_status=j.workflow_status)
              AND (rp.resource_code=j.transaction_type_id::text OR rp.resource_code='*')
            )
            OR lower(j.created_by_email)=lower($3)
          )
          GROUP BY j.journal_id,tt.type_name,fp.period_code,d.division_name
          ORDER BY j.journal_date DESC,j.created_at DESC`,
    values:[access.tenantId,orgId,access.auth.email,transactionTypeId]
  });
  return {journals:r.rows};
};
