"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { validateSchema, validateSchemaDefinition } = require("../api/_shared/erp/utils");
const { upgradeSeededSchema, upgradeSeededFieldAttributes } = require("../api/_shared/erp/schema-attributes");
const seeds = require("../seeds/template-defaults.json");
const amount = { properties: { amount: { type: "currency", precision: 14, scale: 2 } } };

test("currency accepts the exact upper boundary and rejects excess digits or decimals", () => {
  for (const value of ["999999999999.99", "0.01", "-12.30", 123.45]) assert.deepEqual(validateSchema(amount, { amount: value }), []);
  for (const value of ["1000000000000.00", "12.345", "1e3", "NaN", {}, Infinity]) assert.ok(validateSchema(amount, { amount: value }).length);
});
test("integer rejects fractions, strings and unsafe values; bounds are enforced", () => {
  const schema = { properties: { months: { type: "integer", minimum: 1, maximum: 600 } } };
  assert.deepEqual(validateSchema(schema, { months: 120 }), []);
  for (const months of [0, 601, 1.5, "12", Number.MAX_SAFE_INTEGER + 1]) assert.ok(validateSchema(schema, { months }).length);
});
test("text lengths, patterns, choices and optional blank values are validated", () => {
  const schema = { properties: { code: { type: "short_text", maxLength: 3, pattern: "[A-Z]+" }, name: { type: "text", minLength: 2 }, status: { type: "select", enum: ["active", "closed"] } } };
  assert.deepEqual(validateSchema(schema, { code: "ZAR", name: "AB", status: "active" }), []);
  assert.deepEqual(validateSchema(schema, { code: "", name: null }), []);
  for (const data of [{ code: "LONG" }, { code: "zar" }, { name: "A" }, { status: "other" }]) assert.ok(validateSchema(schema, data).length);
});
test("dates, email and URL fields validate their formats", () => {
  const schema = { properties: { date: { type: "date" }, email: { type: "email" }, website: { type: "url" } } };
  assert.deepEqual(validateSchema(schema, { date: "2024-02-29", email: "user@example.com", website: "https://example.com" }), []);
  assert.equal(validateSchema(schema, { date: "2025-02-29", email: "invalid", website: "javascript:alert(1)" }).length, 3);
});
test("all seeded classes have valid schemas and every populated field has a width and relevant limits", () => {
  const schemas = [...Object.values(seeds.ledgerFamilySchemas), ...Object.values(seeds.accountingObjectTypeMetadata).map((meta) => meta.schema_json), ...Object.values(seeds.accountingDimensionTypeMetadata).map((meta) => meta.schema_json), seeds.customerSchema];
  assert.equal(Object.keys(seeds.accountingObjectTypeMetadata).length, seeds.accountingObjectTypeSeeds.length);
  assert.equal(Object.keys(seeds.accountingDimensionTypeMetadata).length, seeds.accountingDimensionTypeSeeds.length);
  for (const schema of schemas) {
    assert.deepEqual(validateSchemaDefinition(schema), []);
    for (const field of Object.values(schema.properties || {})) {
      assert.ok(field.uiWidth);
      if (["short_text", "text", "long_text", "email"].includes(field.type)) assert.ok(field.maxLength > 0);
      if (["currency", "decimal"].includes(field.type)) assert.ok(field.precision > field.scale);
      if (field.type === "long_text") assert.ok(field.rows > 0);
    }
  }
  assert.equal(seeds.ledgerFamilySchemas.asset.properties.usefulLifeMonths.type, "integer");
  assert.equal(seeds.ledgerFamilySchemas.loan.properties.principalAmount.type, "currency");
  assert.equal(seeds.accountingObjectTypeMetadata.property.schema_json.properties.areaSqm.type, "decimal");
});
test("invalid attribute definitions are rejected", () => {
  for (const field of [{ type: "currency", precision: 2, scale: 2 }, { type: "text", maxLength: -1 }, { type: "text", uiWidth: "huge" }, { type: "integer", minimum: 5, maximum: 1 }, { pattern: "[" }]) assert.ok(validateSchemaDefinition({ properties: { field } }).length);
});
test("seed upgrades preserve custom fields, tabs and explicit limits and are idempotent", () => {
  const original = { tabs: [{ label: "Custom", fields: ["code"] }], properties: { code: { type: "string", maxLength: 80 }, custom: { type: "text" } } };
  const seeded = { type: "object", properties: { code: { type: "short_text", maxLength: 30, uiWidth: "short" }, omitted: { type: "text" } } };
  const upgraded = upgradeSeededSchema(original, seeded);
  assert.equal(upgraded.properties.code.type, "short_text");
  assert.equal(upgraded.properties.code.maxLength, 80);
  assert.deepEqual(upgraded.tabs, original.tabs);
  assert.deepEqual(upgraded.properties.custom, original.properties.custom);
  assert.equal(upgraded.properties.omitted, undefined);
  assert.deepEqual(upgradeSeededSchema(upgraded, seeded), upgraded);
  assert.equal(original.properties.code.type, "string");
});
test("database seed upgrades remain tenant and seeded scoped", async () => {
  const calls = [];
  const ctx = { broker: async (_profile, _action, query) => {
    calls.push(query);
    if (query.text.startsWith("SELECT")) return { rows: query.text.includes("erp_subledger_account_type") ? [{ id: "type-1", type_code: "bank", schema_json: { properties: { branchCode: { type: "string" } } } }] : [] };
    return { rowCount: 1 };
  } };
  assert.equal(await upgradeSeededFieldAttributes(ctx, "tenant-1", seeds), 1);
  assert.ok(calls.every((call) => call.text.includes("tenant_id=$1") && call.text.includes("is_seeded=true")));
  assert.equal(calls.find((call) => call.text.startsWith("UPDATE")).values[0], "tenant-1");
});
