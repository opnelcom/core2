"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const seeds = require("../seeds/template-defaults.json");

const expected = {
  asset_capex_wip: [10, /^(capex_|(?:ppe|ip_cost|ip_fair_value|intangible)_commission_wip$)/],
  asset_ppe: [9, /^ppe_(purchase_|depreciation$|impairment|disposal_)/],
  asset_ip_cost: [9, /^ip_cost_(?!commission_)/],
  asset_ip_fair_value: [8, /^ip_fair_value_(purchase_|disposal_|increase$|decrease$)/],
  asset_intangibles: [9, /^intangible_(?!commission_)/],
  asset_rou_leases: [14, /^rou_/],
  asset_transfers: [8, /^(asset_ppe_to_asset_ip|asset_ip_to_asset_ppe|ip_fair_value_to_ppe|ppe_to_ip_fair_value|ppe_to_ip_increase_reserve|ppe_to_ip_increase_profit|ppe_to_ip_decrease_expense|ppe_to_ip_decrease_reserve)$/]
};

test("asset seed groups allocate all 67 existing transaction types by asset class and change of use", () => {
  assert.ok(!seeds.transactionGroups.some(row => row[0] === "assets"));
  assert.ok(!seeds.transactionTypes.some(row => row[1] === "assets"));
  let count = 0;
  for (const [code, [size, pattern]] of Object.entries(expected)) {
    assert.equal(seeds.transactionGroups.filter(row => row[0] === code).length, 1);
    const types = seeds.transactionTypes.filter(row => row[1] === code);
    assert.equal(types.length, size, code);
    for (const row of types) assert.match(row[0], pattern, code);
    count += types.length;
  }
  assert.equal(count, 67);
  const groupCodes = new Set(seeds.transactionGroups.map(row => row[0]));
  for (const row of seeds.transactionTypes) assert.ok(groupCodes.has(row[1]), row[0]);
  assert.equal(new Set(seeds.transactionTypes.map(row => row[0])).size, seeds.transactionTypes.length);
});

test("replacement asset groups retain module visibility and Procurement workflow permissions", () => {
  assert.equal(seeds.moduleMappings.transactionGroups.assets, undefined);
  assert.ok(!seeds.rolePermissionSeeds.some(row => row[1] === "transaction" && row[2] === "assets"));
  for (const code of Object.keys(expected)) {
    assert.deepEqual(seeds.moduleMappings.transactionGroups[code], ["asset_management", "procurement", "finance"]);
    const permissions = seeds.rolePermissionSeeds.filter(row => row[0] === "organisation_procurement_user" && row[1] === "transaction" && row[2] === code);
    assert.deepEqual(permissions.map(row => row[3]).sort(), ["draft", "submitted", "view"]);
  }
});
