'use strict';
const {requireAdmin,clean,tenantTypes,rowStatuses}=require('../_shared/admin');

module.exports=async ctx=>{
  const admin=requireAdmin(ctx);
  if(admin.status)return ctx.send(admin.status,admin.body);

  if(ctx.req.method==='GET'){
    const r=await ctx.broker('core_saas','query',{
      text:`SELECT t.tenant_id,t.tenant_name,t.tenant_type,t.theme_id,th.theme_name,th.css_file,t.status,
                   t.created_by_user_id,t.updated_by_user_id,t.created_at,t.updated_at
            FROM core_tenant t
            LEFT JOIN core_theme th ON th.theme_id=t.theme_id
            ORDER BY t.tenant_name`
    });
    return {tenants:r.rows};
  }

  if(ctx.req.method!=='POST'&&ctx.req.method!=='PATCH')return ctx.send(405,{error:'GET, POST or PATCH required'});
  const id=ctx.body.tenant_id||null;
  const name=clean(ctx.body.tenant_name);
  const type=ctx.body.tenant_type||'public_tenant';
  const themeId=ctx.body.theme_id||null;
  const status=ctx.body.status||'active';
  if(!name)return ctx.send(400,{error:'Tenant name is required'});
  if(!tenantTypes.includes(type))return ctx.send(400,{error:'Invalid tenant type'});
  if(!rowStatuses.includes(status))return ctx.send(400,{error:'Invalid status'});
  if(themeId){
    const theme=await ctx.broker('core_saas','query',{
      text:`SELECT theme_id FROM core_theme WHERE theme_id=$1 AND status='active'`,
      values:[themeId]
    });
    if(!theme.rowCount)return ctx.send(400,{error:'Invalid theme'});
  }

  const r=await ctx.broker('core_saas','query',{
    text:`WITH saved AS (
            INSERT INTO core_tenant(tenant_id,tenant_name,tenant_type,theme_id,status,created_by_user_id,updated_by_user_id)
            VALUES(COALESCE($1::uuid,gen_random_uuid()),$2,$3,COALESCE($4::uuid,(SELECT theme_id FROM core_theme WHERE theme_name='Core Default' LIMIT 1)),$5,$6,$6)
            ON CONFLICT(tenant_id) DO UPDATE
            SET tenant_name=excluded.tenant_name,tenant_type=excluded.tenant_type,theme_id=excluded.theme_id,status=excluded.status,updated_by_user_id=excluded.updated_by_user_id,updated_at=now()
            RETURNING tenant_id,tenant_name,tenant_type,theme_id,status,created_by_user_id,updated_by_user_id,created_at,updated_at
          )
          SELECT s.tenant_id,s.tenant_name,s.tenant_type,s.theme_id,th.theme_name,th.css_file,s.status,
                 s.created_by_user_id,s.updated_by_user_id,s.created_at,s.updated_at
          FROM saved s
          LEFT JOIN core_theme th ON th.theme_id=s.theme_id`,
    values:[id,name,type,themeId,status,admin.auth.user_id]
  });
  return {tenant:r.rows[0]};
};
