"use strict";
const {
  authTenant,
  isAdministrator,
  hasResourcePermission,
  hasOrganisationResourcePermission,
  requireModuleAccess,
} = require("../../_shared/erp");

const targets = {
  gl_account: {
    table: "erp_gl_account",
    id: "gl_account_id",
    type: "gl_account_type_id",
    code: "account_code",
    name: "account_name",
    organisationScoped: true,
  },
  subledger_account: {
    table: "erp_subledger_account",
    id: "subledger_account_id",
    type: "subledger_account_type_id",
    code: "account_code",
    name: "account_name",
  },
  accounting_object: {
    table: "erp_accounting_object",
    id: "accounting_object_id",
    type: "accounting_object_type_id",
    code: "object_code",
    name: "object_name",
  },
  accounting_dimension: {
    table: "erp_accounting_dimension",
    id: "accounting_dimension_id",
    type: "accounting_dimension_type_id",
    code: "dimension_code",
    name: "dimension_name",
  },
};

module.exports = async (ctx) => {
  const access = await authTenant(ctx);
  if (access.status) return ctx.send(access.status, access.body);
  const organisationId = ctx.query.organisation_id;
  const objectKind = ctx.query.object_kind;
  const objectId = ctx.query.object_id;
  const target = targets[objectKind];
  if (!organisationId || !target || !objectId)
    return ctx.send(400, {
      error: "Organisation, object kind and object ID are required",
    });
  const result = await ctx.broker("core_erp", "query", {
    text: `SELECT record.${target.type} object_type_id,${target.organisationScoped ? "NULL::uuid" : "record.owner_division_id"} owner_division_id,record.valid_from,record.valid_to,record.workflow_status
          FROM ${target.table} record
          WHERE record.tenant_id=$1 AND record.organisation_id=$2 AND record.${target.id}=$3`,
    values: [access.tenantId, organisationId, objectId],
  });
  if (!result.rowCount) return ctx.send(404, { error: "Object was not found" });
  const object = result.rows[0];
  const permission = target.organisationScoped
    ? await hasOrganisationResourcePermission(ctx, access, {
        organisationId,
        resourceKind: objectKind,
        resourceCode: "*",
        workflowStatus: "view",
      })
    : (await hasResourcePermission(ctx, access, {
      organisationId,
      divisionId: object.owner_division_id,
      resourceKind: objectKind,
      resourceCode: object.object_type_id,
      workflowStatus: "view",
    })) ||
    (await hasResourcePermission(ctx, access, {
      organisationId,
      divisionId: object.owner_division_id,
      resourceKind: objectKind,
      resourceCode: object.object_type_id,
      workflowStatus: "*",
      }));
  if (!permission)
    return ctx.send(403, {
      error:
        "Object view permission is required to view its resource assignments",
    });
  const moduleKind = {
    subledger_account: "subledger_account_type",
    accounting_object: "accounting_object_type",
    accounting_dimension: "accounting_dimension_type",
  }[objectKind];
  if (moduleKind) {
    const moduleDenied = await requireModuleAccess(ctx, access, {
      organisationId,
      resourceKind: moduleKind,
      resourceCode: object.object_type_id,
    });
    if (moduleDenied) return ctx.send(moduleDenied.status, moduleDenied.body);
  }
  const [assignments, mappings] = await Promise.all([
    ctx.broker("core_erp", "query", {
      text: `SELECT assignment.resource_assignment_id,assignment.resource_role_id,role.role_name,
                   assignment.resource_id,resource.resource_code,resource.display_name,resource.is_active,
                   assignment.valid_from,assignment.valid_to
            FROM erp_resource_assignment assignment
            JOIN erp_resource_role role ON role.resource_role_id=assignment.resource_role_id
            JOIN erp_resource resource ON resource.resource_id=assignment.resource_id
            WHERE assignment.tenant_id=$1 AND assignment.organisation_id=$2
              AND assignment.object_kind=$3 AND assignment.object_id=$4
            ORDER BY role.role_name,assignment.valid_from,resource.display_name`,
      values: [access.tenantId, organisationId, objectKind, objectId],
    }),
    ctx.broker("core_erp", "query", {
      text: `SELECT mapping.resource_role_id,role.role_name,mapping.is_required
            FROM erp_object_type_resource_role mapping
            JOIN erp_resource_role role ON role.resource_role_id=mapping.resource_role_id
            WHERE mapping.tenant_id=$1 AND mapping.organisation_id=$2
              AND mapping.object_kind=$3 AND mapping.object_type_id=$4
            ORDER BY role.role_name`,
      values: [
        access.tenantId,
        organisationId,
        objectKind,
        object.object_type_id,
      ],
    }),
  ]);
  return {
    assignments: assignments.rows,
    requirements: mappings.rows,
    can_manage:
      isAdministrator(access) ||
      (target.organisationScoped
        ? await hasOrganisationResourcePermission(ctx, access, {
            organisationId,
            resourceKind: objectKind,
            resourceCode: "*",
            workflowStatus: "*",
          })
        : await hasResourcePermission(ctx, access, {
        organisationId,
        divisionId: object.owner_division_id,
        resourceKind: objectKind,
        resourceCode: object.object_type_id,
            workflowStatus: "*",
          })),
  };
};
