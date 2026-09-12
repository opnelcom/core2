'use strict';

function isAdministrator(access){
  return access?.setupAdministrator===true;
}

function isTenantAdministrator(access){return access?.tenantAdministrator===true;}

function requireAdmin(access){
  if(!isAdministrator(access)){
    return {status:403,body:{error:'Administrator access required'}};
  }
  return null;
}

async function hasResourcePermission(ctx,access,{organisationId,divisionId,resourceKind,resourceCode,workflowStatus}){
  if(!organisationId||!divisionId||!resourceKind||!resourceCode||!workflowStatus)return false;
  const result=await ctx.broker('core_erp','query',{
    text:`WITH RECURSIVE ancestors AS (
            SELECT division_id,parent_division_id,0 AS depth
            FROM erp_division
            WHERE tenant_id=$1 AND organisation_id=$2 AND division_id=$3
            UNION ALL
            SELECT parent.division_id,parent.parent_division_id,child.depth+1
            FROM erp_division parent
            JOIN ancestors child ON child.parent_division_id=parent.division_id
            WHERE parent.tenant_id=$1 AND parent.organisation_id=$2
          )
          SELECT 1
          FROM erp_user_role ur
          JOIN erp_role role ON role.role_id=ur.role_id
          JOIN erp_role_permission rp ON rp.role_id=role.role_id
          JOIN ancestors scope ON scope.division_id=rp.division_id
          WHERE ur.tenant_id=$1
            AND ur.organisation_id=$2
            AND lower(ur.email)=lower($7)
            AND role.is_active=true
            AND ur.valid_from <= CURRENT_DATE
            AND (ur.valid_to IS NULL OR ur.valid_to >= CURRENT_DATE)
            AND rp.resource_kind=$4
            AND (rp.resource_code=$5 OR rp.resource_code='*')
            AND (rp.workflow_status=$6 OR rp.workflow_status='*')
            AND rp.valid_from <= CURRENT_DATE
            AND (rp.valid_to IS NULL OR rp.valid_to >= CURRENT_DATE)
            AND (scope.depth=0 OR rp.applies_to_children=true)
          LIMIT 1`,
    values:[
      access.tenantId,
      organisationId,
      divisionId,
      resourceKind,
      resourceCode,
      workflowStatus,
      access.auth.email
    ]
  });
  return !!result.rowCount;
}

async function requireResourcePermission(ctx,access,options){
  if(await hasResourcePermission(ctx,access,options))return null;
  return {status:403,body:{error:'You do not have permission for this ERP operation'}};
}

async function requireBusinessAccess(ctx,access,organisationId){
  const result=await ctx.broker('core_erp','query',{
    text:`SELECT 1 FROM erp_user_role ur
          JOIN erp_role role ON role.role_id=ur.role_id
          JOIN erp_role_module rm ON rm.role_id=role.role_id
          JOIN erp_role_permission rp ON rp.role_id=role.role_id
          WHERE ur.tenant_id=$1 AND ur.organisation_id=$2 AND lower(ur.email)=lower($3)
            AND role.is_active=true AND ur.valid_from<=CURRENT_DATE AND (ur.valid_to IS NULL OR ur.valid_to>=CURRENT_DATE)
            AND rp.valid_from<=CURRENT_DATE AND (rp.valid_to IS NULL OR rp.valid_to>=CURRENT_DATE)
          LIMIT 1`,
    values:[access.tenantId,organisationId,access.auth.email]
  });
  if(result.rowCount)return null;
  return {status:403,body:{error:'Business-data access is required'}};
}

async function requireModuleAccess(ctx,access,{organisationId,resourceKind,resourceCode}){
  const links={
    ledger_family:{table:'erp_ledger_family_module',condition:'link.ledger_family_code=$4'},
    accounting_object_type:{table:'erp_accounting_object_type_module',condition:'link.accounting_object_type_id=$4::uuid'},
    accounting_dimension_type:{table:'erp_accounting_dimension_type_module',condition:'link.accounting_dimension_type_id=$4::uuid'},
    transaction_type:{table:'erp_transaction_type_module',condition:'link.transaction_type_id=$4::uuid'}
  };
  const link=links[resourceKind];
  if(!link||!organisationId||!resourceCode)return {status:403,body:{error:'Module access is required for this ERP resource'}};
  const result=await ctx.broker('core_erp','query',{
    text:`SELECT 1 FROM erp_user_role ur JOIN erp_role role ON role.role_id=ur.role_id
          WHERE ur.tenant_id=$1 AND ur.organisation_id=$2 AND lower(ur.email)=lower($3)
          AND role.is_active=true AND ur.valid_from<=CURRENT_DATE AND (ur.valid_to IS NULL OR ur.valid_to>=CURRENT_DATE)
          AND EXISTS (
            SELECT 1 FROM erp_role_module rm JOIN ${link.table} link ON link.module_id=rm.module_id
            WHERE rm.role_id=role.role_id AND ${link.condition}
          ) LIMIT 1`,
    values:[access.tenantId,organisationId,access.auth.email,resourceCode]
  });
  if(result.rowCount)return null;
  return {status:403,body:{error:'Your assigned roles do not provide access to a module linked to this ERP resource'}};
}

module.exports={isAdministrator,isTenantAdministrator,requireAdmin,hasResourcePermission,requireResourcePermission,requireBusinessAccess,requireModuleAccess};
