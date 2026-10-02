"use strict";
const {
  authTenant,
  isAdministrator,
  hasOrganisationResourcePermission,
} = require("../../_shared/erp");

module.exports = async (ctx) => {
  const access = await authTenant(ctx);
  if (access.status) return ctx.send(access.status, access.body);
  const organisationId = ctx.query.organisation_id;
  const divisionId = ctx.query.division_id;
  const resourceRoleId = ctx.query.resource_role_id;
  const includeChildren = ctx.query.include_child_divisions === "1";
  if (!organisationId || !divisionId || !resourceRoleId)
    return ctx.send(400, {
      error: "Organisation, division and Resource Role are required",
    });
  const division = await ctx.broker("core_erp", "query", {
    text: `SELECT division_id FROM erp_division WHERE tenant_id=$1 AND organisation_id=$2 AND division_id=$3`,
    values: [access.tenantId, organisationId, divisionId],
  });
  if (!division.rowCount)
    return ctx.send(404, { error: "Division was not found" });
  const view = await hasOrganisationResourcePermission(ctx, access, {
    organisationId,
    resourceKind: "resource",
    resourceCode: "*",
    workflowStatus: "view",
  });
  const manage = await hasOrganisationResourcePermission(ctx, access, {
    organisationId,
    resourceKind: "resource",
    resourceCode: "*",
    workflowStatus: "manage",
  });
  if (!isAdministrator(access) && !view && !manage)
    return ctx.send(403, {
      error: "Organisation-wide Resource view permission is required",
    });
  if (!isAdministrator(access)) {
    const module = await ctx.broker("core_erp", "query", {
      text: `SELECT 1 FROM erp_user_role user_role
            JOIN erp_role role ON role.role_id=user_role.role_id
            JOIN erp_role_module assigned_module ON assigned_module.role_id=role.role_id
            JOIN erp_resource_role_module resource_module ON resource_module.module_id=assigned_module.module_id
            WHERE user_role.tenant_id=$1 AND user_role.organisation_id=$2 AND lower(user_role.email)=lower($3)
              AND user_role.valid_from<=CURRENT_DATE AND (user_role.valid_to IS NULL OR user_role.valid_to>=CURRENT_DATE)
              AND role.is_active=true AND resource_module.resource_role_id=$4 LIMIT 1`,
      values: [access.tenantId, organisationId, access.auth.email, resourceRoleId],
    });
    if (!module.rowCount)
      return ctx.send(403, {
        error: "A module linked to this Resource Role is required",
      });
  }
  const result = await ctx.broker("core_erp", "query", {
    text: `WITH RECURSIVE scope AS (
            SELECT division_id FROM erp_division WHERE tenant_id=$1 AND organisation_id=$2 AND division_id=$3
            UNION ALL
            SELECT child.division_id FROM erp_division child JOIN scope parent ON child.parent_division_id=parent.division_id
            WHERE child.tenant_id=$1 AND child.organisation_id=$2 AND $4::boolean
          ), objects AS (
            SELECT 'gl_account'::text object_kind,account.gl_account_id object_id,
                   account.gl_account_type_id object_type_id,type.type_name object_type_name,
                   account.account_code object_code,NULL::uuid owner_division_id,mapping.is_required
            FROM erp_gl_account account
            JOIN erp_gl_account_type type ON type.gl_account_type_id=account.gl_account_type_id
            JOIN erp_object_type_resource_role mapping ON mapping.tenant_id=$1 AND mapping.organisation_id=$2
              AND mapping.object_kind='gl_account' AND mapping.object_type_id=account.gl_account_type_id
              AND mapping.resource_role_id=$5
            WHERE account.tenant_id=$1 AND account.organisation_id=$2 AND account.workflow_status<>'deleted'
            UNION ALL
            SELECT 'subledger_account',account.subledger_account_id,account.subledger_account_type_id,
                   type.type_name,account.account_code,account.owner_division_id,mapping.is_required
            FROM erp_subledger_account account
            JOIN erp_subledger_account_type type ON type.subledger_account_type_id=account.subledger_account_type_id
            JOIN erp_object_type_resource_role mapping ON mapping.tenant_id=$1 AND mapping.organisation_id=$2
              AND mapping.object_kind='subledger_account' AND mapping.object_type_id=account.subledger_account_type_id
              AND mapping.resource_role_id=$5
            JOIN scope ON scope.division_id=account.owner_division_id
            WHERE account.tenant_id=$1 AND account.organisation_id=$2 AND account.workflow_status<>'deleted'
            UNION ALL
            SELECT 'accounting_object',object.accounting_object_id,object.accounting_object_type_id,
                   type.type_name,object.object_code,object.owner_division_id,mapping.is_required
            FROM erp_accounting_object object
            JOIN erp_accounting_object_type type ON type.accounting_object_type_id=object.accounting_object_type_id
            JOIN erp_object_type_resource_role mapping ON mapping.tenant_id=$1 AND mapping.organisation_id=$2
              AND mapping.object_kind='accounting_object' AND mapping.object_type_id=object.accounting_object_type_id
              AND mapping.resource_role_id=$5
            JOIN scope ON scope.division_id=object.owner_division_id
            WHERE object.tenant_id=$1 AND object.organisation_id=$2 AND object.workflow_status<>'deleted'
            UNION ALL
            SELECT 'accounting_dimension',dimension.accounting_dimension_id,dimension.accounting_dimension_type_id,
                   type.type_name,dimension.dimension_code,dimension.owner_division_id,mapping.is_required
            FROM erp_accounting_dimension dimension
            JOIN erp_accounting_dimension_type type ON type.accounting_dimension_type_id=dimension.accounting_dimension_type_id
            JOIN erp_object_type_resource_role mapping ON mapping.tenant_id=$1 AND mapping.organisation_id=$2
              AND mapping.object_kind='accounting_dimension' AND mapping.object_type_id=dimension.accounting_dimension_type_id
              AND mapping.resource_role_id=$5
            JOIN scope ON scope.division_id=dimension.owner_division_id
            WHERE dimension.tenant_id=$1 AND dimension.organisation_id=$2 AND dimension.workflow_status<>'deleted'
          )
          SELECT assignment.resource_assignment_id,objects.object_kind,objects.object_type_id,
                 objects.object_type_name,objects.object_code,objects.is_required,
                 owner.division_code,COALESCE(owner.division_name,'Organisation') division_name,
                 role.resource_role_id,role.role_name,assignment.resource_id,
                 resource.resource_code,resource.display_name,resource.resource_type,
                 assignment.valid_from,assignment.valid_to
          FROM objects
          JOIN erp_resource_role role ON role.tenant_id=$1 AND role.organisation_id=$2
            AND role.resource_role_id=$5 AND role.is_active=true
          LEFT JOIN erp_division owner ON owner.division_id=objects.owner_division_id
          LEFT JOIN erp_resource_assignment assignment ON assignment.tenant_id=$1 AND assignment.organisation_id=$2
            AND assignment.object_kind=objects.object_kind AND assignment.object_id=objects.object_id
            AND assignment.resource_role_id=$5
          LEFT JOIN erp_resource resource ON resource.resource_id=assignment.resource_id
          ORDER BY owner.division_code NULLS FIRST,objects.object_type_name,objects.object_code,
                   assignment.valid_from NULLS FIRST,resource.display_name`,
    values: [
      access.tenantId,
      organisationId,
      divisionId,
      includeChildren,
      resourceRoleId,
    ],
  });
  return { assignments: result.rows };
};
