'use strict';
const {requireAdmin,clean,tenantUserTypes,rowStatuses}=require('../_shared/admin');

module.exports=async ctx=>{
  const admin=requireAdmin(ctx);
  if(admin.status)return ctx.send(admin.status,admin.body);
  if(ctx.req.method==='GET'){
    const r=await ctx.broker('core_saas','query',{
      text:`SELECT tu.tenant_user_id,tu.tenant_id,t.tenant_name,tu.email,tu.tenant_user_type,tu.status,tu.added_at,tu.updated_at
            FROM core_tenant_user tu JOIN core_tenant t ON t.tenant_id=tu.tenant_id
            ORDER BY t.tenant_name,tu.email`
    });
    return {tenant_users:r.rows};
  }
  if(ctx.req.method!=='POST'&&ctx.req.method!=='PATCH')return ctx.send(405,{error:'GET, POST or PATCH required'});
  const id=ctx.body.tenant_user_id||null;
  const tenantId=ctx.body.tenant_id;
  const email=clean(ctx.body.email)?.toLowerCase();
  const role=ctx.body.tenant_user_type||'tenant_user';
  const status=ctx.body.status||'active';
  if(!tenantId||!email||!email.includes('@'))return ctx.send(400,{error:'Tenant and valid email are required'});
  if(!tenantUserTypes.includes(role))return ctx.send(400,{error:'Invalid tenant user role'});
  if(!rowStatuses.includes(status))return ctx.send(400,{error:'Invalid status'});
  const r=await ctx.broker('core_saas','query',{
    text:`INSERT INTO core_tenant_user(tenant_user_id,tenant_id,email,tenant_user_type,status,added_by_user_id)
          VALUES(COALESCE($1::uuid,gen_random_uuid()),$2,$3,$4,$5,$6)
          ON CONFLICT(tenant_id,email) DO UPDATE
          SET tenant_user_type=excluded.tenant_user_type,status=excluded.status,updated_at=now()
          RETURNING tenant_user_id,tenant_id,email,tenant_user_type,status,added_at,updated_at`,
    values:[id,tenantId,email,role,status,admin.auth.user_id]
  });
  return {tenant_user:r.rows[0]};
};
