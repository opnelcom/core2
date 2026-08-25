'use strict';

function sessionMaxAge(config){
  const seconds=Number(config.sessionMaxAgeSeconds||60*60*24*30);
  return Number.isFinite(seconds)&&seconds>0?Math.trunc(seconds):60*60*24*30;
}

module.exports=async ctx=>{
  const a=ctx.auth();
  if(!a)return ctx.send(401,{error:'Authentication required'});
  const id=ctx.body.tenant_id;
  const r=await ctx.broker('core_saas','query',{
    text:`SELECT t.tenant_id,t.tenant_name
          FROM core_tenant t
          JOIN core_tenant_user tu ON tu.tenant_id=t.tenant_id
          WHERE t.tenant_id=$1 AND lower(tu.email)=lower($2) AND tu.status='active' AND t.status='active'`,
    values:[id,a.email]
  });
  if(!r.rowCount)return ctx.send(403,{error:'No access to active tenant'});
  ctx.setCookie('current_tenant',id,{
    secure:ctx.config.cookieSecure===true,
    maxAge:sessionMaxAge(ctx.config)
  });
  return {tenant:r.rows[0]};
};
