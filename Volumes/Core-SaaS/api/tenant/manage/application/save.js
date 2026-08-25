'use strict';
const {requireTenantAdmin,statuses}=require('../../../_shared/tenant');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST'&&ctx.req.method!=='PATCH')return ctx.send(405,{error:'POST or PATCH required'});
  const tenantId=ctx.body.tenant_id;
  const applicationId=ctx.body.application_id;
  const status=ctx.body.status||'active';
  const access=await requireTenantAdmin(ctx,tenantId);
  if(access.status)return ctx.send(access.status,access.body);
  if(!applicationId)return ctx.send(400,{error:'application_id required'});
  if(!statuses.includes(status))return ctx.send(400,{error:'Invalid application status'});

  const r=await ctx.broker('core_saas','query',{
    text:`INSERT INTO core_tenant_application(tenant_id,application_id,status)
          VALUES($1,$2,$3)
          ON CONFLICT(tenant_id,application_id) DO UPDATE SET status=excluded.status
          RETURNING tenant_application_id,tenant_id,application_id,status`,
    values:[tenantId,applicationId,status]
  });
  return {tenant_application:r.rows[0]};
};
