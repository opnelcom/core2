'use strict';
const {authTenant}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  if(!orgId)return ctx.send(400,{error:'organisation_id is required'});
  const r=await ctx.broker('core_erp','query',{
    text:`SELECT t.*,
            COALESCE((SELECT array_agg(tm.module_id ORDER BY m.sort_order,m.module_name)
              FROM erp_accounting_object_type_module tm JOIN erp_module m ON m.module_id=tm.module_id
              WHERE tm.accounting_object_type_id=t.accounting_object_type_id),'{}'::uuid[]) module_ids
          FROM erp_accounting_object_type t
          WHERE t.tenant_id=$1 AND t.organisation_id=$2
          ORDER BY type_name`,
    values:[access.tenantId,orgId]
  });
  return {types:r.rows};
};
