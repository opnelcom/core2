'use strict';

const adminRoles=['owner','tenant_administrator'];
const tenantRoles=['owner','tenant_administrator','tenant_user'];
const statuses=['active','disabled'];
const tenantTypes=['personal_tenant','public_tenant'];

async function tenantAccess(ctx,tenantId,email){
  const r=await ctx.broker('core_saas','query',{
    text:`SELECT t.tenant_id,t.tenant_name,t.tenant_type,t.theme_id,th.theme_name,th.css_file,t.status,tu.tenant_user_type
          FROM core_tenant t
          JOIN core_tenant_user tu ON tu.tenant_id=t.tenant_id
          LEFT JOIN core_theme th ON th.theme_id=t.theme_id
          WHERE t.tenant_id=$1 AND lower(tu.email)=lower($2) AND tu.status='active'`,
    values:[tenantId,email]
  });
  return r.rows[0]||null;
}

async function requireTenantAccess(ctx,tenantId){
  const a=ctx.auth();
  if(!a)return {status:401,body:{error:'Authentication required'}};
  if(!tenantId)return {status:400,body:{error:'tenant_id required'}};
  const access=await tenantAccess(ctx,tenantId,a.email);
  if(!access)return {status:403,body:{error:'No access to tenant'}};
  return {auth:a,access,canManage:adminRoles.includes(access.tenant_user_type)};
}

async function requireTenantAdmin(ctx,tenantId){
  const access=await requireTenantAccess(ctx,tenantId);
  if(access.status)return access;
  if(!access.canManage)return {status:403,body:{error:'Tenant administrator access required'}};
  return access;
}

module.exports={adminRoles,tenantRoles,statuses,tenantTypes,tenantAccess,requireTenantAccess,requireTenantAdmin};
