"use strict";
const {
  authTenant,
  requireResourcePermission,
  requireOrganisationResourcePermission,
  requireModuleAccess,
} = require("../../_shared/erp");

const moduleKinds = {
  subledger_account: "subledger_account_type",
  accounting_object: "accounting_object_type",
  accounting_dimension: "accounting_dimension_type",
};

module.exports = async (ctx) => {
  const access = await authTenant(ctx);
  if (access.status) return ctx.send(access.status, access.body);
  const organisationId = ctx.query.organisation_id;
  const objectKind = ctx.query.object_kind;
  const objectTypeId = ctx.query.object_type_id;
  const divisionId = ctx.query.division_id;
  if (
    !organisationId ||
    !(objectKind === "gl_account" || moduleKinds[objectKind]) ||
    !objectTypeId ||
    (objectKind !== "gl_account" && !divisionId)
  )
    return ctx.send(400, {
      error: "Organisation, object kind, object type and division are required",
    });
  if (objectKind !== "gl_account") {
    const moduleDenied = await requireModuleAccess(ctx, access, {
      organisationId,
      resourceKind: moduleKinds[objectKind],
      resourceCode: objectTypeId,
    });
    if (moduleDenied) return ctx.send(moduleDenied.status, moduleDenied.body);
  }
  const permissionDenied = objectKind === "gl_account"
    ? await requireOrganisationResourcePermission(ctx, access, {
        organisationId,
        resourceKind: "gl_account",
        resourceCode: "*",
        workflowStatus: "*",
      })
    : await requireResourcePermission(ctx, access, {
        organisationId,
        divisionId,
        resourceKind: objectKind,
        resourceCode: objectTypeId,
        workflowStatus: "*",
      });
  if (permissionDenied)
    return ctx.send(permissionDenied.status, permissionDenied.body);
  const [roles, resources] = await Promise.all([
    ctx.broker("core_erp", "query", {
      text: `SELECT role.resource_role_id,role.role_code,role.role_name,mapping.is_required
            FROM erp_object_type_resource_role mapping
            JOIN erp_resource_role role ON role.resource_role_id=mapping.resource_role_id
            WHERE mapping.tenant_id=$1 AND mapping.organisation_id=$2 AND mapping.object_kind=$3
              AND mapping.object_type_id=$4 AND role.is_active=true
            ORDER BY role.role_name`,
      values: [access.tenantId, organisationId, objectKind, objectTypeId],
    }),
    ctx.broker("core_erp", "query", {
      text: `SELECT resource_id,resource_code,display_name,resource_type,linked_email,resource_description
            FROM erp_resource
            WHERE tenant_id=$1 AND organisation_id=$2 AND is_active=true
            ORDER BY lower(display_name),resource_code`,
      values: [access.tenantId, organisationId],
    }),
  ]);
  return { roles: roles.rows, resources: resources.rows, can_manage: true };
};
