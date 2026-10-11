"use strict";
const { authTenant } = require("../_shared/erp");
const { canReadReference, uuid } = require("../_shared/erp/schema-references");
module.exports = async ctx => {
  const access = await authTenant(ctx);
  if (access.status) return ctx.send(access.status, access.body);
  const { organisation_id: org, object_kind: kind, field_key: field, as_at: asAt } = ctx.query;
  if (!org || !["subledger_account","accounting_object","accounting_dimension"].includes(kind)) return ctx.send(400, { error: "Organisation and object_kind are required" });
  const objectId = ctx.query.object_id || null, typeId = ctx.query.type_id || null;
  if (objectId && !uuid(objectId) || typeId && !uuid(typeId)) return ctx.send(400, { error: "Invalid object_id or type_id" });
  if (asAt && (!/^\d{4}-\d{2}-\d{2}$/.test(asAt) || !Number.isFinite(Date.parse(asAt)) || new Date(asAt).toISOString().slice(0,10)!==asAt)) return ctx.send(400, { error: "as_at must be a valid date" });
  const offset = Math.max(0, Number(ctx.query.offset) || 0);
  if (!Number.isSafeInteger(offset)) return ctx.send(400, { error: "Invalid offset" });
  const r = await ctx.broker("core_erp", "query", {
    text: `SELECT * FROM erp_schema_grid_report WHERE tenant_id=$1 AND organisation_id=$2 AND object_kind=$3
           AND ($4::text IS NULL OR field_key=$4)
           AND ($7::uuid IS NULL OR object_id=$7) AND ($8::uuid IS NULL OR type_id=$8)
           AND ($5::date IS NULL OR grid_schema_json->'periodControl' IS NULL OR
             ((row_data->>(grid_schema_json->'periodControl'->>'from'))::date<=$5::date AND
              (NULLIF(row_data->>(grid_schema_json->'periodControl'->>'to'),'') IS NULL OR NULLIF(row_data->>(grid_schema_json->'periodControl'->>'to'),'')::date>=$5::date)))
           ORDER BY object_id,field_key,row_index LIMIT 101 OFFSET $6`,
    values: [access.tenantId, org, kind, field || null, asAt || null, offset, objectId, typeId],
  });
  const rows = [], cache = new Map();
  for (const row of r.rows.slice(0,100)) {
    const key = `${row.type_id}:${row.owner_division_id}`;
    if (!cache.has(key)) cache.set(key, await canReadReference(ctx, access, org, kind, row));
    if (cache.get(key)) rows.push(row);
  }
  return { rows, next_offset: r.rows.length > 100 ? offset + 100 : null };
};
