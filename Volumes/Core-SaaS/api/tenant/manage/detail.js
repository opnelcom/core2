'use strict';
const {adminRoles,requireTenantAccess}=require('../../_shared/tenant');
const {ensureTenantAuditColumns}=require('../../_shared/tenant-schema');

module.exports=async ctx=>{
  const tenantId=ctx.query.tenant_id||ctx.body.tenant_id||ctx.cookies.current_tenant;
  const access=await requireTenantAccess(ctx,tenantId);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureTenantAuditColumns(ctx);
  const canManage=access.canManage;
  const appTypes=access.auth.user_type==='administration_user'
    ? ['public_application','administration_application']
    : ['public_application'];
  await ctx.broker('core_saas','query',{text:`ALTER TABLE core_application ADD COLUMN IF NOT EXISTS application_description text`});
  await ctx.broker('core_saas','query',{text:`ALTER TABLE core_application ADD COLUMN IF NOT EXISTS application_icon_svg text`});

  const tenant=await ctx.broker('core_saas','query',{
    text:`SELECT t.tenant_id,t.tenant_name,t.tenant_type,t.theme_id,th.theme_name,th.css_file,t.status,
                 t.created_by_user_id,t.updated_by_user_id,$2::text tenant_user_type
          FROM core_tenant t
          LEFT JOIN core_theme th ON th.theme_id=t.theme_id
          WHERE t.tenant_id=$1`,
    values:[tenantId,access.access.tenant_user_type]
  });

  const users=await ctx.broker('core_saas','query',{
    text:`SELECT tenant_user_id,email,tenant_user_type,status,added_at,updated_at
          FROM core_tenant_user
          WHERE tenant_id=$1
          ORDER BY email`,
    values:[tenantId]
  });

  const apps=await ctx.broker('core_saas','query',{
    text:`SELECT a.application_id,a.application_code,a.application_name,a.application_description,a.application_icon_svg,a.application_type,a.route_prefix,
                 COALESCE(ta.status,'disabled') tenant_application_status,
                 ta.tenant_application_id,
                 COUNT(tau.tenant_application_user_id)::int assigned_user_count
          FROM core_application a
          LEFT JOIN core_tenant_application ta ON ta.application_id=a.application_id AND ta.tenant_id=$1
          LEFT JOIN core_tenant_application_user tau ON tau.tenant_application_id=ta.tenant_application_id
          WHERE a.status='active' AND a.application_type = ANY($2::text[])
          GROUP BY a.application_id,a.application_code,a.application_name,a.application_description,a.application_icon_svg,a.application_type,a.route_prefix,ta.status,ta.tenant_application_id
          ORDER BY a.application_type,a.application_name`,
    values:[tenantId,appTypes]
  });

  const appUsers=await ctx.broker('core_saas','query',{
    text:`SELECT ta.application_id,tau.tenant_user_id
          FROM core_tenant_application ta
          JOIN core_tenant_application_user tau ON tau.tenant_application_id=ta.tenant_application_id
          WHERE ta.tenant_id=$1`,
    values:[tenantId]
  });

  const themes=await ctx.broker('core_saas','query',{
    text:`SELECT theme_id,theme_name,css_file,status
          FROM core_theme
          WHERE status='active'
          ORDER BY theme_name`,
    values:[]
  });

  return {
    tenant:{...(tenant.rows[0]||access.access),can_manage:canManage},
    themes:themes.rows,
    roles:['tenant_user','tenant_administrator','owner'],
    statuses:['active','disabled'],
    can_manage:canManage,
    users:users.rows,
    applications:apps.rows,
    application_users:appUsers.rows,
    administrator_roles:adminRoles
  };
};
