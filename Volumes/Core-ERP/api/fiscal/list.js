'use strict';
const {authTenant}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  if(!orgId)return ctx.send(400,{error:'organisation_id is required'});
  const [years,periods]=await Promise.all([
    ctx.broker('core_erp','query',{text:`SELECT * FROM erp_fiscal_year WHERE tenant_id=$1 AND organisation_id=$2 ORDER BY start_date DESC`,values:[access.tenantId,orgId]}),
    ctx.broker('core_erp','query',{text:`SELECT * FROM erp_fiscal_period WHERE tenant_id=$1 AND organisation_id=$2 ORDER BY start_date DESC,period_number`,values:[access.tenantId,orgId]})
  ]);
  return {fiscal_years:years.rows,fiscal_periods:periods.rows};
};
