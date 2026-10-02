"use strict";
const {
  authTenant,
  requireAdmin,
  clean,
  nullable,
  bool,
  parseJson,
  validateWorkflowPath,
  validateTypeResourceRoleMappings,
  saveTypeResourceRoleMappings,
} = require("../_shared/erp");
const {
  moduleIds,
  validateModules,
  replaceLinks,
} = require("../_shared/erp/modules");

module.exports = async (ctx) => {
  if (ctx.req.method !== "POST")
    return ctx.send(405, { error: "POST required" });
  const access = await authTenant(ctx);
  if (access.status) return ctx.send(access.status, access.body);
  const denied = requireAdmin(access);
  if (denied) return ctx.send(denied.status, denied.body);
  const id = nullable(ctx.body.accounting_object_type_id);
  const orgId = ctx.body.organisation_id;
  const code = clean(ctx.body.type_code).toLowerCase().replace(/\s+/g, "_");
  const name = clean(ctx.body.type_name);
  const description = clean(ctx.body.type_description);
  const workflowPathId = nullable(ctx.body.workflow_path_id);
  const selectedModules = moduleIds(ctx.body);
  if (!orgId || !code || !name || !workflowPathId)
    return ctx.send(400, {
      error: "Organisation, type code, name and workflow path are required",
    });
  const invalidWorkflow = await validateWorkflowPath(ctx, access, {
    organisationId: orgId,
    workflowPathId,
  });
  if (invalidWorkflow)
    return ctx.send(invalidWorkflow.status, invalidWorkflow.body);
  const invalidModules = await validateModules(
    ctx,
    access,
    orgId,
    selectedModules,
  );
  if (invalidModules)
    return ctx.send(invalidModules.status, invalidModules.body);
  if (Array.isArray(ctx.body.resource_role_mappings)) {
    const roleValidation = await validateTypeResourceRoleMappings(ctx, access, {
      organisationId: orgId,
      objectKind: "accounting_object",
      objectTypeId: id,
      mappings: ctx.body.resource_role_mappings,
    });
    if (roleValidation.error)
      return ctx.send(400, { error: roleValidation.error });
  }
  let schema;
  let uiSchema;
  try {
    schema = parseJson(ctx.body.schema_json, {
      type: "object",
      properties: {},
    });
    uiSchema = parseJson(ctx.body.ui_schema_json, { sections: [] });
  } catch {
    return ctx.send(400, { error: "Schema and UI schema must be valid JSON" });
  }
  const values = [
    access.tenantId,
    orgId,
    code,
    name,
    description,
    workflowPathId,
    JSON.stringify(schema),
    JSON.stringify(uiSchema),
    bool(ctx.body.is_active),
  ];
  const text = id
    ? `UPDATE erp_accounting_object_type
       SET type_code=$3,type_name=$4,type_description=$5,workflow_path_id=$6,schema_json=$7::jsonb,ui_schema_json=$8::jsonb,is_active=$9,updated_at=now()
       WHERE tenant_id=$1 AND organisation_id=$2 AND accounting_object_type_id=$10
       RETURNING *`
    : `INSERT INTO erp_accounting_object_type(tenant_id,organisation_id,type_code,type_name,type_description,workflow_path_id,schema_json,ui_schema_json,is_seeded,is_active)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,false,$9) RETURNING *`;
  const r = await ctx.broker("core_erp", "query", {
    text,
    values: id ? [...values, id] : values,
  });
  if (!r.rowCount)
    return ctx.send(404, { error: "Accounting object type not found" });
  await replaceLinks(ctx, access, orgId, {
    table: "erp_accounting_object_type_module",
    idColumn: "accounting_object_type_id",
    idValue: r.rows[0].accounting_object_type_id,
    moduleIds: selectedModules,
  });
  if (Array.isArray(ctx.body.resource_role_mappings)) {
    const roles = await saveTypeResourceRoleMappings(ctx, access, {
      organisationId: orgId,
      objectKind: "accounting_object",
      objectTypeId: r.rows[0].accounting_object_type_id,
      mappings: ctx.body.resource_role_mappings,
    });
    if (roles.error) return ctx.send(400, { error: roles.error });
  }
  return { type: r.rows[0] };
};
