'use strict';
const {authTenant}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  if(!orgId)return ctx.send(400,{error:'organisation_id is required'});
  const [types,rates]=await Promise.all([
    ctx.broker('core_erp','query',{
      text:`SELECT *
            FROM erp_tax_type
            WHERE tenant_id=$1 AND organisation_id=$2
            ORDER BY tax_type_code`,
      values:[access.tenantId,orgId]
    }),
    ctx.broker('core_erp','query',{
      text:`SELECT *
            FROM erp_tax_rate
            WHERE tenant_id=$1 AND organisation_id=$2
            ORDER BY valid_from DESC,tax_rate`,
      values:[access.tenantId,orgId]
    })
  ]);
  return {tax_types:types.rows,tax_rates:rates.rows};
};
