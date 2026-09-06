'use strict';
delete require.cache[require.resolve('../_shared/erp')];
const {authTenant}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  if(!orgId)return ctx.send(400,{error:'organisation_id is required'});
  const r=await ctx.broker('core_erp','query',{
    text:`SELECT *
          FROM erp_ledger_family
          WHERE tenant_id=$1
          AND organisation_id=$2
          ORDER BY ledger_family_code`,
    values:[access.tenantId,orgId]
  });
  return {ledger_families:r.rows};
};
