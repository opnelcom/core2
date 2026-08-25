'use strict';
delete require.cache[require.resolve('../_shared/erp')];
const {authTenant}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  if(!orgId)return ctx.send(400,{error:'organisation_id is required'});
  const r=await ctx.broker('core_erp','query',{
    text:`SELECT t.*,f.family_name
          FROM erp_ledger_account_type t
          JOIN erp_ledger_family f ON f.ledger_family_code=t.ledger_family_code
          WHERE t.tenant_id=$1
          AND t.organisation_id=$2
          ORDER BY t.ledger_family_code,t.account_type_code`,
    values:[access.tenantId,orgId]
  });
  return {ledger_types:r.rows};
};
