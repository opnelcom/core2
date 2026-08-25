'use strict';
const {adminRoles}=require('../../_shared/tenant');
const {ensureTenantAuditColumns}=require('../../_shared/tenant-schema');

module.exports=async ctx=>{
  const a=ctx.auth();
  if(!a)return ctx.send(401,{error:'Authentication required'});
  await ensureTenantAuditColumns(ctx);

  const r=await ctx.broker('core_saas','query',{
    text:`SELECT t.tenant_id,t.tenant_name,t.tenant_type,t.status,t.theme_id,th.theme_name,th.css_file,tu.tenant_user_type,
                 tu.status tenant_user_status,t.created_by_user_id,t.updated_by_user_id,t.created_at,t.updated_at
          FROM core_tenant t
          JOIN core_tenant_user tu ON tu.tenant_id=t.tenant_id
          LEFT JOIN core_theme th ON th.theme_id=t.theme_id
          WHERE lower(tu.email)=lower($1) AND tu.status='active'
          ORDER BY t.tenant_name`,
    values:[a.email]
  });

  const themes=await ctx.broker('core_saas','query',{
    text:`SELECT theme_id,theme_name,css_file,status
          FROM core_theme
          WHERE status='active'
          ORDER BY theme_name`,
    values:[]
  });

  return {tenants:r.rows.map(t=>({...t,can_manage:adminRoles.includes(t.tenant_user_type)})),themes:themes.rows};
};
