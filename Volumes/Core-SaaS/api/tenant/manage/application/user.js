'use strict';
const {requireTenantAdmin}=require('../../../_shared/tenant');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const tenantId=ctx.body.tenant_id;
  const applicationId=ctx.body.application_id;
  const tenantUserId=ctx.body.tenant_user_id;
  const enabled=ctx.body.enabled===true;
  const access=await requireTenantAdmin(ctx,tenantId);
  if(access.status)return ctx.send(access.status,access.body);
  if(!applicationId||!tenantUserId)return ctx.send(400,{error:'application_id and tenant_user_id required'});

  const member=await ctx.broker('core_saas','query',{
    text:`SELECT tenant_user_id FROM core_tenant_user WHERE tenant_id=$1 AND tenant_user_id=$2`,
    values:[tenantId,tenantUserId]
  });
  if(!member.rowCount)return ctx.send(404,{error:'Tenant user not found'});

  if(enabled){
    const r=await ctx.broker('core_saas','transaction',{statements:[
      {text:`INSERT INTO core_tenant_application(tenant_id,application_id,status)
             VALUES($1,$2,'active')
             ON CONFLICT(tenant_id,application_id) DO UPDATE SET status='active'
             RETURNING tenant_application_id`,
       values:[tenantId,applicationId]},
      {text:`WITH ta AS (
               SELECT tenant_application_id FROM core_tenant_application WHERE tenant_id=$1 AND application_id=$2
             )
             INSERT INTO core_tenant_application_user(tenant_application_id,tenant_user_id)
             SELECT tenant_application_id,$3 FROM ta
             ON CONFLICT DO NOTHING
             RETURNING tenant_application_user_id`,
       values:[tenantId,applicationId,tenantUserId]}
    ]});
    return {enabled:true,result:r.results.map(x=>x.rowCount)};
  }

  const r=await ctx.broker('core_saas','query',{
    text:`DELETE FROM core_tenant_application_user tau
          USING core_tenant_application ta
          WHERE tau.tenant_application_id=ta.tenant_application_id
          AND ta.tenant_id=$1 AND ta.application_id=$2 AND tau.tenant_user_id=$3`,
    values:[tenantId,applicationId,tenantUserId]
  });
  return {enabled:false,rowCount:r.rowCount};
};
