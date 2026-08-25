'use strict';
const {requireAdmin,ensureApplicationColumns}=require('../_shared/admin');

module.exports=async ctx=>{
  const admin=requireAdmin(ctx);
  if(admin.status)return ctx.send(admin.status,admin.body);
  await ensureApplicationColumns(ctx);

  const r=await ctx.broker('core_saas','transaction',{statements:[
    {text:`SELECT theme_id,theme_name,css_file,status FROM core_theme ORDER BY theme_name`},
    {text:`SELECT t.tenant_id,t.tenant_name,t.tenant_type,t.theme_id,th.theme_name,th.css_file,t.status
           FROM core_tenant t
           LEFT JOIN core_theme th ON th.theme_id=t.theme_id
           ORDER BY t.tenant_name`},
    {text:`SELECT user_id,email,known_name,full_name,user_type,status FROM core_user ORDER BY email`},
    {text:`SELECT application_id,application_code,application_name,application_description,application_icon_svg,application_type,route_prefix,status FROM core_application ORDER BY application_name`},
    {text:`SELECT tenant_user_id,tenant_id,email,tenant_user_type,status FROM core_tenant_user ORDER BY email`},
    {text:`SELECT ta.tenant_application_id,ta.tenant_id,t.tenant_name,ta.application_id,a.application_name,a.application_code,ta.status
           FROM core_tenant_application ta
           JOIN core_tenant t ON t.tenant_id=ta.tenant_id
           JOIN core_application a ON a.application_id=ta.application_id
           ORDER BY t.tenant_name,a.application_name`}
  ]});

  return {
    themes:r.results[0].rows,
    tenants:r.results[1].rows,
    users:r.results[2].rows,
    applications:r.results[3].rows,
    tenant_users:r.results[4].rows,
    tenant_applications:r.results[5].rows
  };
};
