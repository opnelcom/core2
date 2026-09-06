'use strict';
const {authTenant,requireAdmin}=require('../_shared/erp');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);
  const id=ctx.body.financial_statement_format_id;
  if(!id)return ctx.send(400,{error:'financial_statement_format_id is required'});
  const r=await ctx.broker('core_erp','query',{
    text:`DELETE FROM erp_financial_statement_format
          WHERE tenant_id=$1 AND financial_statement_format_id=$2
          RETURNING financial_statement_format_id`,
    values:[access.tenantId,id]
  });
  if(!r.rowCount)return ctx.send(404,{error:'Financial statement format not found'});
  return {ok:true};
};
