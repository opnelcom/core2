'use strict';
const {authTenant,isAdministrator,requireModuleAccess}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  const typeId=ctx.query.subledger_account_type_id;
  if(!orgId||!typeId)return ctx.send(400,{error:'organisation_id and subledger_account_type_id are required'});
  const moduleDenied=await requireModuleAccess(ctx,access,{organisationId:orgId,resourceKind:'subledger_account_type',resourceCode:typeId});
  if(moduleDenied)return ctx.send(moduleDenied.status,moduleDenied.body);
  const result=await ctx.broker('core_erp','query',{
    text:`SELECT account.*,type.type_code,type.type_name,division.division_name owner_division_name,
                 entity.known_name legal_entity_known_name,entity.legal_name legal_entity_legal_name
          FROM erp_subledger_account account
          JOIN erp_subledger_account_type type ON type.subledger_account_type_id=account.subledger_account_type_id
          JOIN erp_division division ON division.division_id=account.owner_division_id
          LEFT JOIN erp_legal_entity entity ON entity.legal_entity_id=account.legal_entity_id
          WHERE account.tenant_id=$1 AND account.organisation_id=$2 AND account.subledger_account_type_id=$3 AND account.workflow_status<>'deleted'
            AND ($5::boolean OR EXISTS (
              WITH RECURSIVE ancestors AS (
                SELECT division_id,parent_division_id,0 depth FROM erp_division WHERE division_id=account.owner_division_id
                UNION ALL SELECT parent.division_id,parent.parent_division_id,child.depth+1 FROM erp_division parent JOIN ancestors child ON child.parent_division_id=parent.division_id
              )
              SELECT 1 FROM erp_user_role ur
              JOIN erp_role role ON role.role_id=ur.role_id
              JOIN erp_role_permission permission ON permission.role_id=role.role_id
              JOIN ancestors scope ON scope.division_id=permission.division_id
              WHERE ur.tenant_id=$1 AND ur.organisation_id=$2 AND lower(ur.email)=lower($4)
                AND role.is_active=true AND ur.valid_from<=CURRENT_DATE AND (ur.valid_to IS NULL OR ur.valid_to>=CURRENT_DATE)
                AND permission.resource_kind='subledger_account' AND (permission.resource_code=$3::text OR permission.resource_code='*')
                AND permission.workflow_status IN('view','*')
                AND permission.valid_from<=CURRENT_DATE AND (permission.valid_to IS NULL OR permission.valid_to>=CURRENT_DATE)
                AND (scope.depth=0 OR permission.applies_to_children=true)
            ))
          ORDER BY account.account_code,account.account_name`,
    values:[access.tenantId,orgId,typeId,access.auth.email,isAdministrator(access)]
  });
  return {subledger_accounts:result.rows};
};
