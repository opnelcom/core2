'use strict';
const {authTenant}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  const typeId=ctx.query.master_data_type_id;
  if(!orgId||!typeId)return ctx.send(400,{error:'organisation_id and master_data_type_id are required'});
  const r=await ctx.broker('core_erp','query',{
    text:`SELECT r.*,d.division_name owner_division_name,a.account_code ledger_account_code,a.account_name ledger_account_name
          FROM erp_master_data_record r
          JOIN erp_master_data_type mdt ON mdt.master_data_type_id=r.master_data_type_id
          JOIN erp_division d ON d.division_id=r.owner_division_id
          LEFT JOIN erp_ledger_account a ON a.ledger_account_id=r.ledger_account_id
          WHERE r.tenant_id=$1 AND r.organisation_id=$2 AND r.master_data_type_id=$3 AND r.workflow_status <> 'deleted'
          AND (
            EXISTS (
              WITH RECURSIVE ancestors AS (
                SELECT division_id,parent_division_id FROM erp_division WHERE division_id=r.owner_division_id
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
              WHERE ur.tenant_id=$1 AND ur.organisation_id=$2 AND lower(ur.email)=lower($4)
              AND role.is_active=true AND ur.valid_from <= CURRENT_DATE AND (ur.valid_to IS NULL OR ur.valid_to >= CURRENT_DATE)
              AND rp.resource_kind='master_data' AND rp.workflow_status='view'
              AND (rp.resource_code=mdt.ledger_family_code OR rp.resource_code='*')
            )
          )
          ORDER BY r.display_name`,
    values:[access.tenantId,orgId,typeId,access.auth.email]
  });
  return {records:r.rows};
};
