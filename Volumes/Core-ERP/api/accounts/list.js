'use strict';
const {authTenant,requireModuleAccess}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  if(!orgId)return ctx.send(400,{error:'organisation_id is required'});
  const family=ctx.query.ledger_family_code||'gl';
  if(family!=='gl'){
    const moduleDenied=await requireModuleAccess(ctx,access,{organisationId:orgId,resourceKind:'ledger_family',resourceCode:family});
    if(moduleDenied)return ctx.send(moduleDenied.status,moduleDenied.body);
  }
  const r=await ctx.broker('core_erp','query',{
    text:`SELECT a.*,t.account_type_code,t.account_type_name,d.division_name owner_division_name,e.known_name legal_entity_known_name,e.legal_name legal_entity_legal_name
          FROM erp_ledger_account a
          LEFT JOIN erp_ledger_account_type t ON t.account_type_id=a.account_type_id
          JOIN erp_division d ON d.division_id=a.owner_division_id
          LEFT JOIN erp_legal_entity e ON e.legal_entity_id=a.legal_entity_id
          WHERE a.tenant_id=$1 AND a.organisation_id=$2 AND a.ledger_family_code=$3 AND a.workflow_status <> 'deleted'
          AND (
            EXISTS (
              WITH RECURSIVE ancestors AS (
                SELECT division_id,parent_division_id FROM erp_division WHERE division_id=a.owner_division_id
                UNION ALL
                SELECT parent.division_id,parent.parent_division_id
                FROM erp_division parent
                JOIN ancestors child ON child.parent_division_id=parent.division_id
              )
              SELECT 1
              FROM erp_user_role ur
              JOIN erp_role role ON role.role_id=ur.role_id
              JOIN erp_role_permission rp ON rp.role_id=role.role_id
              JOIN ancestors scope ON scope.division_id=rp.division_id
              WHERE ur.tenant_id=$1 AND ur.organisation_id=$2 AND lower(ur.email)=lower($4)
              AND role.is_active=true AND ur.valid_from <= CURRENT_DATE AND (ur.valid_to IS NULL OR ur.valid_to >= CURRENT_DATE)
              AND rp.resource_kind='master_data' AND rp.workflow_status='view'
              AND (rp.resource_code=$3 OR rp.resource_code='*')
            )
          )
          ORDER BY a.account_code,a.account_name`,
    values:[access.tenantId,orgId,family,access.auth.email]
  });
  const types=await ctx.broker('core_erp','query',{text:`SELECT * FROM erp_ledger_account_type WHERE tenant_id=$1 AND organisation_id=$2 AND is_active=true ORDER BY ledger_family_code,account_type_code`,values:[access.tenantId,orgId]});
  return {accounts:r.rows,account_types:types.rows};
};
