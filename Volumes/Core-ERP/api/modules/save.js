'use strict';
const {authTenant,requireAdmin,clean,nullable,bool}=require('../_shared/erp');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);
  const orgId=ctx.body.organisation_id;
  const id=nullable(ctx.body.module_id);
  const code=clean(ctx.body.module_code).toLowerCase().replace(/\s+/g,'_');
  const name=clean(ctx.body.module_name);
  if(!orgId||!code||!name)return ctx.send(400,{error:'Organisation, module code and name are required'});
  const iconSvg=clean(ctx.body.module_icon_svg);
  if(iconSvg&&!/^<svg(?:\s|>)/i.test(iconSvg))return ctx.send(400,{error:'Module icon must be an SVG element'});
  if(/<(?:script|foreignObject|iframe|object|embed|link|style)\b|\bon\w+\s*=|javascript:|data:text\/html|(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/)/i.test(iconSvg))return ctx.send(400,{error:'Module icon contains unsafe SVG content'});
  const values=[access.tenantId,orgId,code,name,clean(ctx.body.module_description),iconSvg,Number(ctx.body.sort_order)||0,bool(ctx.body.is_active)];
  const text=id
    ? `UPDATE erp_module SET module_code=$3,module_name=$4,module_description=$5,module_icon_svg=$6,sort_order=$7,is_active=$8,updated_at=now()
       WHERE tenant_id=$1 AND organisation_id=$2 AND module_id=$9 RETURNING *`
    : `INSERT INTO erp_module(tenant_id,organisation_id,module_code,module_name,module_description,module_icon_svg,sort_order,is_active)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`;
  const result=await ctx.broker('core_erp','query',{text,values:id?[...values,id]:values});
  if(!result.rowCount)return ctx.send(404,{error:'Module not found'});
  return {module:result.rows[0]};
};
