'use strict';

async function authTenant(ctx,organisationIdOverride=null){
  const membership=await ctx.tenantSession();
  if(membership.status)return membership;
  const {auth,tenantId}=membership;
  const result={auth,tenantId};
  const organisationId=organisationIdOverride||ctx.body?.organisation_id||ctx.query?.organisation_id||ctx.body?.target_organisation_id||ctx.body?.access_organisation_id||null;
  result.organisationId=organisationId;
  result.setupAdministrator=false;
  if(organisationId){
    const setupAccess=await ctx.broker('core_erp','query',{
      text:`SELECT 1 FROM erp_user_role ur JOIN erp_role role ON role.role_id=ur.role_id
            WHERE ur.tenant_id=$1 AND ur.organisation_id=$2 AND lower(ur.email)=lower($3)
              AND role.is_admin=true AND role.is_active=true
              AND ur.valid_from<=CURRENT_DATE AND (ur.valid_to IS NULL OR ur.valid_to>=CURRENT_DATE)
            LIMIT 1`,
      values:[tenantId,organisationId,auth.email]
    });
    result.setupAdministrator=!!setupAccess.rowCount;
  }
  return result;
}

module.exports={authTenant};
