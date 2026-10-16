"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
test("shared setup grid preserves literal values and activates rows with Enter and Space", () => {
  class Node {
    constructor() { this.children = []; this.events = {}; this.classList = { add() {} }; }
    append(value) { this.children.push(value); }
    addEventListener(name, callback) { this.events[name] = callback; }
    closest() { return null; }
  }
  const context = { Node, document: { createElement: () => new Node() } };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf("  function table("), source.indexOf("  function workflowStepsForPath(")), context);
  const target = new Node(); let opens = 0;
  const row = { name: '<img src=x onerror="alert(1)">' };
  context.table(target, [["Name", record => record.name]], [row], record => { assert.equal(record, row); opens++; });
  const renderedRow = target.children[0].children[0].children[0];
  assert.equal(renderedRow.children[0].textContent, row.name);
  for (const key of ["Enter", " "]) renderedRow.events.keydown({ target: renderedRow, key, preventDefault() {} });
  assert.equal(opens, 2);
});
test("setup filtering distinguishes no matches from an empty catalogue", () => {
  const context = { document: {} }; vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf("  function table("), source.indexOf("  function workflowStepsForPath(")), context);
  const target = { closest: selector => selector === ".view" ? { dataset: { organisationSetup: "true" } } : { querySelector: () => ({value: "missing"}) } };
  context.table(target, [], []);
  assert.match(target.innerHTML, /No records match the search/);
  target.closest = () => null;
  context.table(target, [], []);
  assert.match(target.innerHTML, /No records yet/);
});
test("Tax Types uses shared columns while preserving effective current-rate selection", () => {
  const context = { state: { taxTypes: [{ tax_type_id: "tax", tax_type_code: "VAT", is_active: true }] }, searchTerm: () => "", rowMatches: () => true,
    $: () => ({}), today: () => "2026-10-12", dateOnly: value => value, taxDirectionLabel: () => "Output VAT", openTaxTypeEditor() {},
    ratesForTaxType: () => [{is_active: true, valid_from: "2027-01-01", tax_rate: 20}, {is_active: true, valid_from: "2026-01-01", tax_rate: 15}],
    table(target, columns, rows, open) { assert.equal(columns[3][1](rows[0]), "15.00%"); assert.equal(open, context.openTaxTypeEditor); } };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf("  function renderTaxTypes("), source.indexOf("  function renderTaxRateLines(")), context);
  context.renderTaxTypes();
});
