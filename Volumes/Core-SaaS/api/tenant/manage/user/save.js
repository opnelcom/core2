'use strict';
const {requireTenantAdmin,tenantRoles,statuses}=require('../../../_shared/tenant');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST'&&ctx.req.method!=='PATCH')return ctx.send(405,{error:'POST or PATCH required'});
  const tenantId=ctx.body.tenant_id;
  const access=await requireTenantAdmin(ctx,tenantId);
  if(access.status)return ctx.send(access.status,access.body);

  const email=String(ctx.body.email||'').trim().toLowerCase();
  const role=ctx.body.tenant_user_type||'tenant_user';
  const status=ctx.body.status||'active';
  if(!email.includes('@'))return ctx.send(400,{error:'Valid email required'});
  if(!tenantRoles.includes(role))return ctx.send(400,{error:'Invalid tenant user role'});
  if(!statuses.includes(status))return ctx.send(400,{error:'Invalid tenant user status'});

  const r=await ctx.broker('core_saas','query',{
    text:`INSERT INTO core_tenant_user(tenant_id,email,tenant_user_type,status,added_by_user_id)
          VALUES($1,$2,$3,$4,$5)
          ON CONFLICT(tenant_id,email) DO UPDATE
          SET tenant_user_type=excluded.tenant_user_type,status=excluded.status,updated_at=now()
          RETURNING tenant_user_id,email,tenant_user_type,status,added_at,updated_at`,
    values:[tenantId,email,role,status,access.auth.user_id]
  });
  return {user:r.rows[0]};
};
