"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");

test("copy opens an unsaved type with a free code while retaining all editor configuration", () => {
  const controls = Object.fromEntries(["copy-transaction-type", "transaction-type-id", "transaction-type-code", "transaction-type-name", "transaction-type-error"].map((id) => [id, { value: "", addEventListener: (_, callback) => { controls[id].callback = callback; }, focus() {} }]));
  controls["transaction-type-id"].value = "original";
  controls["transaction-type-code"].value = "sale";
  controls["transaction-type-name"].value = "Sale";
  const config = { group: "group1", modules: ["sales"], lines: [{ gl_account_id: "gl1", object_requirements: [{ value_behaviour: "fixed", accounting_object_id: "object1" }] }] };
  const scope = { $: (id) => controls[id], config, state: { transactionTypes: [{ type_code: "sale-copy" }, { type_code: "sale-copy-2" }] }, showSetupTypeTab() {}, updateTransactionTypeEditorTitle() {} };
  vm.createContext(scope);
  vm.runInContext(source.slice(source.indexOf("  function nextTransactionTypeCopyCode("), source.indexOf("  async function openNewTransactionType(")), scope);
  vm.runInContext(source.slice(source.indexOf('  $("copy-transaction-type").addEventListener'), source.indexOf('  $("add-transaction-line").addEventListener')), scope);
  controls["copy-transaction-type"].callback();
  assert.equal(controls["transaction-type-id"].value, "");
  assert.equal(controls["transaction-type-code"].value, "sale-copy-3");
  assert.equal(controls["transaction-type-name"].value, "Sale");
  assert.equal(scope.config, config);
});

function editorFixture(invalid = null) {
  let handler;
  const controls = { "transaction-type-form": { addEventListener: (_, callback) => { handler = callback; } }, "transaction-type-error": { scrollIntoView() {} }, "transaction-type-financial": { checked: false }, "transaction-type-id": {}, "transaction-type-group": {}, "transaction-type-code": {}, "transaction-type-name": {}, "transaction-type-description": {}, "transaction-type-workflow-path":{value:"workflow"}, "transaction-type-sort": {}, "transaction-type-additional-lines": {}, "transaction-type-active": {}, "add-role": { addEventListener() {} } };
  const tabs = [];
  controls["transaction-type-default-grid-view"] = { value: "columnar" };
  const expanded = [];
  const scope = { $: (id) => controls[id], state: { orgId: "org" }, selectedModuleIds: () => ["finance"], showSetupTypeTab: (_, tab) => tabs.push(tab), setExpandedTransactionTypeLine: (row) => expanded.push(row), api: async () => { throw new Error("Save failed: duplicate code"); } };
  vm.createContext(scope);
  vm.runInContext(source.slice(source.indexOf('  $("transaction-type-form").addEventListener("submit"'), source.indexOf('  $("add-role").addEventListener')), scope);
  return { controls, tabs, expanded, submit: () => handler({ preventDefault() {}, currentTarget: { elements: invalid ? [invalid.control] : [], querySelectorAll: () => invalid ? [invalid.row] : [] } }) };
}

test("missing GL reveals its hidden line and shows an error before submitting", async () => {
  const row = {};
  let focused = false;
  const control = { willValidate: true, validity: { valid: false }, classList: { contains: (name) => name === "tx-line-gl" }, closest: (selector) => selector === ".transaction-type-line" ? row : { dataset: { panel: "lines" } }, focus: () => { focused = true; }, reportValidity() {} };
  const fixture = editorFixture({ row, control });
  await fixture.submit();
  assert.equal(fixture.controls["transaction-type-error"].textContent, "Line 1 requires a GL account");
  assert.equal(fixture.controls["transaction-type-error"].hidden, false);
  assert.equal(focused, true);
  assert.ok(fixture.tabs.includes("lines"));
  assert.equal(fixture.expanded[0], row);
});

test("server save errors remain visible in the transaction type editor", async () => {
  const fixture = editorFixture();
  await fixture.submit();
  assert.equal(fixture.controls["transaction-type-error"].textContent, "Save failed: duplicate code");
  assert.equal(fixture.controls["transaction-type-error"].hidden, false);
});

test("legal entity selection defaults new subledger names and preserves a user override", () => {
  const controls = { "account-id": { value: "" }, "account-form-family": { value: "vendor" }, "account-legal-entity": { value: "entity1" }, "account-name": { value: "", dataset: {} } };
  const scope = { $: (id) => controls[id], state: { legalEntities: [{ legal_entity_id: "entity1", known_name: "Trading name", legal_name: "Legal name" }, { legal_entity_id: "entity2", legal_name: "Second entity" }] } };
  vm.createContext(scope);
  vm.runInContext(source.slice(source.indexOf("  function defaultSubledgerNameFromLegalEntity("), source.indexOf("  function setRequiredMarker(")), scope);
  scope.defaultSubledgerNameFromLegalEntity();
  assert.equal(controls["account-name"].value, "Trading name");
  controls["account-legal-entity"].value = "entity2";
  scope.defaultSubledgerNameFromLegalEntity();
  assert.equal(controls["account-name"].value, "Second entity");
  controls["account-name"].value = "My vendor name";
  controls["account-legal-entity"].value = "entity1";
  scope.defaultSubledgerNameFromLegalEntity();
  assert.equal(controls["account-name"].value, "My vendor name");
  controls["account-id"].value = "existing";
  controls["account-name"].value = "";
  scope.defaultSubledgerNameFromLegalEntity();
  assert.equal(controls["account-name"].value, "");
});

test("creating a duplicate type rejects the save without replacing existing lines or modules", async () => {
  const calls = [];
  const scope = { module: { exports: {} }, require: (name) => name.endsWith("/grid-views") ? require("../api/_shared/erp/grid-views") : name === "crypto" ? require("node:crypto") : name.endsWith("/modules") ? { moduleIds: () => ["finance"], validateModules: async () => null, replaceLinks: async () => { throw new Error("Must not replace modules"); } } : { authTenant: async () => ({ tenantId: "tenant" }), requireAdmin: () => null, clean: (value, fallback = "") => String(value ?? "").trim() || fallback, nullable: (value) => value || null,validateWorkflowPath:async()=>null } };
  vm.createContext(scope);
  vm.runInContext(fs.readFileSync(require.resolve("../api/transaction-types/save.js"), "utf8"), scope);
  const result = await scope.module.exports({ req: { method: "POST" }, body: { organisation_id: "org", transaction_group_id: "group", type_code: "sale-copy", type_name: "Sale", workflow_path_id:"workflow", is_financial: false }, send: (status, body) => ({ status, body }), broker: async (_profile, _action, query) => { calls.push(query); return { rows: query.text.startsWith("SELECT") ? [{}] : [] }; } });
  assert.equal(result.status, 409);
  assert.match(result.body.error, /already exists/);
  assert.ok(calls[1].text.includes("DO NOTHING"));
  assert.equal(calls.length, 2);
});
