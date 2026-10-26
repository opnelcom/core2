'use strict';
const {authTenant,requireAdmin}=require('../_shared/erp');
module.exports=async ctx=>{
  if(ctx.req.method!=='GET')return ctx.send(405,{error:'GET required'});
  const access=await authTenant(ctx);if(access.status)return ctx.send(access.status,access.body);
  const denied=requireAdmin(access);if(denied)return ctx.send(denied.status,denied.body);
  const org=ctx.query.organisation_id;if(!org)return ctx.send(400,{error:'organisation_id is required'});
  const values=[access.tenantId,org];
  const [users,roles,divisions]=await Promise.all([
    ctx.broker('core_erp','query',{text:`SELECT u.*,
      (u.is_enabled AND (u.valid_from IS NULL OR u.valid_from<=CURRENT_DATE) AND (u.valid_to IS NULL OR u.valid_to>=CURRENT_DATE)) is_current,
      (SELECT count(DISTINCT ur.role_id)::integer FROM erp_user_role ur JOIN erp_role r ON r.role_id=ur.role_id
        AND r.tenant_id=ur.tenant_id AND r.organisation_id=ur.organisation_id
        WHERE ur.tenant_id=u.tenant_id AND ur.organisation_id=u.organisation_id AND lower(ur.email)=u.email
          AND r.is_active=true AND ur.valid_from<=CURRENT_DATE AND (ur.valid_to IS NULL OR ur.valid_to>=CURRENT_DATE)) active_roles,
      (SELECT count(DISTINCT ud.division_id)::integer FROM erp_user_division ud JOIN erp_division d ON d.division_id=ud.division_id
        AND d.tenant_id=ud.tenant_id AND d.organisation_id=ud.organisation_id
        WHERE ud.user_id=u.user_id AND ud.tenant_id=u.tenant_id AND ud.organisation_id=u.organisation_id
          AND d.workflow_status<>'deleted' AND (ud.valid_from IS NULL OR ud.valid_from<=CURRENT_DATE)
          AND (ud.valid_to IS NULL OR ud.valid_to>=CURRENT_DATE)) active_divisions
      FROM erp_organisation_user u WHERE u.tenant_id=$1 AND u.organisation_id=$2 ORDER BY lower(u.known_name),u.email`,values}),
    ctx.broker('core_erp','query',{text:'SELECT * FROM erp_user_role WHERE tenant_id=$1 AND organisation_id=$2 ORDER BY lower(email),valid_from',values}),
    ctx.broker('core_erp','query',{text:'SELECT * FROM erp_user_division WHERE tenant_id=$1 AND organisation_id=$2 ORDER BY user_id,valid_from',values})
  ]);
  return {users:users.rows,role_users:roles.rows,user_divisions:divisions.rows};
};
module.exports=require('../_shared/context').withContext(module.exports);
