'use strict';
const {authTenant,requireModuleAccess}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  const typeId=ctx.query.accounting_dimension_type_id;
  if(!orgId||!typeId)return ctx.send(400,{error:'organisation_id and accounting_dimension_type_id are required'});
  const moduleDenied=await requireModuleAccess(ctx,access,{organisationId:orgId,resourceKind:'accounting_dimension_type',resourceCode:typeId});
  if(moduleDenied)return ctx.send(moduleDenied.status,moduleDenied.body);
  const r=await ctx.broker('core_erp','query',{
    text:`SELECT d.*,t.type_code,t.type_name,div.division_name owner_division_name
          FROM erp_accounting_dimension d
          JOIN erp_accounting_dimension_type t ON t.accounting_dimension_type_id=d.accounting_dimension_type_id
          JOIN erp_division div ON div.division_id=d.owner_division_id
          WHERE d.tenant_id=$1 AND d.organisation_id=$2 AND d.accounting_dimension_type_id=$3
          AND d.workflow_status <> 'deleted'
          ORDER BY d.dimension_name`,
    values:[access.tenantId,orgId,typeId]
  });
  return {records:r.rows};
};
