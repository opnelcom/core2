"use strict";
const { isDeepStrictEqual } = require("node:util");

// Enrich existing seeded fields without replacing custom fields, tabs or limits.
function upgradeSeededSchema(current = {}, seeded = {}, { addGrids = false } = {}) {
  const result = { ...current, type: current.type || seeded.type || "object", properties: { ...(current.properties || {}) } };
  for (const [name, field] of Object.entries(current.properties || {})) {
    const defaults = seeded.properties?.[name];
    if (!defaults) continue;
    const applicable = { ...defaults };
    if (!addGrids) delete applicable.sortOrder;
    result.properties[name] = { ...applicable, ...field };
    if (addGrids && field.type === "grid" && defaults.type === "grid") {
      result.properties[name].rowSchema = upgradeSeededSchema(field.rowSchema || {}, defaults.rowSchema || {}, { addGrids: true });
    }
    if (["string", "number"].includes(field.type)) result.properties[name].type = defaults.type;
  }
  if (addGrids) {
    const added = [];
    for (const [name, field] of Object.entries(seeded.properties || {})) if (field.type === "grid" && !Object.prototype.hasOwnProperty.call(result.properties, name)) {
      result.properties[name] = field; added.push(name);
    }
    if (added.length) {
      result.tabs = [...(current.tabs || [])];
      for (const tab of seeded.tabs || []) {
        const fields = tab.fields.filter(name => added.includes(name));
        if (fields.length) result.tabs.push({ ...tab, fields });
      }
    }
  }
  return result;
}

async function upgradeSeededFieldAttributes(ctx, tenantId, defaults) {
  const classes = [
    ["erp_subledger_account_type", "subledger_account_type_id", defaults.ledgerFamilySchemas],
    ["erp_accounting_object_type", "accounting_object_type_id", Object.fromEntries(Object.entries(defaults.accountingObjectTypeMetadata || {}).map(([code, metadata]) => [code, metadata.schema_json]))],
    ["erp_accounting_dimension_type", "accounting_dimension_type_id", Object.fromEntries(Object.entries(defaults.accountingDimensionTypeMetadata || {}).map(([code, metadata]) => [code, metadata.schema_json]))],
  ];
  let updated = 0;
  for (const [table, idColumn, schemas] of classes) {
    const records = await ctx.broker("core_erp", "query", {
      text: `SELECT t.${idColumn} id,t.type_code,t.schema_json,o.is_template FROM ${table} t JOIN erp_organisation o ON o.organisation_id=t.organisation_id AND o.tenant_id=t.tenant_id WHERE t.tenant_id=$1 AND t.is_seeded=true`,
      values: [tenantId],
    });
    for (const record of records.rows) {
      const seeded = schemas?.[record.type_code];
      if (!seeded) continue;
      const upgraded = upgradeSeededSchema(record.schema_json || {}, seeded, { addGrids: record.is_template === true });
      if (isDeepStrictEqual(upgraded, record.schema_json)) continue;
      await ctx.broker("core_erp", "query", {
        text: `UPDATE ${table} SET schema_json=$3::jsonb,updated_at=now() WHERE tenant_id=$1 AND ${idColumn}=$2 AND is_seeded=true`,
        values: [tenantId, record.id, JSON.stringify(upgraded)],
      });
      updated++;
    }
  }
  return updated;
}

module.exports = { upgradeSeededSchema, upgradeSeededFieldAttributes };
