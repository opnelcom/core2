'use strict';
const {authTenant,isAdministrator}=require('../_shared/erp');
const {permissionModuleLinksSql,accessibleModulesSql}=require('../_shared/erp/permission-modules');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  if(!orgId)return ctx.send(400,{error:'organisation_id is required'});
  const administrator=isAdministrator(access);
  const [roles,modules,permissions,moduleLinks]=await Promise.all([
    ctx.broker('core_erp','query',{text:`SELECT DISTINCT r.* FROM erp_user_role ur JOIN erp_role r ON r.role_id=ur.role_id
      WHERE ur.tenant_id=$1 AND ur.organisation_id=$2 AND lower(ur.email)=lower($3) AND r.tenant_id=$1 AND r.organisation_id=$2 AND r.is_active=true
      AND ur.valid_from<=CURRENT_DATE AND (ur.valid_to IS NULL OR ur.valid_to>=CURRENT_DATE) ORDER BY r.role_name`,values:[access.tenantId,orgId,access.auth.email]}),
    ctx.broker('core_erp','query',{text:accessibleModulesSql()+' ORDER BY module.sort_order,module.module_name',values:[access.tenantId,orgId,access.auth.email]}),
    ctx.broker('core_erp','query',{text:`SELECT DISTINCT rp.*,r.role_name FROM erp_user_role ur JOIN erp_role r ON r.role_id=ur.role_id JOIN erp_role_permission rp ON rp.role_id=r.role_id
      WHERE ur.tenant_id=$1 AND ur.organisation_id=$2 AND lower(ur.email)=lower($3) AND r.tenant_id=$1 AND r.organisation_id=$2 AND r.is_active=true
      AND ur.valid_from<=CURRENT_DATE AND (ur.valid_to IS NULL OR ur.valid_to>=CURRENT_DATE)
      AND rp.tenant_id=$1 AND rp.organisation_id=$2 AND rp.valid_from<=CURRENT_DATE AND (rp.valid_to IS NULL OR rp.valid_to>=CURRENT_DATE)`,values:[access.tenantId,orgId,access.auth.email]}),
    ctx.broker('core_erp','query',{text:permissionModuleLinksSql(),values:[access.tenantId,orgId,access.auth.email]})
  ]);
  return {is_administrator:administrator,roles:roles.rows.map(role=>({...role,module_ids:moduleLinks.rows.filter(link=>link.role_id===role.role_id).map(link=>link.module_id)})),modules:modules.rows,permissions:permissions.rows};
};

module.exports=require("../_shared/context").withContext(module.exports);
