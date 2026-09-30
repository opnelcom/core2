'use strict';
const {ensureTenantAuditColumns}=require('../../_shared/tenant-schema');
const {defaultTenantIconPreset,sanitizeTenantIconPreset,sanitizeTenantIconSvg}=require('../../_shared/tenant-icon');

function sessionMaxAge(config){
  const seconds=Number(config.sessionMaxAgeSeconds||60*60*24*30);
  return Number.isFinite(seconds)&&seconds>0?Math.trunc(seconds):60*60*24*30;
}

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const a=ctx.auth();
  if(!a)return ctx.send(401,{error:'Authentication required'});
  await ensureTenantAuditColumns(ctx);
  const tenantName=String(ctx.body.tenant_name||'').trim();
  const tenantDescription=String(ctx.body.tenant_description||'').trim();
  const themeId=ctx.body.theme_id||null;
  const tenantIconSvg=sanitizeTenantIconSvg(ctx.body.tenant_icon_svg);
  const requestedTenantIconPreset=sanitizeTenantIconPreset(ctx.body.tenant_icon_preset);
  const tenantIconPreset=tenantIconSvg?null:(requestedTenantIconPreset||defaultTenantIconPreset);
  if(tenantName.length<2)return ctx.send(400,{error:'Tenant name required'});
  if(tenantDescription.length>2000)return ctx.send(400,{error:'Tenant description must be 2,000 characters or fewer'});

  const r=await ctx.broker('core_saas','transaction',{statements:[
    {text:`WITH t AS (
             INSERT INTO core_tenant(tenant_name,tenant_description,tenant_type,theme_id,tenant_icon_preset,tenant_icon_svg,created_by_user_id,updated_by_user_id)
             SELECT $1,$7,'public_tenant',COALESCE($2::uuid,(SELECT theme_id FROM core_theme WHERE theme_name='Core Default' LIMIT 1)),$5,$6,$4,$4
             WHERE $2::uuid IS NULL OR EXISTS (SELECT 1 FROM core_theme WHERE theme_id=$2::uuid AND status='active')
             RETURNING tenant_id,tenant_name,tenant_description,tenant_type,theme_id,tenant_icon_preset,tenant_icon_svg,status,created_by_user_id,updated_by_user_id
           ), tu AS (
             INSERT INTO core_tenant_user(tenant_id,email,tenant_user_type,added_by_user_id)
             SELECT tenant_id,$3,'tenant_administrator',$4 FROM t
           ), ta AS (
             INSERT INTO core_tenant_application(tenant_id,application_id)
             SELECT t.tenant_id,a.application_id FROM t CROSS JOIN core_application a
             WHERE a.status='active' AND a.application_type='public_application'
             RETURNING tenant_application_id
           )
           SELECT * FROM t`,
      values:[tenantName,themeId,a.email,a.user_id,tenantIconPreset,tenantIconSvg||null,tenantDescription||null]}
  ]});

  const tenant=r.results[0].rows[0];
  if(!tenant)return ctx.send(400,{error:'Invalid theme'});
  ctx.setCookie('current_tenant',tenant.tenant_id,{secure:ctx.config.cookieSecure===true,maxAge:sessionMaxAge(ctx.config)});
  return ctx.send(201,{tenant});
};
