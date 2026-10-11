"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");

function fixture() {
  const ids = ["report-year", "report-period-from", "report-period-to", "trial-range-mode", "trial-date-from", "trial-date-to", "trial-account-search", "trial-account-type", "trial-hide-empty", "trial-balance-detail", "trial-export", "report-result", "trial-balance-status", "view-reports", "return-trial-balance", "page-title", "report-title"];
  const controls = Object.fromEntries(ids.map((id) => [id, { value: "", hidden: false, checked: false }]));
  controls["trial-range-mode"].value = "dates";
  controls["trial-date-from"].value = "2026-10-01";
  controls["trial-date-to"].value = "2026-10-31";
  const scope = { controls, $: (id) => controls[id], state: { orgId: "org", divisionId: "division", includeChildren: true, periods: [] }, URLSearchParams,
    trialBalanceState: null, trialBalanceReturn: null, trialReportSequence: 0, trialDetailSequence: 0, selectedReport: "trial_balance", selectedTransactionTypeId: "type",
    option() {}, searchTerm: (id) => controls[id].value.trim().toLowerCase(), pretty: (value) => value,
    highlightDynamicMenu() {}, show() {}, fillReportPeriodSelects() {}, alert: (message) => { throw new Error(message); } };
  vm.createContext(scope);
  vm.runInContext(source.slice(source.indexOf("  function syncTrialBalanceRangeControls("), source.indexOf("  async function renderReport(")), scope);
  scope.renderTrialBalanceRows = () => {};
  scope.renderTrialBalanceDetail = () => {};
  scope.syncTrialBalanceRangeControls = () => {};
  return scope;
}

test("date/period requests preserve division and child scope", () => {
  const scope = fixture();
  let params = scope.trialBalanceParams();
  assert.equal(params.get("date_from"), "2026-10-01");
  assert.equal(params.get("division_id"), "division");
  assert.equal(params.get("include_child_divisions"), "1");
  scope.controls["trial-range-mode"].value = "periods";
  scope.controls["report-period-from"].value = "oct";
  scope.controls["report-period-to"].value = "nov";
  params = scope.trialBalanceParams();
  assert.equal(params.get("period_from_id"), "oct");
  assert.equal(params.get("period_to_id"), "nov");
  assert.equal(params.has("date_from"), false);
});

test("late responses cannot overwrite a newer trial balance range", async () => {
  const scope = fixture();
  const pending = [];
  scope.api = () => new Promise((resolve) => pending.push(resolve));
  const old = scope.renderTrialBalance();
  scope.controls["trial-date-to"].value = "2026-11-30";
  const current = scope.renderTrialBalance();
  pending[1]({ rows: [], date_from: "2026-10-01", date_to: "2026-11-30" });
  await current;
  pending[0]({ rows: [], date_from: "2026-10-01", date_to: "2026-10-31" });
  await old;
  assert.equal(scope.trialBalanceState.result.date_to, "2026-11-30");
  assert.equal(scope.trialBalanceState.params.get("date_to"), "2026-11-30");
});

test("opening a transaction and returning restores the same filters and account drill-down", async () => {
  const scope = fixture();
  const snapshot = { params: new URLSearchParams({ organisation_id: "org" }), detail: { section: "opening", offset: 100, account: { gl_account_id: "bank" } } };
  scope.trialBalanceState = snapshot;
  const expected = { "report-year": "FY2026", "report-period-from": "oct", "report-period-to": "nov", "trial-range-mode": "periods", "trial-account-search": "bank", "trial-account-type": "asset" };
  Object.entries(expected).forEach(([id,value]) => { scope.controls[id].value = value; });
  scope.controls["trial-hide-empty"].checked = true;
  scope.api = async () => ({ journal: { transaction_type_id: "deposit" }, lines: [] });
  scope.openTransactionType = async () => { scope.controls["report-period-from"].value = "jan"; };
  let opened = false;
  scope.displayJournalDetail = async () => { opened = true; };
  await scope.openTrialBalanceTransaction({ journal_id: "journal" });
  assert.equal(opened, true);
  assert.equal(scope.controls["return-trial-balance"].hidden, false);
  scope.fillReportPeriodSelects = () => { scope.controls["report-period-from"].value = "jan"; };
  scope.returnToTrialBalance();
  Object.entries(expected).forEach(([id,value]) => assert.equal(scope.controls[id].value, value, id));
  assert.equal(scope.trialBalanceState, snapshot);
  assert.equal(scope.trialBalanceState.detail.offset, 100);
  assert.equal(scope.controls["trial-hide-empty"].checked, true);
  assert.equal(scope.selectedReport, "trial_balance");
});

test("detail export fetches every page using the original account/range scope", async () => {
  const scope = fixture();
  scope.trialBalanceState = { params: new URLSearchParams({ organisation_id: "org", date_from: "2025-01-01", date_to: "2026-10-31", division_id: "division", include_child_divisions: "1" }), result: {}, detail: { account: { gl_account_id: "bank", account_code: "1010" }, section: "opening" } };
  const requests = [];
  scope.api = async (url) => { requests.push(url); const count = url.includes("offset=100") ? 5 : 100; return { total_count: 105, rows: Array.from({ length: count }, (_,index) => ({ journal_line_id: `${requests.length}-${index}` })) }; };
  let exported;
  scope.downloadReportCsv = (_name, _columns, rows) => { exported = rows; };
  await scope.exportTrialBalanceDetail();
  assert.equal(exported.length, 105);
  assert.equal(requests.length, 2);
  for (const request of requests) {
    const params = new URLSearchParams(request.split("?")[1]);
    assert.equal(params.get("account_id"), "bank");
    assert.equal(params.get("section"), "opening");
    assert.equal(params.get("date_from"), "2025-01-01");
    assert.equal(params.get("division_id"), "division");
  }
});

test("CSV escapes quotes/newlines and prevents spreadsheet formula execution", async () => {
  const scope = fixture();
  let blob;
  scope.Blob = Blob;
  scope.URL = { createObjectURL: (value) => { blob = value; return "blob:test"; }, revokeObjectURL() {} };
  scope.setTimeout = (callback) => callback();
  scope.document = { createElement: () => ({ click() {} }) };
  scope.downloadReportCsv("trial.csv", [["Name", (row) => row.name], ["Amount", (row) => row.amount]], [{ name: '=HYPERLINK("bad")\nnext', amount: "-123.45" }]);
  const csv = await blob.text();
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes('""bad""'));
  assert.ok(csv.includes('"-123.45"'));
});

test("historical reversal lines retain their GL and opposite posting direction", () => {
  const controls = Object.fromEntries([".line-definition", ".line-division", ".line-gl", ".line-sub", ".line-description", ".line-drcr", ".line-amount", "button"].map((selector) => [selector, { value: "", dataset: {}, addEventListener() {} }]));
  const row = { dataset: {}, querySelector: (selector) => controls[selector] };
  const elements = { "journal-type": { value: "capex_purchase_account" }, "journal-division": { value: "division" }, "journal-lines": { querySelector: () => ({ append() {} }) } };
  const definition = { transaction_type_id: "capex_purchase_account", transaction_line_definition_id: "original-debit", gl_account_id: "wip", debit_credit: "debit", occurrence: "required" };
  const scope = { $: (id) => elements[id], state: { transactionTypes: [{ transaction_type_id: "capex_purchase_account", allow_additional_lines: false }], lineDefinitions: [definition], divisions: [] },
    document: { querySelectorAll: () => [], createElement: () => row }, option() {}, fillAccountSelects() {}, syncJournalLineSubledgerOptions() {}, syncJournalCaptureRules() {}, recalculateBalancingLines() {},
    journalDefinitionFor: (id) => id === definition.transaction_line_definition_id ? definition : null,
    applyJournalDefinition: (_row, setup, line) => { controls[".line-gl"].value = setup?.gl_account_id || line.gl_account_id; }, formatOrgMoney: (value) => `R ${value}` };
  vm.createContext(scope);
  vm.runInContext(source.slice(source.indexOf("  function addJournalLine("), source.indexOf("  function renderTransactionGroups(")), scope);
  scope.addJournalLine({ journal_line_id: "reversal-line", gl_account_id: "wip", transaction_line_definition_id: null, debit_amount: "0.00", credit_amount: "1000.00" });
  assert.equal(controls[".line-definition"].value, "");
  assert.equal(controls[".line-gl"].value, "wip");
  assert.equal(controls[".line-drcr"].value, "credit");
  assert.equal(controls[".line-amount"].value, "R 1000.00");
});
