"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const currency = require("../public/currency-format");
const seeds = require("../seeds/template-defaults.json");
const fs = require("node:fs");
const vm = require("node:vm");
const { validateSchema } = require("../api/_shared/erp/utils");

test("seeded currencies format and parse symbols, grouping, cents and negative values", () => {
  const symbols = { USD: "$", GBP: "£", EUR: "€", ZAR: "R" };
  for (const [currency_code, , decimal_places, , format_json] of seeds.currencies) {
    assert.equal(format_json.symbol, symbols[currency_code]);
    assert.equal(currency.settings({ currency_code }).symbol, symbols[currency_code]);
    const config = { currency_code, decimal_places, format_json };
    assert.equal(currency.validate(format_json, decimal_places), null);
    assert.equal(currency.format(1234567.89, config), `${format_json.symbol} 1,234,567.89`);
    for (const value of [0, 0.01, 1234.56, -1234.56]) assert.equal(currency.parse(currency.format(value, config), config), value);
    assert.equal(currency.parse("1,234.56", config), 1234.56);
    for (const value of ["1,23.45", "12.345", "1e3", "hello", "1.2.3", "Infinity"]) assert.ok(Number.isNaN(currency.parse(value, config)), value);
  }
});

test("editable formats support alternate separators, suffixes and zero decimals", () => {
  const config = { decimal_places: 2, format_json: { symbol: "€", symbol_position: "after", thousands_separator: ".", decimal_separator: "," } };
  assert.equal(currency.format(1234.56, config), "1.234,56 €");
  assert.equal(currency.parse("1.234,56 €", config), 1234.56);
  assert.equal(currency.parse("-1.234,56 €", config), -1234.56);
  config.format_json.thousands_separator = " ";
  assert.equal(currency.parse("1 234,56 €", config), 1234.56);
  config.decimal_places = 0;
  assert.equal(currency.format(1234, config), "1 234 €");
  assert.ok(Number.isNaN(currency.parse("1 234,56 €", config)));
  assert.ok(currency.validate({ ...config.format_json, decimal_separator: " " }, 2));
  assert.ok(currency.validate(config.format_json, 3));
});

test("capital WIP is linked to capital projects and covered by every seeded balance sheet", () => {
  const wip = seeds.chartTemplate.find((row) => row[1].includes("Work in Progress"));
  assert.deepEqual(wip.slice(2), ["asset", true, "capex_project"]);
  for (const format of seeds.financialStatementFormatSeeds.filter((row) => row.statementType === "balance")) {
    assert.ok(format.lines.some((line) => line[5]?.accounts?.includes(wip[0])), format.code);
  }
});

test("vendor and bank schemas use controlled account types and include vendor bank name", () => {
  const vendor = seeds.ledgerFamilySchemas.vendor;
  const bank = seeds.ledgerFamilySchemas.bank;
  assert.ok(vendor.tabs.find((tab) => tab.label === "Payment").fields.includes("bankName"));
  assert.deepEqual(validateSchema(vendor, { vendorType: "goods_supplier", bankAccountType: "current", bankName: "Test Bank" }), []);
  assert.ok(validateSchema(vendor, { vendorType: "invalid", bankAccountType: "invalid" }).length >= 2);
  assert.deepEqual(bank.properties.accountType.options, vendor.properties.bankAccountType.options);
});

test("currency save persists editable format and rejects invalid settings before writing", async () => {
  const calls = [];
  const scope = { module: { exports: {} }, require: (name) => name.endsWith("currency-format") ? currency : { authTenant: async () => ({ tenantId: "tenant" }), requireAdmin: () => null, clean: (value) => String(value ?? "").trim() } };
  vm.createContext(scope);
  vm.runInContext(fs.readFileSync(require.resolve("../api/currencies/save.js"), "utf8"), scope);
  const format_json = { symbol: "R", symbol_position: "after", thousands_separator: " ", decimal_separator: "," };
  const ctx = { req: { method: "POST" }, body: { organisation_id: "org", currency_code: "ZAR", currency_name: "Rand", decimal_places: 2, format_json }, send: (status, body) => ({ status, body }), broker: async (_profile, _action, query) => { calls.push(query); return { rows: [{ currency_code: query.values[2], format_json: JSON.parse(query.values[5]) }] }; } };
  const result = await scope.module.exports(ctx);
  assert.deepEqual(result.currency.format_json, format_json);
  assert.equal(currency.format(1234.56, result.currency), "1 234,56 R");
  ctx.body.format_json.decimal_separator = " ";
  assert.equal((await scope.module.exports(ctx)).status, 400);
  ctx.body.format_json = undefined;
  ctx.body.decimal_places = 3;
  assert.equal((await scope.module.exports(ctx)).status, 400);
  assert.equal(calls.length, 1);
});
