'use strict';
// Explicit operational grants: ERP Administrator is not a Setup Administrator.
async function seedErpAdministratorPermissions(ctx,access,organisationId){
 return ctx.broker('core_erp','query',{text:`WITH admin_role AS (
   SELECT r.role_id FROM erp_role r JOIN erp_organisation o USING(organisation_id)
   WHERE r.tenant_id=$1 AND r.organisation_id=$2 AND r.role_code='erp_admin'
     AND o.tenant_id=$1 AND o.is_template=true AND o.workflow_status<>'deleted'
 ), root AS (
   SELECT division_id FROM erp_division WHERE tenant_id=$1 AND organisation_id=$2
     AND parent_division_id IS NULL AND workflow_status<>'deleted' ORDER BY created_at LIMIT 1
 ), grants AS (
   SELECT root.division_id,k.kind resource_kind,'*'::text resource_code,'*'::text workflow_status,'manage'::text action_code
   FROM root CROSS JOIN (VALUES('subledger_account'),('accounting_object'),('accounting_dimension'),('transaction')) k(kind)
   UNION ALL
   SELECT NULL::uuid,k.kind,'*','*','manage' FROM (VALUES('gl_account'),('legal_entity'),('resource')) k(kind)
   UNION ALL
   SELECT root.division_id,'report',r.report_id::text,'view','view' FROM root CROSS JOIN erp_report r
   WHERE r.tenant_id=$1 AND r.organisation_id=$2
 ), restored AS (
   UPDATE erp_role_permission p SET applies_to_children=true,valid_from=LEAST(p.valid_from,CURRENT_DATE),valid_to=NULL
   FROM admin_role a,grants g WHERE p.role_id=a.role_id
     AND p.division_id IS NOT DISTINCT FROM g.division_id AND p.resource_kind=g.resource_kind
     AND p.resource_code=g.resource_code AND p.workflow_status=g.workflow_status AND p.action_code=g.action_code
     AND (p.applies_to_children=false OR p.valid_from>CURRENT_DATE OR p.valid_to IS NOT NULL)
 ) INSERT INTO erp_role_permission(tenant_id,organisation_id,role_id,division_id,resource_kind,resource_code,workflow_status,action_code,applies_to_children)
 SELECT $1,$2,a.role_id,g.division_id,g.resource_kind,g.resource_code,g.workflow_status,g.action_code,true
 FROM admin_role a CROSS JOIN grants g
 WHERE NOT EXISTS(SELECT 1 FROM erp_role_permission p WHERE p.role_id=a.role_id
   AND p.division_id IS NOT DISTINCT FROM g.division_id AND p.resource_kind=g.resource_kind
   AND p.resource_code=g.resource_code AND p.workflow_status=g.workflow_status AND p.action_code=g.action_code)
 RETURNING role_permission_id`,values:[access.tenantId,organisationId]});
}
module.exports={seedErpAdministratorPermissions};
