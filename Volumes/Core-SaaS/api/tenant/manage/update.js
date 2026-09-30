'use strict';
const {requireTenantAdmin,statuses}=require('../../_shared/tenant');
const {ensureTenantAuditColumns}=require('../../_shared/tenant-schema');
const {defaultTenantIconPreset,sanitizeTenantIconPreset,sanitizeTenantIconSvg}=require('../../_shared/tenant-icon');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST'&&ctx.req.method!=='PATCH')return ctx.send(405,{error:'POST or PATCH required'});
  if(!ctx.auth())return ctx.send(401,{error:'Authentication required'});
  await ensureTenantAuditColumns(ctx);
  const tenantId=ctx.body.tenant_id;
  const access=await requireTenantAdmin(ctx,tenantId);
  if(access.status)return ctx.send(access.status,access.body);

  const tenantName=String(ctx.body.tenant_name||'').trim();
  const updateTenantDescription=Object.prototype.hasOwnProperty.call(ctx.body,'tenant_description');
  const tenantDescription=updateTenantDescription?String(ctx.body.tenant_description||'').trim():undefined;
  const status=ctx.body.status||access.access.status;
  const themeId=String(ctx.body.theme_id||'').trim();
  const hasTenantIconSvg=Object.prototype.hasOwnProperty.call(ctx.body,'tenant_icon_svg');
  const hasTenantIconPreset=Object.prototype.hasOwnProperty.call(ctx.body,'tenant_icon_preset');
  const updateTenantIcon=hasTenantIconSvg||hasTenantIconPreset;
  const tenantIconSvg=updateTenantIcon?sanitizeTenantIconSvg(hasTenantIconSvg?ctx.body.tenant_icon_svg:null):undefined;
  const requestedTenantIconPreset=updateTenantIcon?sanitizeTenantIconPreset(hasTenantIconPreset?ctx.body.tenant_icon_preset:null):undefined;
  const tenantIconPreset=updateTenantIcon?(tenantIconSvg?null:(requestedTenantIconPreset||defaultTenantIconPreset)):undefined;
  if(tenantName.length<2)return ctx.send(400,{error:'Tenant name required'});
  if(tenantDescription!==undefined&&tenantDescription.length>2000)return ctx.send(400,{error:'Tenant description must be 2,000 characters or fewer'});
  if(!statuses.includes(status))return ctx.send(400,{error:'Invalid tenant status'});
  if(!themeId)return ctx.send(400,{error:'Theme required'});
  const theme=await ctx.broker('core_saas','query',{
    text:`SELECT theme_id FROM core_theme WHERE theme_id=$1 AND status='active'`,
    values:[themeId]
  });
  if(!theme.rowCount)return ctx.send(400,{error:'Invalid theme'});

  const r=await ctx.broker('core_saas','query',{
    text:`WITH updated AS (
            UPDATE core_tenant
            SET tenant_name=$2,theme_id=$3::uuid,status=$4,updated_by_user_id=$5,
                tenant_icon_preset=CASE WHEN $6::boolean THEN $7 ELSE tenant_icon_preset END,
                tenant_icon_svg=CASE WHEN $6::boolean THEN $8 ELSE tenant_icon_svg END,
                tenant_description=CASE WHEN $9::boolean THEN $10 ELSE tenant_description END,
                updated_at=now()
            WHERE tenant_id=$1
            RETURNING tenant_id,tenant_name,tenant_description,tenant_type,theme_id,tenant_icon_preset,tenant_icon_svg,status,created_by_user_id,updated_by_user_id,updated_at
          )
          SELECT u.tenant_id,u.tenant_name,u.tenant_description,u.tenant_type,u.theme_id,u.tenant_icon_preset,u.tenant_icon_svg,u.status,u.created_by_user_id,u.updated_by_user_id,u.updated_at,
                 th.theme_name,th.css_file
          FROM updated u
          LEFT JOIN core_theme th ON th.theme_id=u.theme_id`,
    values:[tenantId,tenantName,themeId,status,access.auth.user_id,updateTenantIcon,tenantIconPreset||null,tenantIconSvg||null,updateTenantDescription,tenantDescription||null]
  });
  return {tenant:r.rows[0]};
};
