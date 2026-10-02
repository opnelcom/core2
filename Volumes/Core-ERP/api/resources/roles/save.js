"use strict";
const {
  authTenant,
  requireAdmin,
  clean,
  nullable,
  bool,
} = require("../../_shared/erp");
const { moduleIds, validateModules } = require("../../_shared/erp/modules");

module.exports = async (ctx) => {
  if (ctx.req.method !== "POST")
    return ctx.send(405, { error: "POST required" });
  const access = await authTenant(ctx);
  if (access.status) return ctx.send(access.status, access.body);
  const denied = requireAdmin(access);
  if (denied) return ctx.send(denied.status, denied.body);
  const organisationId = ctx.body.organisation_id;
  const id = nullable(ctx.body.resource_role_id);
  const code = clean(ctx.body.role_code)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const name = clean(ctx.body.role_name);
  const description = clean(ctx.body.role_description);
  const isActive = bool(ctx.body.is_active);
  const selectedModules = moduleIds(ctx.body);
  if (!organisationId || !code || !name)
    return ctx.send(400, {
      error: "Organisation, role code and name are required",
    });
  const invalidModules = selectedModules.length
    ? await validateModules(ctx, access, organisationId, selectedModules)
    : null;
  if (invalidModules)
    return ctx.send(invalidModules.status, invalidModules.body);
  if (!isActive && id) {
    const use = await ctx.broker("core_erp", "query", {
      text: `SELECT 1 FROM erp_object_type_resource_role WHERE resource_role_id=$1
            UNION ALL SELECT 1 FROM erp_resource_assignment WHERE resource_role_id=$1 LIMIT 1`,
      values: [id],
    });
    if (use.rowCount)
      return ctx.send(409, {
        error:
          "A Resource Role used by object types or assignments cannot be deactivated",
      });
  }
  const saved = id
    ? await ctx.broker("core_erp", "query", {
        text: `UPDATE erp_resource_role SET role_code=$3,role_name=$4,role_description=$5,is_active=$6,updated_at=now()
              WHERE tenant_id=$1 AND organisation_id=$2 AND resource_role_id=$7 RETURNING *`,
        values: [
          access.tenantId,
          organisationId,
          code,
          name,
          description,
          isActive,
          id,
        ],
      })
    : await ctx.broker("core_erp", "query", {
        text: `INSERT INTO erp_resource_role(tenant_id,organisation_id,role_code,role_name,role_description,is_active,is_seeded)
              VALUES($1,$2,$3,$4,$5,$6,false) RETURNING *`,
        values: [
          access.tenantId,
          organisationId,
          code,
          name,
          description,
          isActive,
        ],
      });
  if (!saved.rowCount)
    return ctx.send(404, { error: "Resource Role was not found" });
  const statements = [
    {
      text: "DELETE FROM erp_resource_role_module WHERE resource_role_id=$1",
      values: [saved.rows[0].resource_role_id],
    },
  ];
  selectedModules.forEach((moduleId) =>
    statements.push({
      text: "INSERT INTO erp_resource_role_module(resource_role_id,module_id) VALUES($1,$2)",
      values: [saved.rows[0].resource_role_id, moduleId],
    }),
  );
  await ctx.broker("core_erp", "transaction", { statements });
  return { role: saved.rows[0] };
};
