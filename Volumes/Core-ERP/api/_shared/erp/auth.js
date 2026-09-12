'use strict';

const {ensureTenantSeed}=require('./seeding');

async function authTenant(ctx){
  const auth=ctx.auth();
  if(!auth)return {status:401,body:{error:'Authentication required'}};
  const tenantId=ctx.cookies.current_tenant;
  if(!tenantId)return {status:400,body:{error:'No current tenant'}};
  const access=await ctx.broker('core_saas','query',{
    brokerProfile:'core_saas',
    text:`SELECT t.tenant_id,tu.tenant_user_type
          FROM core_tenant t
          JOIN core_tenant_user tu ON tu.tenant_id=t.tenant_id
          WHERE t.tenant_id=$1
          AND lower(tu.email)=lower($2)
          AND t.status='active'
          AND tu.status='active'`,
    values:[tenantId,auth.email]
  });
  if(!access.rowCount)return {status:403,body:{error:'No access to active tenant'}};
  const result={auth,tenantId,role:access.rows[0].tenant_user_type};
  await ensureTenantSeed(ctx,result);
  result.tenantAdministrator=['administrator','administration_user','admin','owner'].includes(String(result.role||'').toLowerCase());
  const organisationId=ctx.body?.organisation_id||ctx.query?.organisation_id||ctx.body?.target_organisation_id||ctx.body?.access_organisation_id||null;
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
