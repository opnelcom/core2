'use strict';
const {requireAdmin,rowStatuses}=require('../_shared/admin');

module.exports=async ctx=>{
  const admin=requireAdmin(ctx);
  if(admin.status)return ctx.send(admin.status,admin.body);
  if(ctx.req.method==='GET'){
    const r=await ctx.broker('core_saas','query',{
      text:`SELECT ta.tenant_application_id,ta.tenant_id,t.tenant_name,ta.application_id,a.application_name,a.application_code,ta.status,ta.created_at
            FROM core_tenant_application ta
            JOIN core_tenant t ON t.tenant_id=ta.tenant_id
            JOIN core_application a ON a.application_id=ta.application_id
            ORDER BY t.tenant_name,a.application_name`
    });
    return {tenant_applications:r.rows};
  }
  if(ctx.req.method!=='POST'&&ctx.req.method!=='PATCH')return ctx.send(405,{error:'GET, POST or PATCH required'});
  const id=ctx.body.tenant_application_id||null;
  const tenantId=ctx.body.tenant_id;
  const applicationId=ctx.body.application_id;
  const status=ctx.body.status||'active';
  if(!tenantId||!applicationId)return ctx.send(400,{error:'Tenant and application are required'});
  if(!rowStatuses.includes(status))return ctx.send(400,{error:'Invalid status'});
  const r=await ctx.broker('core_saas','query',{
    text:`INSERT INTO core_tenant_application(tenant_application_id,tenant_id,application_id,status)
          VALUES(COALESCE($1::uuid,gen_random_uuid()),$2,$3,$4)
          ON CONFLICT(tenant_id,application_id) DO UPDATE SET status=excluded.status
          RETURNING tenant_application_id,tenant_id,application_id,status,created_at`,
    values:[id,tenantId,applicationId,status]
  });
  return {tenant_application:r.rows[0]};
};
