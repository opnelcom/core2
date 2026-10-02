"use strict";
const { authTenant } = require("../../_shared/erp");

module.exports = async (ctx) => {
  const access = await authTenant(ctx);
  if (access.status) return ctx.send(access.status, access.body);
  const organisationId = ctx.query.organisation_id;
  if (!organisationId)
    return ctx.send(400, { error: "organisation_id is required" });
  const [roles, mappings] = await Promise.all([
    ctx.broker("core_erp", "query", {
      text: `SELECT role.*,COALESCE((SELECT array_agg(link.module_id ORDER BY module.sort_order,module.module_name)
                  FROM erp_resource_role_module link JOIN erp_module module ON module.module_id=link.module_id
                  WHERE link.resource_role_id=role.resource_role_id),'{}'::uuid[]) module_ids
            FROM erp_resource_role role
            WHERE role.tenant_id=$1 AND role.organisation_id=$2
            ORDER BY role.role_name`,
      values: [access.tenantId, organisationId],
    }),
    ctx.broker("core_erp", "query", {
      text: `SELECT mapping.*,role.role_code,role.role_name
            FROM erp_object_type_resource_role mapping
            JOIN erp_resource_role role ON role.resource_role_id=mapping.resource_role_id
            WHERE mapping.tenant_id=$1 AND mapping.organisation_id=$2
            ORDER BY role.role_name`,
      values: [access.tenantId, organisationId],
    }),
  ]);
  return { roles: roles.rows, mappings: mappings.rows };
};
