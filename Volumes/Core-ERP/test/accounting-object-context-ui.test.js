"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");

function fixture() {
  const controls = Object.fromEntries([
    "accounting-object-type", "accounting-object-form-title", "accounting-object-grid-title",
    "view-accountingobjects", "page-title", "accounting-object-search", "add-accounting-object",
    "accounting-object-context-message", "accounting-object-form", "accounting-object-list",
    "accounting-dimension-type-select", "accounting-dimension-type",
  ].map((id) => [id, { value: "", hidden: false, closest: () => ({}) }]));
  const scope = {
    $: (id) => controls[id], controls,
    state: { orgId: "org", accountingObjectTypes: [
      { accounting_object_type_id: "contract", type_name: "Contract", type_code: "contract" },
      { accounting_object_type_id: "project", type_name: "Project", type_code: "project" },
    ], accountingObjects: [], accountingDimensionTypes: [
      { accounting_dimension_type_id: "region", type_name: "Region" },
    ], accountingDimensions: [] },
    selectedAccountingObjectTypeId: "contract", selectedAccountingDimensionTypeId: "",
    selectedAccountingObject: null, selectedAccountingDimension: null,
    highlightDynamicMenu() {}, syncObjectGridContext() {}, searchTerm: () => "", rowMatches: () => true,
    option() {}, table: (_target, _columns, rows) => { scope.renderedRows = rows; },
    closeWorkflowMenu() {},
    window: { erpObjectGridViews: { render: ({rows}) => { scope.renderedRows = rows; } } },
  };
  vm.createContext(scope);
  vm.runInContext(source.slice(source.indexOf("  function accountingMasterConfig("),
    source.indexOf("  function accountingObjectParentLabel(")), scope);
  vm.runInContext(source.slice(source.indexOf("  function renderAccountingMaster(kind)"),
    source.indexOf("  function renderJournals(")), scope);
  return scope;
}

test("shared grid context renders each class, configured description and named action without duplicate headings", () => {
  const scope = fixture();
  const controls = scope.controls;
  const count = { textContent: "" };
  const toolbar = { querySelector: () => count };
  for (const id of ["page-object-class", "page-subtitle", "view-accounts", "view-accountingdimensions",
    "view-journals", "journal-form", "account-grid-title", "accounting-dimension-grid-title",
    "journal-grid-title", "add-account", "add-accounting-dimension", "add-journal",
    "account-search", "accounting-dimension-search"]) controls[id] = { hidden: true, value: "" };
  for (const prefix of ["account", "accounting-object", "accounting-dimension", "journal"]) {
    controls[`${prefix}-grid-title`].closest = () => toolbar;
    controls[`add-${prefix}`].classList = { add() {} };
    controls[`add-${prefix}`].setAttribute = () => {};
    if (controls[`${prefix}-search`]) controls[`${prefix}-search`].setAttribute = () => {};
  }
  scope.state.subledgerAccountTypes = [{ type_code: "asset", type_name: "Asset", type_description: "Assets description" }];
  scope.state.transactionTypes = [{ transaction_type_id: "invoice", type_name: "Invoice", type_description: "Invoice description" }];
  scope.state.accountingObjectTypes[0].type_description = "Contract description";
  scope.state.accountingDimensionTypes[0].type_description = "Region description";
  scope.selectedAccountScopeCode = "asset";
  scope.selectedTransactionTypeId = "invoice";
  controls["accounting-dimension-type-select"].value = "region";
  scope.labelForFamily = () => "Asset";
  vm.runInContext(source.slice(source.indexOf("  function syncObjectGridContext("),
    source.indexOf("  function renderAccounts(")), scope);
  for (const [view, prefix, objectClass, name, description] of [
    ["accounts", "account", "Sub Ledger", "Asset", "Assets description"],
    ["accountingobjects", "accounting-object", "Accounting Object", "Contract", "Contract description"],
    ["accountingdimensions", "accounting-dimension", "Accounting Dimension", "Region", "Region description"],
    ["journals", "journal", "Transaction Type", "Invoice", "Invoice description"],
  ]) {
    for (const item of ["accounts", "accountingobjects", "accountingdimensions", "journals"])
      controls[`view-${item}`].hidden = item !== view;
    scope.syncObjectGridContext(3, view);
    assert.equal(controls["page-object-class"].textContent, objectClass);
    assert.equal(controls["page-title"].textContent, name);
    assert.equal(controls["page-subtitle"].textContent, description);
    assert.equal(controls[`${prefix}-grid-title`].hidden, true);
    assert.equal(controls[`add-${prefix}`].textContent, `+ Add ${name}`);
    assert.equal(count.textContent, "3 records");
  }
  controls["journal-form"].hidden = false;
  scope.syncObjectGridContext(1, "journals");
  assert.equal(controls["page-title"].textContent, "Transaction Capture");
  assert.equal(controls["page-subtitle"].hidden, true);
  assert.equal(count.textContent, "1 record");
  scope.syncObjectGridContext(9, "accounts");
  assert.equal(count.textContent, "1 record");
  controls["view-journals"].hidden = true;
  scope.syncObjectGridContext();
  assert.equal(controls["page-object-class"].hidden, true);
});

test("menu context fixes headings, form type and grid records", async () => {
  const scope = fixture();
  let requested;
  scope.api = async (url) => {
    requested = url;
    return { records: [
      { accounting_object_type_id: "contract", object_code: "C1" },
      { accounting_object_type_id: "project", object_code: "P1" },
    ] };
  };
  await scope.loadAccountingMasterRecords("object");
  assert.match(requested, /accounting_object_type_id=contract/);
  assert.equal(scope.controls["page-title"].textContent, "Contract");
  assert.equal(scope.controls["accounting-object-grid-title"].textContent, "Contract");
  assert.equal(scope.controls["accounting-object-type"].value, "contract");
  assert.equal(scope.controls["accounting-object-form-title"].textContent, "New Contract");
  assert.equal(scope.renderedRows.length, 1);
  assert.equal(scope.renderedRows[0].object_code, "C1");
});

test("missing, inactive and unselected types never fall back to another type", async () => {
  for (const selected of ["", "missing", "contract"]) {
    const scope = fixture();
    scope.selectedAccountingObjectTypeId = selected;
    scope.state.accountingObjectTypes[0].is_active = false;
    scope.api = async () => { assert.fail("Unavailable context must not load records"); };
    await scope.loadAccountingMasterRecords("object");
    assert.equal(scope.selectedAccountingObjectTypeId, selected);
    assert.equal(scope.controls["add-accounting-object"].disabled, true);
    assert.equal(scope.controls["accounting-object-form"].hidden, true);
    assert.equal(scope.controls["accounting-object-context-message"].hidden, false);
    assert.equal(scope.renderedRows.length, 0);
  }
});

test("late loads cannot replace a newer menu or organisation context", async () => {
  for (const change of ["type", "organisation"]) {
    const scope = fixture();
    let resolve;
    scope.api = () => new Promise((done) => { resolve = done; });
    const pending = scope.loadAccountingMasterRecords("object");
    if (change === "type") scope.selectedAccountingObjectTypeId = "project";
    else scope.state.orgId = "other-org";
    resolve({ records: [{ accounting_object_type_id: "contract" }] });
    await pending;
    assert.equal(scope.state.accountingObjects.length, 0);
  }
});

test("accounting dimensions retain their existing dropdown selection", async () => {
  const scope = fixture();
  scope.controls["accounting-dimension-type-select"].value = "region";
  scope.renderAccountingMaster = () => {};
  let requested;
  scope.api = async (url) => { requested = url; return { records: [] }; };
  await scope.loadAccountingMasterRecords("dimension");
  assert.match(requested, /accounting_dimension_type_id=region/);
  assert.equal(scope.selectedAccountingDimensionTypeId, "region");
});

test("new records and saves use the menu type even if the hidden form value differs", async () => {
  const scope = fixture();
  const listeners = {};
  scope.$ = (id) => {
    scope.controls[id] ||= { value: "", hidden: false, closest: () => ({}) };
    const control = scope.controls[id];
    control.dataset ||= {};
    control.addEventListener = (event, handler) => { listeners[`${id}:${event}`] = handler; };
    control.reset = () => {};
    return control;
  };
  Object.assign(scope, {
    resourceAssignmentEditors: new Map(), accountingObjectParentOptions: [],
    showResourceEditorTab() {}, defaultOwnerDivision: () => "division", today: () => "2026-10-12",
    renderAccountingObjectParentOptions() {}, loadAccountingObjectParentOptions: async () => {},
    renderAccountingMasterDetailFields() {}, loadEntityDocuments: async () => {},
    renderWorkflowFooter() {}, renderWorkflowHistory() {},
    syncAccountingObjectParentSelection() {}, collectAccountingMasterDetail: () => ({}),
    collectResourceAssignments: () => undefined, alert() {},
  });
  vm.runInContext(source.slice(source.indexOf("  function resetAccountingMasterForm("),
    source.indexOf("  let accountingObjectParentSearchTimer")), scope);
  listeners["add-accounting-object:click"]();
  assert.equal(scope.controls["accounting-object-type"].value, "contract");
  assert.equal(scope.controls["accounting-object-form-title"].textContent, "New Contract");
  assert.equal(scope.controls["accounting-object-form"].hidden, false);
  scope.controls["accounting-object-type"].value = "project";
  let savedBody;
  scope.api = async (_url, options) => {
    if (options) {
      savedBody = JSON.parse(options.body);
      return { record: { accounting_object_id: "new-contract" } };
    }
    return { records: [] };
  };
  await listeners["accounting-object-form:submit"]({ preventDefault() {} });
  assert.equal(savedBody.accounting_object_type_id, "contract");
  assert.equal(savedBody.organisation_id, "org");
});

test("dimension creation fixes the selected type and list refreshes cannot retype an open record", async () => {
  const scope = fixture();
  const listeners = {};
  scope.$ = (id) => {
    scope.controls[id] ||= { value: "", hidden: false, closest: () => ({}) };
    const control = scope.controls[id];
    control.dataset ||= {};
    control.addEventListener = (event, handler) => { listeners[`${id}:${event}`] = handler; };
    control.reset = () => {};
    return control;
  };
  Object.assign(scope, {
    resourceAssignmentEditors: new Map(), showResourceEditorTab() {},
    defaultOwnerDivision: () => "division", today: () => "2026-10-12",
    renderAccountingMasterDetailFields() {}, renderWorkflowFooter() {},
    renderWorkflowHistory() {},
    collectAccountingMasterDetail: () => ({}), collectResourceAssignments: () => undefined,
    alert: (message) => assert.equal(message, "Accounting dimension saved."),
  });
  vm.runInContext(source.slice(source.indexOf("  function resetAccountingMasterForm("),
    source.indexOf("  let accountingObjectParentSearchTimer")), scope);
  scope.controls["accounting-dimension-type-select"].value = "region";
  listeners["add-accounting-dimension:click"]();
  assert.equal(scope.controls["accounting-dimension-type"].value, "region");
  scope.state.accountingDimensionTypes.push({ accounting_dimension_type_id: "department", type_name: "Department" });
  scope.controls["accounting-dimension-type-select"].value = "department";
  scope.renderAccountingMaster("dimension");
  assert.equal(scope.controls["accounting-dimension-type"].value, "region");
  let savedBody;
  scope.api = async (_url, options) => {
    if (options) {
      savedBody = JSON.parse(options.body);
      return { record: { accounting_dimension_id: "new-region" } };
    }
    return { records: [] };
  };
  await listeners["accounting-dimension-form:submit"]({ preventDefault() {} });
  assert.equal(savedBody.accounting_dimension_type_id, "region");
});
