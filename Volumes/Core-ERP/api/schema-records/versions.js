"use strict";
const { authTenant } = require("../_shared/erp");
const { classes, canReadReference, uuid } = require("../_shared/erp/schema-references");
module.exports = async ctx => {
  const access = await authTenant(ctx);
  if (access.status) return ctx.send(access.status, access.body);
  const { organisation_id: organisationId, object_kind: kind, object_id: id } = ctx.query;
  const c = classes[kind];
  if (!organisationId || !["subledger_account","accounting_object","accounting_dimension"].includes(kind) || !uuid(id)) return ctx.send(400, { error: "Organisation, versioned object kind and object ID are required" });
  const current = await ctx.broker("core_erp", "query", { text: `SELECT ${c.typeId} type_id,owner_division_id FROM ${c.table} WHERE tenant_id=$1 AND organisation_id=$2 AND ${c.id}=$3 AND workflow_status<>'deleted'`, values: [access.tenantId, organisationId, id] });
  if (!current.rowCount || !await canReadReference(ctx, access, organisationId, kind, current.rows[0])) return ctx.send(404, { error: "Object not found or not accessible" });
  const version = ctx.query.version_number ? Number(ctx.query.version_number) : null;
  if (version !== null && (!Number.isInteger(version) || version < 1)) return ctx.send(400, { error: "Invalid version number" });
  const result = await ctx.broker("core_erp", "query", {
    text: `SELECT version_number,saved_at,saved_by_email,is_baseline,
            record_json->>'${c.typeId}' type_id,record_json->>'owner_division_id' owner_division_id
            ${version ? ",record_json,schema_json,resource_assignments_json" : ""}
           FROM erp_object_data_version WHERE tenant_id=$1 AND organisation_id=$2 AND object_kind=$3 AND object_id=$4
             AND ($5::integer IS NULL OR version_number=$5) ORDER BY version_number DESC`,
    values: [access.tenantId, organisationId, kind, id, version],
  });
  const versions = [];
  for (const row of result.rows) if (await canReadReference(ctx, access, organisationId, kind, row)) {
    const { type_id, owner_division_id, ...visible } = row;
    versions.push(visible);
  }
  return { versions };
};
