'use strict';
delete require.cache[require.resolve('../_shared/erp')];
const {authTenant}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  if(!orgId)return ctx.send(400,{error:'organisation_id is required'});
  const [roles,permissions,users]=await Promise.all([
    ctx.broker('core_erp','query',{
      text:`SELECT *
            FROM erp_role
            WHERE tenant_id=$1 AND organisation_id=$2
            ORDER BY role_name`,
      values:[access.tenantId,orgId]
    }),
    ctx.broker('core_erp','query',{
      text:`SELECT rp.*,
                   d.division_code,
                   d.division_name,
                   lf.family_name AS ledger_family_name,
                   tt.type_code AS transaction_type_code,
                   tt.type_name AS transaction_type_name,
                   tg.group_name AS transaction_group_name
            FROM erp_role_permission rp
            LEFT JOIN erp_division d ON d.division_id=rp.division_id
            LEFT JOIN erp_ledger_family lf ON lf.tenant_id=rp.tenant_id
              AND lf.organisation_id=rp.organisation_id
              AND lf.ledger_family_code=rp.resource_code
              AND rp.resource_kind='master_data'
            LEFT JOIN erp_transaction_type tt ON tt.tenant_id=rp.tenant_id
              AND tt.organisation_id=rp.organisation_id
              AND tt.transaction_type_id::text=rp.resource_code
              AND rp.resource_kind='transaction'
            LEFT JOIN erp_transaction_group tg ON tg.transaction_group_id=tt.transaction_group_id
            WHERE rp.tenant_id=$1 AND rp.organisation_id=$2
            ORDER BY rp.resource_kind,d.division_code,rp.workflow_status,rp.resource_code`,
      values:[access.tenantId,orgId]
    }),
    ctx.broker('core_erp','query',{
      text:`SELECT *
            FROM erp_user_role
            WHERE tenant_id=$1 AND organisation_id=$2
            ORDER BY lower(email),valid_from`,
      values:[access.tenantId,orgId]
    })
  ]);
  return {roles:roles.rows,role_permissions:permissions.rows,role_users:users.rows};
};
