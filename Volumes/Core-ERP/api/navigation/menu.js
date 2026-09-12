'use strict';
const {authTenant,isAdministrator}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  if(!orgId)return ctx.send(400,{error:'organisation_id is required'});
  const administrator=isAdministrator(access);
  const [roles,modules,permissions]=await Promise.all([
    ctx.broker('core_erp','query',{text:`SELECT DISTINCT r.*,COALESCE((SELECT array_agg(rm.module_id) FROM erp_role_module rm WHERE rm.role_id=r.role_id),'{}'::uuid[]) module_ids FROM erp_user_role ur JOIN erp_role r ON r.role_id=ur.role_id
      WHERE ur.tenant_id=$1 AND ur.organisation_id=$2 AND lower(ur.email)=lower($3) AND r.is_active=true
      AND ur.valid_from<=CURRENT_DATE AND (ur.valid_to IS NULL OR ur.valid_to>=CURRENT_DATE) ORDER BY r.role_name`,values:[access.tenantId,orgId,access.auth.email]}),
    ctx.broker('core_erp','query',{text:`SELECT DISTINCT m.* FROM erp_user_role ur JOIN erp_role r ON r.role_id=ur.role_id CROSS JOIN erp_module m
         WHERE ur.tenant_id=$1 AND ur.organisation_id=$2 AND lower(ur.email)=lower($3) AND r.is_active=true AND m.tenant_id=$1 AND m.organisation_id=$2 AND m.is_active=true
         AND ur.valid_from<=CURRENT_DATE AND (ur.valid_to IS NULL OR ur.valid_to>=CURRENT_DATE)
         AND EXISTS (SELECT 1 FROM erp_role_module rm WHERE rm.role_id=r.role_id AND rm.module_id=m.module_id)
         ORDER BY m.sort_order,m.module_name`,values:[access.tenantId,orgId,access.auth.email]}),
    ctx.broker('core_erp','query',{text:`SELECT DISTINCT rp.*,r.role_name FROM erp_user_role ur JOIN erp_role r ON r.role_id=ur.role_id JOIN erp_role_permission rp ON rp.role_id=r.role_id
      WHERE ur.tenant_id=$1 AND ur.organisation_id=$2 AND lower(ur.email)=lower($3) AND r.is_active=true
      AND ur.valid_from<=CURRENT_DATE AND (ur.valid_to IS NULL OR ur.valid_to>=CURRENT_DATE)
      AND rp.valid_from<=CURRENT_DATE AND (rp.valid_to IS NULL OR rp.valid_to>=CURRENT_DATE)`,values:[access.tenantId,orgId,access.auth.email]})
  ]);
  return {is_administrator:administrator,roles:roles.rows,modules:modules.rows,permissions:permissions.rows};
};
