'use strict';
const fs=require('fs');
const path=require('path');

function isAdministrator(role){
  return ['administrator','administration_user','admin','owner'].includes(String(role||'').toLowerCase());
}

function schemaPath(){
  return path.join(process.env.CONTENT_ROOT||path.resolve(__dirname,'..','..'),'schema','erp-schema.sql');
}

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const auth=ctx.auth();
  if(!auth)return ctx.send(401,{error:'Authentication required'});
  const tenantId=ctx.cookies.current_tenant;
  if(!tenantId)return ctx.send(400,{error:'No current tenant'});
  const access=await ctx.broker('core_saas','query',{
    brokerProfile:'core_saas',
    text:`SELECT tu.tenant_user_type
          FROM core_tenant t
          JOIN core_tenant_user tu ON tu.tenant_id=t.tenant_id
          WHERE t.tenant_id=$1
          AND lower(tu.email)=lower($2)
          AND t.status='active'
          AND tu.status='active'`,
    values:[tenantId,auth.email]
  });
  if(!access.rowCount)return ctx.send(403,{error:'No access to active tenant'});
  if(!isAdministrator(access.rows[0].tenant_user_type)){
    return ctx.send(403,{error:'Administrator access required'});
  }
  await ctx.broker('core_erp','query',{text:fs.readFileSync(schemaPath(),'utf8')});
  return {ok:true,initialised:true};
};
