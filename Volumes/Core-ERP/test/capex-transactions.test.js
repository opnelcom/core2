"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const seeds = require("../seeds/template-defaults.json");
const CurrencyFormat = require("../public/currency-format");
const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const routes = [
  ["capex_purchase_account", "2000", "vendor", false],
  ["capex_purchase_bank", "1010", "bank", false],
  ["capex_purchase_cash", "1000", "cash_point", false],
  ["capex_credit_note", "2000", "vendor", true],
];

for (const [code, settlementGl, settlementType, reduction] of routes) {
  test(`${code} requires project WIP, supports optional VAT and balances the correct settlement`, () => {
    const type = seeds.transactionTypes.find((row) => row[0] === code);
    assert.ok(type);
    assert.equal(type[5], false, "Capture should use only the configured lines");
    const definitions = seeds.lineDefinitionSeeds.filter((row) => row[0] === code);
    assert.equal(definitions.length, 3);
    const [wip, vat, settlement] = definitions;
    assert.deepEqual(wip.slice(2, 6), [reduction ? "credit" : "debit", "1320", true, "capex_project"]);
    assert.equal(wip[7], "required");
    assert.deepEqual(vat.slice(2, 6), [reduction ? "credit" : "debit", "2200", false, null]);
    assert.equal(vat[7], "optional");
    assert.deepEqual(settlement.slice(2, 6), [reduction ? "debit" : "credit", settlementGl, true, settlementType]);
    assert.equal(settlement[7], "generated");
    assert.equal(settlement[9], "balancing");
    const rows = [];
    const currency = { currency_code: "ZAR", decimal_places: 2 };
    const state = { lineDefinitions: definitions.map((line) => ({ transaction_line_definition_id: `${code}_${line[1]}`, debit_credit: line[2], amount_source: line[9] })) };
    const scope = { state, document: { querySelectorAll: () => rows }, parseOrgMoney: (value) => CurrencyFormat.parse(value, currency), formatOrgMoney: (value) => CurrencyFormat.format(value, currency), journalDefinitionFor: (id) => state.lineDefinitions.find((line) => line.transaction_line_definition_id === id) };
    vm.createContext(scope);
    vm.runInContext(source.slice(source.indexOf("  function recalculateBalancingLines("), source.indexOf("  const classificationValueCache")), scope);
    const row = (definition, amount) => {
      const controls = { ".line-definition": { value: definition.transaction_line_definition_id }, ".line-drcr": { value: definition.debit_credit }, ".line-amount": { value: amount } };
      return { controls, querySelector: (selector) => controls[selector] };
    };
    rows.push(row(state.lineDefinitions[0], "R 1,000.00"), row(state.lineDefinitions[2], ""));
    scope.recalculateBalancingLines();
    assert.equal(rows[1].controls[".line-amount"].value, "R 1,000.00");
    rows.push(row(state.lineDefinitions[1], "R 150.00"));
    scope.recalculateBalancingLines();
    assert.equal(rows[1].controls[".line-amount"].value, "R 1,150.00");
    const modules = seeds.moduleMappings.transactionTypeAdditions[code];
    assert.ok(modules.includes("procurement") && modules.includes("project_management"));
    if (["bank", "cash_point"].includes(settlementType)) assert.ok(modules.includes("treasury_cash"));
  });
}

for (const [code, gl, subledger] of [["capex_refund_bank", "1010", "bank"], ["capex_refund_cash", "1000", "cash_point"]]) {
  test(`${code} clears the vendor credit and does not reduce WIP or VAT again`, () => {
    const type = seeds.transactionTypes.find((row) => row[0] === code);
    assert.equal(type[5], false);
    const lines = seeds.lineDefinitionSeeds.filter((row) => row[0] === code);
    assert.equal(lines.length, 2);
    const [vendor, receipt] = lines;
    assert.deepEqual(vendor.slice(2, 6), ["credit", "2000", true, "vendor"]);
    assert.equal(vendor[7], "required");
    assert.deepEqual(receipt.slice(2, 6), ["debit", gl, true, subledger]);
    assert.equal(receipt[7], "generated");
    assert.equal(receipt[9], "balancing");
    assert.ok(lines.every((line) => !["1320", "2200"].includes(line[3])));
  });
}
