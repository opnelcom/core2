'use strict';

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
  return {auth,tenantId,role:access.rows[0].tenant_user_type};
}

module.exports={authTenant};
