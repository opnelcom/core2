'use strict';
const {authTenant}=require('../_shared/tenant');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const r=await ctx.broker('core_erp','query',{
    text:`SELECT note_id,title,body,created_at,updated_at FROM erp_note WHERE tenant_id=$1 ORDER BY created_at DESC`,
    values:[access.tenantId]
  });
  return {notes:r.rows};
};
