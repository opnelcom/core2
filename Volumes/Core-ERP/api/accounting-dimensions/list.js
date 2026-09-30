'use strict';
const {authTenant,isAdministrator,requireModuleAccess}=require('../_shared/erp');

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
          AND ($5::boolean OR EXISTS (
            WITH RECURSIVE ancestors AS (
              SELECT division_id,parent_division_id,0 AS depth FROM erp_division WHERE division_id=d.owner_division_id
              UNION ALL
              SELECT parent.division_id,parent.parent_division_id,child.depth+1
              FROM erp_division parent JOIN ancestors child ON child.parent_division_id=parent.division_id
              WHERE parent.tenant_id=$1 AND parent.organisation_id=$2
            )
            SELECT 1 FROM erp_user_role ur
            JOIN erp_role role ON role.role_id=ur.role_id
            JOIN erp_role_permission permission ON permission.role_id=role.role_id
            JOIN ancestors scope ON scope.division_id=permission.division_id
            WHERE ur.tenant_id=$1 AND ur.organisation_id=$2 AND lower(ur.email)=lower($4)
              AND role.is_active=true AND ur.valid_from<=CURRENT_DATE AND (ur.valid_to IS NULL OR ur.valid_to>=CURRENT_DATE)
              AND permission.resource_kind='accounting_dimension'
              AND (permission.resource_code=$3::text OR permission.resource_code='*')
              AND permission.workflow_status IN('view','*')
              AND permission.valid_from<=CURRENT_DATE AND (permission.valid_to IS NULL OR permission.valid_to>=CURRENT_DATE)
              AND (scope.depth=0 OR permission.applies_to_children=true)
          ))
          ORDER BY d.dimension_name`,
    values:[access.tenantId,orgId,typeId,access.auth.email,isAdministrator(access)]
  });
  return {records:r.rows};
};
