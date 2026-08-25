module.exports=async ctx=>{
  const a=ctx.auth();
  if(!a||a.user_type!=='administration_user')return ctx.send(403,{error:'Core administrator required'});
  const r=await ctx.broker('core_saas','query',{text:`
    SELECT
      (SELECT count(*) FROM core_user) users,
      (SELECT count(*) FROM core_user WHERE user_type='administration_user') admin_users,
      (SELECT count(*) FROM core_user WHERE user_type='standard_user') standard_users,
      (SELECT count(*) FROM core_tenant) tenants,
      (SELECT count(*) FROM core_tenant WHERE tenant_type='personal_tenant') personal_tenants,
      (SELECT count(*) FROM core_tenant WHERE tenant_type='public_tenant') public_tenants,
      (SELECT count(*) FROM core_application) applications,
      (SELECT count(*) FROM core_application WHERE application_type='public_application') public_applications,
      (SELECT count(*) FROM core_application WHERE application_type='administration_application') admin_applications,
      (SELECT count(*) FROM core_theme) themes
  `});
  return r.rows[0];
};
