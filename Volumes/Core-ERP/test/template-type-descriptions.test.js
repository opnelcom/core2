"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { seedOrganisationDefaults, loadTemplateDefaults } = require("../api/_shared/erp/seeding");

test("template seeding supplies descriptions for every supported seeded type on insert and update", async () => {
  const calls = [];
  const ctx = {
    planning: true,
    broker: async (profile, action, args) => {
      if(args.statements)calls.push(...args.statements);else calls.push(args);
      return { rows: [{ is_template: true, tax_type_id: "tax" }] };
    },
  };
  await seedOrganisationDefaults(ctx, { tenantId: "tenant", auth: { email: "test@example.com" } }, "organisation");
  const defaults = loadTemplateDefaults();
  for (const [table, key, position] of [
    ["erp_subledger_account_type", "ledgerFamilies", 4],
    ["erp_accounting_object_type", "accountingObjectTypeSeeds", 2],
    ["erp_accounting_dimension_type", "accountingDimensionTypeSeeds", 2],
    ["erp_transaction_type", "transactionTypes", 3],
  ]) {
    const call = calls.find(item => item.text.includes(`INSERT INTO ${table}(`));
    assert.ok(call, table);
    const rows = JSON.parse(call.values[2]);
    assert.equal(rows.length, defaults[key].length, table);
    for (const seed of defaults[key]) {
      const row = rows.find(item => (item.type_code || item.ledger_family_code) === seed[0]);
      assert.ok(seed[position]?.trim(), `${table}/${seed[0]} has a description`);
      assert.equal(row.type_description, seed[position]);
    }
    assert.match(call.text, /type_description=excluded\.type_description/);
    assert.doesNotMatch(call.text, /type_name,''|family_name,''/);
  }
});
