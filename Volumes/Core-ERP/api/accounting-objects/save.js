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
  defaultWorkflowStepCode,
  prepareResourceAssignments,
} = require("../_shared/erp");

module.exports = async (ctx) => {
  if (ctx.req.method !== "POST")
    return ctx.send(405, { error: "POST required" });
  const access = await authTenant(ctx);
  if (access.status) return ctx.send(access.status, access.body);
  const submittedId = nullable(ctx.body.accounting_object_id);
  const id = submittedId || randomUUID();
  const orgId = ctx.body.organisation_id;
  const typeId = ctx.body.accounting_object_type_id;
  const divisionId = ctx.body.owner_division_id;
  const parentId = nullable(ctx.body.parent_accounting_object_id);
  const code = clean(ctx.body.object_code);
  const name = clean(ctx.body.object_name);
  if (!orgId || !typeId || !divisionId || !code || !name)
    return ctx.send(400, {
      error: "Organisation, type, division, code and name are required",
    });
  const moduleDenied = await requireModuleAccess(ctx, access, {
    organisationId: orgId,
    resourceKind: "accounting_object_type",
    resourceCode: typeId,
  });
  if (moduleDenied) return ctx.send(moduleDenied.status, moduleDenied.body);
  const permissionDenied = await requireResourcePermission(ctx, access, {
    organisationId: orgId,
    divisionId,
    resourceKind: "accounting_object",
    resourceCode: typeId,
    workflowStatus: "*",
  });
  if (permissionDenied)
    return ctx.send(permissionDenied.status, permissionDenied.body);
  const type = await ctx.broker("core_erp", "query", {
    text: `SELECT * FROM erp_accounting_object_type WHERE tenant_id=$1 AND organisation_id=$2 AND accounting_object_type_id=$3`,
    values: [access.tenantId, orgId, typeId],
  });
  if (!type.rowCount)
    return ctx.send(404, { error: "Accounting object type not found" });
  if (parentId) {
    if (id && parentId === id)
      return ctx.send(400, {
        error: "Accounting object cannot be its own parent",
      });
    const parent = await ctx.broker("core_erp", "query", {
      text: `SELECT accounting_object_id
            FROM erp_accounting_object
            WHERE tenant_id=$1 AND organisation_id=$2 AND accounting_object_id=$3 AND workflow_status <> 'deleted'`,
      values: [access.tenantId, orgId, parentId],
    });
    if (!parent.rowCount)
      return ctx.send(400, {
        error: "Parent accounting object must exist in the same organisation",
      });
    if (id) {
      const cycle = await ctx.broker("core_erp", "query", {
        text: `WITH RECURSIVE parent_chain AS (
                SELECT accounting_object_id,parent_accounting_object_id
                FROM erp_accounting_object
                WHERE tenant_id=$1 AND organisation_id=$2 AND accounting_object_id=$3
                UNION ALL
                SELECT parent.accounting_object_id,parent.parent_accounting_object_id
                FROM erp_accounting_object parent
                JOIN parent_chain child ON child.parent_accounting_object_id=parent.accounting_object_id
                WHERE parent.tenant_id=$1 AND parent.organisation_id=$2
              )
              SELECT 1 FROM parent_chain WHERE accounting_object_id=$4 LIMIT 1`,
        values: [access.tenantId, orgId, parentId, id],
      });
      if (cycle.rowCount)
        return ctx.send(400, {
          error: "Parent accounting object cannot create a hierarchy cycle",
        });
    }
  }
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
      text: `SELECT 1 FROM erp_accounting_object WHERE tenant_id=$1 AND organisation_id=$2 AND accounting_object_id=$3 AND workflow_status<>'deleted'`,
      values: [access.tenantId, orgId, id],
    });
    if (!existing.rowCount)
      return ctx.send(404, { error: "Accounting object not found" });
  }
  const effectiveFrom =
    nullable(ctx.body.valid_from) || new Date().toISOString().slice(0, 10);
  const resourcePlan = await prepareResourceAssignments(ctx, access, {
    organisationId: orgId,
    objectKind: "accounting_object",
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
  const initialStep = await defaultWorkflowStepCode(ctx, access, {
    organisationId: orgId,
    typeTable: "erp_accounting_object_type",
    typeIdColumn: "accounting_object_type_id",
    typeId,
  });
  const values = [
    access.tenantId,
    orgId,
    divisionId,
    typeId,
    parentId,
    code,
    name,
    effectiveFrom,
    nullable(ctx.body.valid_to),
    JSON.stringify(data),
    access.auth.email,
    initialStep,
    id,
  ];
  const text = submittedId
    ? `UPDATE erp_accounting_object
       SET owner_division_id=$3,accounting_object_type_id=$4,parent_accounting_object_id=$5,object_code=$6,object_name=$7,valid_from=COALESCE($8::date,CURRENT_DATE),valid_to=$9::date,additional_data=$10::jsonb,updated_by_email=$11,updated_at=now()
       WHERE tenant_id=$1 AND organisation_id=$2 AND accounting_object_id=$13
       `
    : `INSERT INTO erp_accounting_object(accounting_object_id,tenant_id,organisation_id,owner_division_id,accounting_object_type_id,parent_accounting_object_id,object_code,object_name,workflow_status,valid_from,valid_to,additional_data,created_by_email,updated_by_email)
       VALUES($13,$1,$2,$3,$4,$5,$6,$7,$12,COALESCE($8::date,CURRENT_DATE),$9::date,$10::jsonb,$11,$11)`;
  const statements = [{ text, values }];
  if (resourcePlan.replace) statements.push(...resourcePlan.statements);
  await ctx.broker("core_erp", "transaction", { statements });
  const r = await ctx.broker("core_erp", "query", {
    text: `SELECT * FROM erp_accounting_object WHERE tenant_id=$1 AND organisation_id=$2 AND accounting_object_id=$3`,
    values: [access.tenantId, orgId, id],
  });
  if (!r.rowCount)
    return ctx.send(404, { error: "Accounting object not found" });
  return { record: r.rows[0] };
};
