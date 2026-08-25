'use strict';
const {authTenant}=require('../_shared/tenant');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const r=await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_note(tenant_id,title,body) VALUES($1,$2,$3) RETURNING *`,
    values:[access.tenantId,ctx.body.title||'Untitled',ctx.body.body||'']
  });
  return ctx.send(201,{note:r.rows[0]});
};
