'use strict';
const {requireTenantAdmin,statuses}=require('../../_shared/tenant');
const {ensureTenantAuditColumns}=require('../../_shared/tenant-schema');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST'&&ctx.req.method!=='PATCH')return ctx.send(405,{error:'POST or PATCH required'});
  const tenantId=ctx.body.tenant_id;
  const access=await requireTenantAdmin(ctx,tenantId);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureTenantAuditColumns(ctx);

  const tenantName=String(ctx.body.tenant_name||'').trim();
  const status=ctx.body.status||access.access.status;
  const themeId=String(ctx.body.theme_id||'').trim();
  if(tenantName.length<2)return ctx.send(400,{error:'Tenant name required'});
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
            SET tenant_name=$2,theme_id=$3::uuid,status=$4,updated_by_user_id=$5,updated_at=now()
            WHERE tenant_id=$1
            RETURNING tenant_id,tenant_name,tenant_type,theme_id,status,created_by_user_id,updated_by_user_id,updated_at
          )
          SELECT u.tenant_id,u.tenant_name,u.tenant_type,u.theme_id,u.status,u.created_by_user_id,u.updated_by_user_id,u.updated_at,
                 th.theme_name,th.css_file
          FROM updated u
          LEFT JOIN core_theme th ON th.theme_id=u.theme_id`,
    values:[tenantId,tenantName,themeId,status,access.auth.user_id]
  });
  return {tenant:r.rows[0]};
};
