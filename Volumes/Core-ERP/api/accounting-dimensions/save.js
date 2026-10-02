"use strict";
const { randomUUID } = require("crypto");
const {
  authTenant,
  clean,
  nullable,
  parseJson,
  validateSchema,
  requireModuleAccess,
  requireResourcePermission,
  prepareResourceAssignments,
} = require("../_shared/erp");

module.exports = async (ctx) => {
  if (ctx.req.method !== "POST")
    return ctx.send(405, { error: "POST required" });
  const access = await authTenant(ctx);
  if (access.status) return ctx.send(access.status, access.body);
  const submittedId = nullable(ctx.body.accounting_dimension_id);
  const id = submittedId || randomUUID();
  const orgId = ctx.body.organisation_id;
  const typeId = ctx.body.accounting_dimension_type_id;
  const divisionId = ctx.body.owner_division_id;
  const code = clean(ctx.body.dimension_code);
  const name = clean(ctx.body.dimension_name);
  if (!orgId || !typeId || !divisionId || !code || !name)
    return ctx.send(400, {
      error: "Organisation, type, division, code and name are required",
    });
  const moduleDenied = await requireModuleAccess(ctx, access, {
    organisationId: orgId,
    resourceKind: "accounting_dimension_type",
    resourceCode: typeId,
  });
  if (moduleDenied) return ctx.send(moduleDenied.status, moduleDenied.body);
  const permissionDenied = await requireResourcePermission(ctx, access, {
    organisationId: orgId,
    divisionId,
    resourceKind: "accounting_dimension",
    resourceCode: typeId,
    workflowStatus: "*",
  });
  if (permissionDenied)
    return ctx.send(permissionDenied.status, permissionDenied.body);
  const type = await ctx.broker("core_erp", "query", {
    text: `SELECT * FROM erp_accounting_dimension_type WHERE tenant_id=$1 AND organisation_id=$2 AND accounting_dimension_type_id=$3`,
    values: [access.tenantId, orgId, typeId],
  });
  if (!type.rowCount)
    return ctx.send(404, { error: "Accounting dimension type not found" });
  let data;
  try {
    data = parseJson(ctx.body.additional_data, {});
  } catch {
    return ctx.send(400, { error: "Additional data must be valid JSON" });
  }
  const errors = validateSchema(type.rows[0].schema_json, data);
  if (errors.length)
    return ctx.send(400, { error: "Additional data is invalid", errors });
  if (submittedId) {
    const existing = await ctx.broker("core_erp", "query", {
      text: `SELECT 1 FROM erp_accounting_dimension WHERE tenant_id=$1 AND organisation_id=$2 AND accounting_dimension_id=$3 AND workflow_status<>'deleted'`,
      values: [access.tenantId, orgId, id],
    });
    if (!existing.rowCount)
      return ctx.send(404, { error: "Accounting dimension not found" });
  }
  const effectiveFrom =
    nullable(ctx.body.valid_from) || new Date().toISOString().slice(0, 10);
  const resourcePlan = await prepareResourceAssignments(ctx, access, {
    organisationId: orgId,
    objectKind: "accounting_dimension",
    objectTypeId: typeId,
    objectId: id,
    validFrom: effectiveFrom,
    validTo: nullable(ctx.body.valid_to),
    assignments: ctx.body.resource_assignments,
    isNew: !submittedId,
  });
  if (resourcePlan.errors.length)
    return ctx.send(400, {
      error: "Resource assignments are invalid",
      errors: resourcePlan.errors,
    });
  const values = [
    access.tenantId,
    orgId,
    divisionId,
    typeId,
    code,
    name,
    effectiveFrom,
    nullable(ctx.body.valid_to),
    JSON.stringify(data),
    access.auth.email,
    id,
  ];
  const text = submittedId
    ? `UPDATE erp_accounting_dimension
       SET owner_division_id=$3,accounting_dimension_type_id=$4,dimension_code=$5,dimension_name=$6,valid_from=COALESCE($7::date,CURRENT_DATE),valid_to=$8::date,additional_data=$9::jsonb,updated_by_email=$10,updated_at=now()
       WHERE tenant_id=$1 AND organisation_id=$2 AND accounting_dimension_id=$11`
    : `INSERT INTO erp_accounting_dimension(accounting_dimension_id,tenant_id,organisation_id,owner_division_id,accounting_dimension_type_id,dimension_code,dimension_name,workflow_status,valid_from,valid_to,additional_data,created_by_email,updated_by_email)
       VALUES($11,$1,$2,$3,$4,$5,$6,'draft',COALESCE($7::date,CURRENT_DATE),$8::date,$9::jsonb,$10,$10)`;
  const statements = [{ text, values }];
  if (resourcePlan.replace) statements.push(...resourcePlan.statements);
  await ctx.broker("core_erp", "transaction", { statements });
  const r = await ctx.broker("core_erp", "query", {
    text: `SELECT * FROM erp_accounting_dimension WHERE tenant_id=$1 AND organisation_id=$2 AND accounting_dimension_id=$3`,
    values: [access.tenantId, orgId, id],
  });
  if (!r.rowCount)
    return ctx.send(404, { error: "Accounting dimension not found" });
  return { record: r.rows[0] };
};
