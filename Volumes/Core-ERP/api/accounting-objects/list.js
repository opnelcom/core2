'use strict';
const {authTenant,requireModuleAccess}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  const typeId=ctx.query.accounting_object_type_id;
  if(!orgId||!typeId)return ctx.send(400,{error:'organisation_id and accounting_object_type_id are required'});
  const moduleDenied=await requireModuleAccess(ctx,access,{organisationId:orgId,resourceKind:'accounting_object_type',resourceCode:typeId});
  if(moduleDenied)return ctx.send(moduleDenied.status,moduleDenied.body);
  const r=await ctx.broker('core_erp','query',{
    text:`SELECT o.*,t.type_code,t.type_name,d.division_name owner_division_name,
            parent.object_code parent_object_code,parent.object_name parent_object_name,
            parent_type.type_code parent_type_code,parent_type.type_name parent_type_name
          FROM erp_accounting_object o
          JOIN erp_accounting_object_type t ON t.accounting_object_type_id=o.accounting_object_type_id
          JOIN erp_division d ON d.division_id=o.owner_division_id
          LEFT JOIN erp_accounting_object parent ON parent.tenant_id=o.tenant_id AND parent.organisation_id=o.organisation_id AND parent.accounting_object_id=o.parent_accounting_object_id
          LEFT JOIN erp_accounting_object_type parent_type ON parent_type.accounting_object_type_id=parent.accounting_object_type_id
          WHERE o.tenant_id=$1 AND o.organisation_id=$2 AND o.accounting_object_type_id=$3
          AND o.workflow_status <> 'deleted'
          ORDER BY o.object_name`,
    values:[access.tenantId,orgId,typeId]
  });
  return {records:r.rows};
};
