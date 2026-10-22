'use strict';
const {authTenant,isAdministrator}=require('../_shared/erp');
const {dashboardSql,dashboardResult}=require('../_shared/erp/module-dashboard');
const {subledgerBalancesSql,attachSubledgerBalances}=require('../_shared/erp/dashboard-subledgers');
const {validDate}=require('../_shared/erp/trial-balance');
module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  if(ctx.req.method!=='GET')return ctx.send(405,{error:'GET required'});
  const orgId=ctx.query.organisation_id;
  if(!orgId)return ctx.send(400,{error:'organisation_id is required'});
  const asOf=ctx.query.as_of||new Date().toISOString().slice(0,10);
  if(!validDate(asOf))return ctx.send(400,{error:'A valid balance date is required'});
  const values=[access.tenantId,orgId,access.auth.email,isAdministrator(access),ctx.query.active_division_id||null,ctx.query.include_child_divisions==='1'];
  const [result,balances]=await Promise.all([
    ctx.broker('core_erp','query',{text:dashboardSql(),values}),
    ctx.broker('core_erp','query',{text:subledgerBalancesSql(),values:[...values,asOf]})
  ]);
  return attachSubledgerBalances(dashboardResult(result.rows),balances.rows,asOf);
};
module.exports=require('../_shared/context').withContext(module.exports);
