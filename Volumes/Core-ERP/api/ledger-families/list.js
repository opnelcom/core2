'use strict';
delete require.cache[require.resolve('../_shared/erp')];
const {authTenant}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  if(!orgId)return ctx.send(400,{error:'organisation_id is required'});
  const r=await ctx.broker('core_erp','query',{
    text:`SELECT f.*,
            COALESCE((SELECT array_agg(fm.module_id ORDER BY m.sort_order,m.module_name)
              FROM erp_ledger_family_module fm JOIN erp_module m ON m.module_id=fm.module_id
              WHERE fm.tenant_id=f.tenant_id AND fm.organisation_id=f.organisation_id AND fm.ledger_family_code=f.ledger_family_code),'{}'::uuid[]) module_ids
          FROM erp_ledger_family f
          WHERE f.tenant_id=$1
          AND f.organisation_id=$2
          ORDER BY ledger_family_code`,
    values:[access.tenantId,orgId]
  });
  return {ledger_families:r.rows};
};
