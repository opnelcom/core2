'use strict';
const {authTenant,isAdministrator,requireBusinessAccess}=require('../_shared/erp');
const {validDate}=require('../_shared/erp/trial-balance');
const {financialDashboardSql,financialDashboardResult}=require('../_shared/erp/financial-dashboard');
module.exports=async ctx=>{
  const access=await authTenant(ctx);if(access.status)return ctx.send(access.status,access.body);
  if(ctx.req.method!=='GET')return ctx.send(405,{error:'GET required'});
  const orgId=ctx.query.organisation_id,divisionId=ctx.query.active_division_id||null;
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if(!uuid.test(orgId||'')||(divisionId&&!uuid.test(divisionId)))return ctx.send(400,{error:'Valid organisation and division identifiers are required'});
  const asOf=ctx.query.as_of;
  if(!validDate(asOf))return ctx.send(400,{error:'A valid balance date is required'});
  const denied=await requireBusinessAccess(ctx,access,orgId);if(denied)return ctx.send(denied.status,denied.body);
  const result=await ctx.broker('core_erp','query',{text:financialDashboardSql(),values:[access.tenantId,orgId,access.auth.email,isAdministrator(access),divisionId,ctx.query.include_child_divisions==='1',asOf]});
  return financialDashboardResult(result.rows,asOf);
};
module.exports=require('../_shared/context').withContext(module.exports);
