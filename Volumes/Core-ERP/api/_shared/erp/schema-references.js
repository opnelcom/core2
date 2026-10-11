"use strict";
const { requireModuleAccess, hasResourcePermission, hasOrganisationResourcePermission } = require("./access");
const { referenceFields } = require("./schema-grids");

const classes = {
  resource: { table: "erp_resource", id: "resource_id", code: "resource_code", name: "display_name", type: "resource_type", organisationLevel: true },
  legal_entity: { table: "erp_legal_entity", id: "legal_entity_id", code: "known_name", name: "legal_name", type: "entity_type", organisationLevel: true },
  gl_account: { table: "erp_gl_account", id: "gl_account_id", code: "account_code", name: "account_name", typeTable: "erp_gl_account_type", typeId: "gl_account_type_id", organisationLevel: true },
  subledger_account: { table: "erp_subledger_account", id: "subledger_account_id", code: "account_code", name: "account_name", typeTable: "erp_subledger_account_type", typeId: "subledger_account_type_id" },
  accounting_object: { table: "erp_accounting_object", id: "accounting_object_id", code: "object_code", name: "object_name", typeTable: "erp_accounting_object_type", typeId: "accounting_object_type_id" },
  accounting_dimension: { table: "erp_accounting_dimension", id: "accounting_dimension_id", code: "dimension_code", name: "dimension_name", typeTable: "erp_accounting_dimension_type", typeId: "accounting_dimension_type_id" },
};
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

async function canReadReference(ctx, access, organisationId, kind, row) {
  const c = classes[kind];
  if (!c) return false;
  if (c.organisationLevel) {
    return await hasOrganisationResourcePermission(ctx, access, { organisationId, resourceKind: kind, resourceCode: "*", workflowStatus: "view" }) ||
      await hasOrganisationResourcePermission(ctx, access, { organisationId, resourceKind: kind, resourceCode: "*", workflowStatus: "manage" });
  }
  if (await requireModuleAccess(ctx, access, { organisationId, resourceKind: `${kind}_type`, resourceCode: row.type_id })) return false;
  return hasResourcePermission(ctx, access, { organisationId, divisionId: row.owner_division_id, resourceKind: kind, resourceCode: row.type_id, workflowStatus: "view" });
}

async function lookupReferences(ctx, access, organisationId, target, { search = "", selectedId = "", exact = false, source = null } = {}) {
  if (Array.isArray(target?.anyOf)) {
    const records = [];
    for (const alternative of target.anyOf) {
      const prefix = `${alternative.class}:`;
      if (exact && !selectedId.startsWith(prefix)) continue;
      const rows = await lookupReferences(ctx, access, organisationId, alternative, {
        search, exact, selectedId: selectedId.startsWith(prefix) ? selectedId.slice(prefix.length) : ""
      });
      records.push(...rows.map(row => ({ ...row, id: prefix + row.id, object_class: alternative.class })));
    }
    const allowed = source ? await sourceReferenceValues(ctx, access, organisationId, source) : null;
    return records.filter((row,index) => (!allowed || allowed.has(row.id)) && records.findIndex(item=>item.id===row.id)===index);
  }
  const c = classes[target?.class];
  if (!c || (selectedId && !uuid(selectedId))) return [];
  const typeExpr = c.type ? `r.${c.type}` : "t.type_code";
  const joined = c.typeTable ? `LEFT JOIN ${c.typeTable} t ON t.${c.typeId}=r.${c.typeId} AND t.tenant_id=r.tenant_id AND t.organisation_id=r.organisation_id` : "";
  const available = target.class === "resource" ? "r.is_active=true" : "r.workflow_status NOT IN ('deleted','archived','blocked')";
  const notDeleted = target.class === "resource" ? "true" : "r.workflow_status<>'deleted'";
  const result = await ctx.broker("core_erp", "query", {
    text: `SELECT r.${c.id} id,r.${c.code} code,r.${c.name} name,${typeExpr} type_code,
             ${c.organisationLevel ? "NULL::uuid" : "r.owner_division_id"} owner_division_id,
             ${c.typeId ? `r.${c.typeId}` : "NULL::uuid"} type_id
           FROM ${c.table} r ${joined}
           WHERE r.tenant_id=$1 AND r.organisation_id=$2 AND ${notDeleted}
             AND (cardinality($3::text[])=0 OR ${typeExpr}=ANY($3::text[]))
             AND (($5::uuid IS NOT NULL AND r.${c.id}=$5::uuid) OR (NOT $6::boolean AND ${available} AND (r.${c.code} ILIKE $4 OR r.${c.name} ILIKE $4)))
           ORDER BY (r.${c.id}=$5::uuid) DESC NULLS LAST,r.${c.name},r.${c.id}`,
    values: [access.tenantId, organisationId, target.types || [], `%${String(search).slice(0,150)}%`, selectedId || null, exact],
  });
  const visible = [];
  const permissionCache = new Map();
  for (const row of result.rows) {
    const key = `${row.type_id}:${row.owner_division_id}`;
    if (!permissionCache.has(key)) permissionCache.set(key, await canReadReference(ctx, access, organisationId, target.class, row));
    if (permissionCache.get(key)) visible.push(row);
  }
  const allowed = source ? await sourceReferenceValues(ctx, access, organisationId, source) : null;
  return visible.filter(row => !allowed || allowed.has(row.id));
}

async function sourceReferenceValues(ctx, access, organisationId, source) {
  const c = classes[source.class];
  if (!c || !["accounting_object","accounting_dimension","subledger_account"].includes(source.class) || !uuid(source.id)) return new Set();
  const references = await lookupReferences(ctx, access, organisationId, { class: source.class }, { selectedId: source.id, exact: true });
  if (!references.length) return new Set();
  const result = await ctx.broker("core_erp", "query", {
    text: `SELECT additional_data FROM ${c.table} WHERE tenant_id=$1 AND organisation_id=$2 AND ${c.id}=$3`,
    values: [access.tenantId, organisationId, source.id],
  });
  const rows = result.rows[0]?.additional_data?.[source.grid];
  return new Set((Array.isArray(rows) ? rows : []).map(row => row?.[source.column]).filter(value => typeof value === "string"));
}

async function validateSchemaReferences(ctx, access, organisationId, schema, data) {
  const errors = [], cache = new Map();
  for (const { field, value, name } of referenceFields(schema, data)) {
    const rule = field.referenceSource;
    const sourceField = rule && schema.properties?.[rule.field];
    const source = rule ? { class: sourceField?.target?.class, id: data?.[rule.field], grid: rule.grid, column: rule.column } : null;
    const key = JSON.stringify([field.target, value, source]);
    if (!cache.has(key)) cache.set(key, await lookupReferences(ctx, access, organisationId, field.target, { selectedId: value, exact: true, source }));
    if (!cache.get(key).length) errors.push(`${name}: select an accessible ${field.target?.class || "ERP object"} in this organisation and of the permitted type`);
  }
  return errors;
}
module.exports = { sourceReferenceValues, classes, lookupReferences, validateSchemaReferences, canReadReference, uuid };
