'use strict';
const {requireAdmin}=require('../_shared/admin');

module.exports=async ctx=>{
  const admin=requireAdmin(ctx);
  if(admin.status)return ctx.send(admin.status,admin.body);
  if(ctx.req.method==='GET'){
    const r=await ctx.broker('core_saas','query',{
      text:`SELECT tau.tenant_application_user_id,tau.tenant_application_id,ta.tenant_id,t.tenant_name,ta.application_id,a.application_name,tau.tenant_user_id,tu.email,tau.created_at
            FROM core_tenant_application_user tau
            JOIN core_tenant_application ta ON ta.tenant_application_id=tau.tenant_application_id
            JOIN core_tenant t ON t.tenant_id=ta.tenant_id
            JOIN core_application a ON a.application_id=ta.application_id
            JOIN core_tenant_user tu ON tu.tenant_user_id=tau.tenant_user_id
            ORDER BY t.tenant_name,a.application_name,tu.email`
    });
    return {tenant_application_users:r.rows};
  }
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'GET or POST required'});
  const tenantApplicationId=ctx.body.tenant_application_id;
  const tenantUserId=ctx.body.tenant_user_id;
  const enabled=ctx.body.enabled!==false;
  if(!tenantApplicationId||!tenantUserId)return ctx.send(400,{error:'Tenant application and tenant user are required'});
  if(!enabled){
    const r=await ctx.broker('core_saas','query',{text:`DELETE FROM core_tenant_application_user WHERE tenant_application_id=$1 AND tenant_user_id=$2`,values:[tenantApplicationId,tenantUserId]});
    return {enabled:false,rowCount:r.rowCount};
  }
  const r=await ctx.broker('core_saas','query',{
    text:`INSERT INTO core_tenant_application_user(tenant_application_id,tenant_user_id)
          VALUES($1,$2)
          ON CONFLICT DO NOTHING
          RETURNING tenant_application_user_id,tenant_application_id,tenant_user_id,created_at`,
    values:[tenantApplicationId,tenantUserId]
  });
  return {enabled:true,tenant_application_user:r.rows[0]||null};
};
