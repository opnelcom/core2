"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { auditTemplateSchemas } = require("../../../Tools/ERP/audit-template-schemas");
const seeds = require("../seeds/template-defaults.json");

test("template asset locations reference Property accounting objects", () => {
  const location = seeds.ledgerFamilySchemas.asset.properties.location;
  assert.equal(location.type, "reference");
  assert.deepEqual(location.target, { class: "accounting_object", types: ["property"] });
  assert.ok(seeds.accountingObjectTypeSeeds.some(([code]) => code === "property"));
  assert.equal(location.maxLength, undefined);
});

test("all seeded type schemas follow the documented canonical convention", () => {
  const result = auditTemplateSchemas(seeds);
  assert.deepEqual(result.errors, []);
  assert.equal(result.inventory.length, seeds.ledgerFamilies.length + seeds.accountingObjectTypeSeeds.length + seeds.accountingDimensionTypeSeeds.length);
});
test("the audit detects broken tab references and duplicate choice definitions", () => {
  const source = structuredClone(seeds);
  source.ledgerFamilySchemas.bank.tabs[0].fields.push("unknownField", "bankName");
  source.ledgerFamilySchemas.bank.properties.accountType.enum = ["current"];
  const { errors } = auditTemplateSchemas(source);
  assert.ok(errors.some((error) => error.includes("unknown field unknownField")));
  assert.ok(errors.some((error) => error.includes("duplicate tab field bankName")));
  assert.ok(errors.some((error) => error.includes("use one choice definition")));
});
test("the audit detects missing type schemas and sample-data incompatibility", () => {
  const source = structuredClone(seeds);
  delete source.accountingDimensionTypeMetadata.service;
  source.accountingObjectTypeMetadata.property.schema_json.required = ["physicalAddress"];
  const { errors } = auditTemplateSchemas(source);
  assert.ok(errors.some((error) => error.includes("accounting dimension/service: missing schema")));
  assert.ok(errors.some((error) => error.includes("DEMO-PROPERTY") && error.includes("physicalAddress is required")));
});
