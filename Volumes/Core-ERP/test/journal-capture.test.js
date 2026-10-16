"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const seeds = require("../seeds/template-defaults.json");
const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const definitions = seeds.lineDefinitionSeeds.map(([type, order, side, gl, mandatory, subledger, description, occurrence = "required", code, amount_source = "manual"]) => ({
  transaction_type_id: type, transaction_line_definition_id: `${type}_${order}`, line_order: order,
  debit_credit: side, gl_account_id: gl, subledger_requirement: mandatory ? "mandatory" : "not_used",
  subledger_type_code: subledger, subledger_account_type_id: subledger, line_description: description, occurrence, amount_source,
}));
function fixture() {
  const elements = { "journal-type": { value: "owner_deposit" }, "journal-division": { value: "division" }, "add-journal-line": {} };
  const rows = [];
  const scope = { state: { lineDefinitions: definitions, transactionTypes: seeds.transactionTypes.map(([type_code,,,,, allow_additional_lines = true]) => ({ type_code, transaction_type_id: type_code, allow_additional_lines })), accounts: [] }, $: (id) => elements[id], elements, rows,
    document: { querySelectorAll: () => rows },
    parseOrgMoney: (value) => require("../public/currency-format").parse(value, { currency_code: "ZAR", decimal_places: 2 }),
    formatOrgMoney: (value) => require("../public/currency-format").format(value, { currency_code: "ZAR", decimal_places: 2 }),
    option: (control, choices, key, name, placeholder) => { control.rows = choices; control.placeholder = placeholder; control.value = ""; } };
  vm.createContext(scope);
  for (const [start,end] of [["  function journalDefinitionFor(","  function renderJournalClassifications("],["  function subledgerTypeForJournalLine(","  function fillLegalEntitySelects("],["  function defaultJournalLineForDefinition(","  function renderJournalLines("],["  function recalculateBalancingLines(","  const classificationValueCache"]]) vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end)),scope);
  return scope;
}
function rowFor(definition, amount = "") {
  const controls = { ".line-definition": { value: definition.transaction_line_definition_id, dataset: {} }, ".line-sub": { value: "vendor1", dataset: {} }, ".line-drcr": { value: definition.debit_credit }, ".line-amount": { value: amount }, button: {} };
  return { controls, dataset: { subledgerType: definition.subledger_account_type_id || "" }, querySelector: (selector) => controls[selector] };
}

test("capture moves the type heading and description into the panel and restores list context", () => {
  const scope = fixture();
  for (const id of ["page-title", "page-subtitle", "journal-capture-title", "journal-capture-description"])
    scope.elements[id] = {};
  scope.elements["view-journals"] = { hidden: false };
  scope.elements["journal-form"] = { hidden: false };
  const type = { type_name: "Municipal services invoice", type_description: "Supplier invoice details." };
  scope.syncTransactionDescription(type);
  assert.equal(scope.elements["page-title"].textContent, "Transaction Capture");
  assert.equal(scope.elements["page-subtitle"].hidden, true);
  assert.equal(scope.elements["journal-capture-title"].textContent, type.type_name);
  assert.equal(scope.elements["journal-capture-description"].textContent, type.type_description);
  scope.syncTransactionDescription({ type_name: "Payment", type_description: "" });
  assert.equal(scope.elements["journal-capture-title"].textContent, "Payment");
  assert.equal(scope.elements["journal-capture-description"].hidden, true);
  scope.elements["journal-form"].hidden = true;
  scope.syncTransactionDescription(type);
  assert.equal(scope.elements["page-title"].textContent, type.type_name);
  assert.equal(scope.elements["page-subtitle"].textContent, type.type_description);
});
test("all seeded financial types initialise only their required and generated definitions", () => {
  const scope = fixture();
  for (const type of seeds.transactionTypes) {
    const expected = definitions.filter((line) => line.transaction_type_id === type[0] && ["required", "generated"].includes(line.occurrence));
    const actual = scope.defaultJournalLinesForType(type[0]);
    assert.deepEqual(Array.from(actual, (line) => line.transaction_line_definition_id), expected.map((line) => line.transaction_line_definition_id));
    assert.deepEqual(Array.from(actual, (line) => [line.gl_account_id, line.debit_credit]), expected.map((line) => [line.gl_account_id, line.debit_credit]));
  }
});
test("owner deposit requires a bank-only subledger on its debit and no subledger on equity credit", () => {
  const scope = fixture();
  scope.state.accounts = [{ account_id: "bank1", account_kind: "subledger", subledger_account_type_id: "bank" }, { account_id: "vendor1", account_kind: "subledger", subledger_account_type_id: "vendor" }];
  const lines = definitions.filter((line) => line.transaction_type_id === "owner_deposit");
  assert.deepEqual(lines.map((line) => [line.gl_account_id,line.debit_credit]), [["1010","debit"],["3000","credit"]]);
  for (const definition of lines) {
    const row = rowFor(definition);
    scope.syncJournalLineSubledgerOptions(row);
    const select = row.controls[".line-sub"];
    assert.equal(select.value, "");
    assert.equal(select.required, definition.subledger_requirement === "mandatory");
    assert.equal(select.disabled, definition.subledger_requirement === "not_used");
    assert.deepEqual(Array.from(select.rows, (account) => account.account_id), definition.subledger_requirement === "mandatory" ? ["bank1"] : []);
  }
});
test("required/generated lines stay locked; optional lines cannot duplicate; repeatable lines remain available", () => {
  const scope = fixture();
  const custom = ["required", "generated", "optional", "repeatable"].map((occurrence,index) => ({ transaction_type_id: "custom", transaction_line_definition_id: `line${index}`, occurrence }));
  scope.state.lineDefinitions = custom;
  scope.state.transactionTypes = [{ transaction_type_id: "custom", allow_additional_lines: false }];
  scope.elements["journal-type"].value = "custom";
  custom.forEach((definition) => scope.rows.push(rowFor(definition)));
  scope.syncJournalCaptureRules();
  assert.equal(scope.elements["add-journal-line"].hidden, false);
  for (const [index,row] of scope.rows.entries()) {
    assert.equal(row.controls[".line-definition"].disabled, index < 2);
    assert.equal(row.controls.button.hidden, index < 2);
    assert.equal(row.controls[".line-definition"].required, true);
    assert.deepEqual(Array.from(row.controls[".line-definition"].rows, (line) => line.transaction_line_definition_id), index === 3 ? ["line3"] : [`line${index}`,"line3"]);
  }
  scope.state.lineDefinitions = custom.slice(0,3);
  scope.rows.pop();
  scope.syncJournalCaptureRules();
  assert.equal(scope.elements["add-journal-line"].hidden, true);
  scope.state.transactionTypes[0].allow_additional_lines = true;
  scope.syncJournalCaptureRules();
  assert.equal(scope.elements["add-journal-line"].hidden, false);
});
test("balancing amount is calculated from the configured posting direction", () => {
  const scope = fixture();
  const debit = { transaction_line_definition_id: "debit", debit_credit: "debit", amount_source: "manual" };
  const credit = { transaction_line_definition_id: "credit", debit_credit: "credit", amount_source: "balancing" };
  scope.state.lineDefinitions = [debit,credit];
  scope.rows.push(rowFor(debit,"R 1,175.25"),rowFor(credit,""));
  scope.recalculateBalancingLines();
  assert.equal(scope.rows[1].controls[".line-amount"].value,"R 1,175.25");
});
function saveFixture(typeCode = "owner_deposit", editing = false) {
  const selected = definitions.filter((line) => line.transaction_type_id === "owner_deposit");
  const queries = [];
  const context = { module: { exports: {} }, require: (name) => name === "crypto" ? require("node:crypto") : {
    authTenant: async () => ({ tenantId: "tenant", auth: { email: "owner@example.com" } }),
    clean: (value,fallback = "") => String(value ?? "").trim() || fallback,
    nullable: (value) => value || null, money: (value) => Number(value) || 0,
    objectReferenceConsistencyError: require("../api/_shared/erp/object-reference-consistency").objectReferenceConsistencyError,
    workflowUseSql:()=>"true",defaultWorkflowStepCode:async()=>"draft",checkPeriodOpen: async () => {}, requireResourcePermission: async () => null, requireModuleAccess: async () => null,
  } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve("../api/journals/save.js"),"utf8"),context);
  const ctx = { body: { journal_id: editing ? "journal1" : "", organisation_id: "org", transaction_type_id: typeCode, fiscal_period_id: "period", source_division_id: "division", journal_date: "2026-10-03", description: "Contribution", lines: selected.map((line,index) => ({ transaction_line_definition_id: line.transaction_line_definition_id, gl_account_id: line.gl_account_id, subledger_account_id: index === 0 ? "bank1" : "", debit_amount: index === 0 ? 100 : 0, credit_amount: index === 1 ? 100 : 0 })) }, send: (status,body) => ({ status,body }),
    broker: async (_profile,_action,query) => {
      queries.push(query);
      let rows = [];
      if (query.text.includes("SELECT workflow_status")) rows = [{ workflow_status: "draft",transaction_type_id:typeCode }];
      else if (query.text.includes("FROM erp_transaction_type WHERE")) rows = [{ type_code: typeCode, allow_additional_lines: false }];
      else if (query.text.includes("SELECT definition.*")) rows = selected;
      else if (query.text.includes("FROM erp_gl_account WHERE")) rows = selected.map((line) => ({ gl_account_id: line.gl_account_id }));
      else if (query.text.includes("FROM erp_subledger_account r")) rows = [{ subledger_account_id: "bank1", subledger_account_type_id: "bank" }];
      else if (query.text.startsWith("WITH saved")) rows = [{ journal_id: "journal1" }];
      return { rows, rowCount: rows.length };
    } };
  return { api: context.module.exports, ctx, queries };
}
test("saving uses configured lines for any type code and correct create/update SQL parameters", async () => {
  for (const typeCode of ["owner_deposit","municipal_services_invoice","custom"]) for (const editing of [false,true]) {
    const { api,ctx,queries } = saveFixture(typeCode,editing);
    const result = await api(ctx);
    assert.equal(result.journal.journal_id,"journal1");
    const save = queries.at(-1);
    assert.equal(save.values.length, 15);
    assert.equal(save.values[5],"2026-10-03");
    assert.equal(JSON.parse(save.values[10])[0].subledger_account_id,"bank1");
    if (editing) assert.equal(save.values[13],"journal1");
    assert.ok(!save.text.includes("supplier_invoice_number"));
  }
});
test("backend still rejects missing/wrong subledger, GL and posting direction", async () => {
  for (const [change,message] of [
    [(lines) => { lines[0].subledger_account_id = ""; }, /requires a sub-ledger/],
    [(lines) => { lines[1].subledger_account_id = "bank1"; }, /does not use a sub-ledger/],
    [(lines) => { lines[0].gl_account_id = "3000"; }, /configured by its line definition/],
    [(lines) => { for (const line of lines) [line.debit_amount,line.credit_amount] = [line.credit_amount,line.debit_amount]; }, /must be a debit/],
  ]) {
    const { api,ctx,queries } = saveFixture();
    change(ctx.body.lines);
    const response = await api(ctx);
    assert.equal(response.status,400);
    assert.match(response.body.error,message);
    assert.ok(!queries.some((query) => query.text.startsWith("WITH saved")));
  }
});
