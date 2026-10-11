"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { DatabaseSync } = require("node:sqlite");
const helpers = require("../api/_shared/erp/trial-balance");
const { transactionVisibilitySql } = require("../api/_shared/erp/transaction-visibility");
const math = require("../public/trial-balance-math");
const currency = require("../public/currency-format");

function fixture({ admin = true, permission = null, denied = null } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE erp_division(division_id,parent_division_id,tenant_id,organisation_id,division_name);
    CREATE TABLE erp_journal(journal_id,tenant_id,organisation_id,fiscal_period_id,workflow_status,transaction_type_id,journal_date,journal_number,description,created_at,reversing_journal_id,source_division_id,created_by_email);
    CREATE TABLE erp_journal_line(journal_line_id,journal_id,tenant_id,organisation_id,division_id,gl_account_id,debit_amount,credit_amount,line_number,description,created_at DEFAULT '2026-10-31T00:00:00');
    CREATE TABLE erp_fiscal_period(fiscal_period_id,fiscal_year_id,tenant_id,organisation_id,period_number,start_date,end_date);
    CREATE TABLE erp_gl_account(gl_account_id,gl_account_type_id,tenant_id,organisation_id,account_code,account_name,workflow_status);
    CREATE TABLE erp_gl_account_type(gl_account_type_id,tenant_id,organisation_id,type_code,type_name);
    CREATE TABLE erp_transaction_type(transaction_type_id,tenant_id,organisation_id,type_code,type_name);
    CREATE TABLE erp_user_role(role_id,tenant_id,organisation_id,email,valid_from,valid_to);
    CREATE TABLE erp_role(role_id,is_active);
    CREATE TABLE erp_role_permission(role_id,division_id,resource_kind,resource_code,workflow_status,valid_from,valid_to,applies_to_children);
    INSERT INTO erp_division VALUES('root',NULL,'tenant','org','Root'),('child','root','tenant','org','Child'),('foreign',NULL,'other','other-org','Foreign');
    INSERT INTO erp_fiscal_period VALUES('oct','FY2026','tenant','org',10,'2026-10-01','2026-10-31'),('nov','FY2026','tenant','org',11,'2026-11-01','2026-11-30'),('old','FY2025','tenant','org',10,'2025-10-01','2025-10-31'),('foreign-period','FY2026','other','other-org',11,'2026-11-01','2026-11-30');
    INSERT INTO erp_gl_account_type VALUES('asset','tenant','org','asset','Asset'),('equity','tenant','org','equity','Equity');
    INSERT INTO erp_gl_account VALUES('bank','asset','tenant','org','1010','Bank','approved'),('equity','equity','tenant','org','3000','Equity','approved'),('empty','asset','tenant','org','1320','Capital WIP','approved');
    INSERT INTO erp_transaction_type VALUES('deposit','tenant','org','owner_deposit','Owner deposit'),('adjustment','tenant','org','manual_journal','Adjustment');
    INSERT INTO erp_role VALUES('role',1);
    INSERT INTO erp_user_role VALUES('role','tenant','org','viewer@example.test','2020-01-01',NULL);
  `);
  if (permission) db.prepare("INSERT INTO erp_role_permission VALUES('role',?,'transaction',?,?,?,?,?)").run(permission.division || "root", permission.code || "*", permission.status || "view", permission.from || "2020-01-01", permission.to || null, permission.children ? 1 : 0);
  function post(id, date, amount, { status = "approved", division = "root", equityDivision = division, reverse = false, type = "deposit", tenant = "tenant", org = "org", period = "oct" } = {}) {
    db.prepare("INSERT INTO erp_journal VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id,tenant,org,period,status,type,date,id,"Posting",`${date}T10:00:00`,reverse ? "original" : null,division,"creator@example.test");
    db.prepare("INSERT INTO erp_journal_line(journal_line_id,journal_id,tenant_id,organisation_id,division_id,gl_account_id,debit_amount,credit_amount,line_number,description) VALUES(?,?,?,?,?,?,?,?,?,?)").run(`${id}-1`,id,tenant,org,division,"bank",reverse ? 0 : amount,reverse ? amount : 0,1,"Bank line");
    db.prepare("INSERT INTO erp_journal_line(journal_line_id,journal_id,tenant_id,organisation_id,division_id,gl_account_id,debit_amount,credit_amount,line_number,description) VALUES(?,?,?,?,?,?,?,?,?,?)").run(`${id}-2`,id,tenant,org,equityDivision,"equity",reverse ? amount : 0,reverse ? 0 : amount,2,"Equity line");
  }
  post("prior-year", "2025-10-03", 1000, { period: "old" });
  post("current", "2026-10-02", 200);
  post("original", "2026-10-03", 50, { status: "reversed" });
  post("reversal", "2026-10-04", 50, { reverse: true });
  post("draft", "2026-10-04", 900, { status: "draft" });
  post("future", "2026-11-02", 500, { period: "nov" });
  post("foreign", "2026-10-02", 800, { tenant: "other", org: "other-org", division: "foreign" });
  const requests = [];
  async function broker(_profile, _action, request) {
    requests.push(request);
    if (request.text.includes("jsonb_agg")) return { rows: [], rowCount: 0 };
    const sql = request.text.replace(/::(?:uuid|date|boolean|text)/g, "").replaceAll("CURRENT_DATE", "'2026-10-03'");
    const statement = db.prepare(sql);
    statement.setAllowUnknownNamedParameters(true);
    const values = Object.fromEntries(request.values.map((value,index) => [String(index+1), typeof value === "boolean" ? Number(value) : value]));
    const rows = statement.all(values);
    return { rows, rowCount: rows.length };
  }
  const auth = {
    authTenant: async (ctx, override) => ({ tenantId: "tenant", organisationId: override || ctx.query.organisation_id, setupAdministrator: admin, auth: { email: "viewer@example.test" } }),
    requireBusinessAccess: async () => denied, requireModuleAccess: async () => denied,
    isAdministrator: (access) => access.setupAdministrator === true,
  };
  function handler(file) {
    const context = { module: { exports: {} }, require: (name) => name.endsWith("trial-balance-math") ? math : name.endsWith("/trial-balance") ? helpers : name.endsWith("/transaction-visibility") ? { transactionVisibilitySql } : auth };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(require.resolve(file), "utf8"), context);
    return context.module.exports;
  }
  const report = handler("../api/reports/trial-balance.js");
  const detail = handler("../api/journals/detail.js");
  const context = (query) => ({ req: { method: "GET" }, query, broker, send: (status,body) => ({ status,body }) });
  return { db, post, requests, run: (query = {}) => report(context({ organisation_id: "org", range_mode: "dates", date_from: "2026-10-01", date_to: "2026-10-31", ...query })), journal: (id) => detail(context({ journal_id: id })) };
}

test("trial balance carries all prior years and includes both sides of a reversal", async () => {
  const f = fixture();
  try {
    const report = await f.run();
    const bank = report.rows.find((row) => row.account_code === "1010");
    assert.equal(bank.opening_debit, "1000.00");
    assert.equal(bank.opening_credit, "0.00");
    assert.equal(bank.period_debit, "250");
    assert.equal(bank.period_credit, "50");
    assert.equal(bank.closing_debit, "1200.00");
    assert.equal(report.totals.balanced, true);
    assert.equal(report.totals.period_debit, "300.00");
    assert.equal(report.restricted, false);
    assert.equal(report.rows.find((row) => row.account_code === "1320").closing_debit, "0.00");
    const movement = await f.run({ account_id: "bank" });
    assert.deepEqual(Array.from(movement.rows, (row) => row.journal_id), ["current", "original", "reversal"]);
    assert.deepEqual(Array.from(movement.rows, (row) => row.running_balance), [1200,1250,1200]);
    assert.equal(movement.opening_balance, "1000");
    assert.equal(movement.rows[0].journal_created_at, "2026-10-02T10:00:00");
    assert.equal(movement.rows[0].line_created_at, "2026-10-31T00:00:00");
    const opening = await f.run({ account_id: "bank", section: "opening" });
    assert.equal(opening.total_count, 1);
    assert.equal(opening.rows[0].journal_id, "prior-year");
    assert.equal(opening.rows[0].running_balance, 1000);
  } finally { f.db.close(); }
});

test("period and date ranges agree; reversed, foreign and invalid ranges are rejected", async () => {
  const f = fixture();
  try {
    const dates = await f.run();
    const periods = await f.run({ range_mode: "periods", period_from_id: "oct", period_to_id: "oct" });
    assert.deepEqual(periods.totals, dates.totals);
    for (const query of [
      { date_from: "2026-02-30" }, { date_from: "0000-01-01" }, { date_from: "2026-11-01" }, { range_mode: "invalid" }, { division_id: "foreign" },
      { range_mode: "periods", period_from_id: "nov", period_to_id: "oct" },
      { range_mode: "periods", period_from_id: "old", period_to_id: "oct" },
      { range_mode: "periods", period_from_id: "oct", period_to_id: "foreign-period" },
      { account_id: "bank", section: "invalid" }, { account_id: "bank", offset: "-1" },
    ]) assert.equal((await f.run(query)).status, 400, JSON.stringify(query));
    assert.equal((await f.run({ account_id: "missing" })).status, 404);
  } finally { f.db.close(); }
});

test("permission restrictions are disclosed without exposing hidden amounts, including drill-down", async () => {
  const f = fixture({ admin: false, permission: { status: "approved", code: "deposit" } });
  try {
    f.post("hidden", "2026-10-05", 777, { type: "adjustment" });
    const report = await f.run();
    assert.equal(report.restricted, true);
    assert.equal(report.rows.find((row) => row.account_code === "1010").closing_debit, "1200.00");
    const detail = await f.run({ account_id: "bank" });
    assert.equal(detail.total_count, 3);
    assert.ok(detail.rows.every((row) => row.journal_id !== "hidden"));
    // Reversed originals are posted history and retain approved-view access.
    assert.ok(detail.rows.some((row) => row.journal_id === "original"));
  } finally { f.db.close(); }
  for (const permission of [null, { from: "2026-10-04" }, { to: "2026-10-02" }, { status: "draft" }]) {
    const restricted = fixture({ admin: false, permission });
    try {
      const result = await restricted.run();
      assert.equal(result.restricted, true);
      assert.equal(result.totals.closing_debit, "0.00");
      assert.equal((await restricted.run({ account_id: "bank" })).total_count, 0);
    } finally { restricted.db.close(); }
  }
});

test("division scope includes children only when selected and reports real scope imbalance", async () => {
  const f = fixture();
  try {
    f.post("child", "2026-10-06", 100, { division: "child" });
    assert.equal((await f.run({ division_id: "root" })).totals.closing_debit, "1200.00");
    assert.equal((await f.run({ division_id: "root", include_child_divisions: "1" })).totals.closing_debit, "1300.00");
    f.post("cross-division", "2026-10-07", 25, { division: "child", equityDivision: "root" });
    const child = await f.run({ division_id: "child" });
    assert.equal(child.totals.balanced, false);
    assert.equal(child.totals.closing_difference, "25.00");
  } finally { f.db.close(); }
  const f2 = fixture({ admin: false, permission: { children: false } });
  try {
    f2.post("child", "2026-10-06", 100, { division: "child" });
    const restricted = await f2.run({ division_id: "root", include_child_divisions: "1" });
    assert.equal(restricted.restricted, true);
    assert.equal(restricted.totals.closing_debit, "1200.00");
  } finally { f2.db.close(); }
});

test("detail pagination preserves running balance and history includes archived accounts", async () => {
  const f = fixture();
  try {
    for (let index = 0; index < 102; index++) f.post(`extra-${String(index).padStart(3,"0")}`, "2026-10-10", 1);
    const page1 = await f.run({ account_id: "bank" });
    const page2 = await f.run({ account_id: "bank", offset: "100" });
    assert.equal(page1.total_count, 105);
    assert.equal(page1.rows.length, 100);
    assert.equal(page2.rows.length, 5);
    assert.equal(page2.rows[4].running_balance, 1302);
    assert.equal(new Set([...page1.rows,...page2.rows].map((row) => row.journal_line_id)).size, 105);
    f.db.exec("UPDATE erp_gl_account SET workflow_status='deleted' WHERE gl_account_id='bank'");
    assert.equal((await f.run()).rows.find((row) => row.gl_account_id === "bank").closing_debit, "1302.00");
  } finally { f.db.close(); }
});

test("transaction detail permits administrators and uses valid inherited grants for report drill-down", async () => {
  const f = fixture();
  try { assert.equal((await f.journal("current")).journal.journal_id, "current"); }
  finally { f.db.close(); }
  for (const [permission, expected] of [[{ status: "approved" },true],[{ to: "2026-10-02" },false],[{ children: false },false],[{ children: true },true]]) {
    const restricted = fixture({ admin: false, permission });
    try {
      restricted.post("child-original", "2026-10-03", 25, { division: "child", status: "reversed" });
      const id = permission.children === undefined ? "original" : "child-original";
      const result = await restricted.journal(id);
      if (expected) assert.equal(result.journal.journal_id, id);
      else assert.equal(result.status, 404);
    } finally { restricted.db.close(); }
  }
});

test("business access denial stops the trial balance before reading accounting data", async () => {
  const f = fixture({ denied: { status: 403, body: { error: "Denied" } } });
  try {
    assert.equal((await f.run()).status, 403);
    assert.equal(f.requests.length, 0);
  } finally { f.db.close(); }
});

test("totals and currency formatting preserve exact large ledger amounts", () => {
  const rows = [{ opening_debit: "9999999999999999.99", opening_credit: "9999999999999999.99", period_debit: "0.01", period_credit: "0.01", closing_debit: "10000000000000000.00", closing_credit: "10000000000000000.00" }];
  assert.equal(math.totals(rows).balanced, true);
  assert.equal(math.totals([...rows,...rows]).opening_debit, "19999999999999999.98");
  assert.equal(currency.format("9999999999999999.99", { currency_code: "ZAR" }), "R 9,999,999,999,999,999.99");
  assert.deepEqual(math.splitBalance("-123.45"), { debit: "0.00", credit: "123.45" });
});

test("every trial balance query references all bound parameters, including coverage start date", async () => {
  const f = fixture();
  try {
    await f.run();
    await f.run({ account_id: "bank", section: "opening" });
    await f.run({ range_mode: "periods", period_from_id: "oct", period_to_id: "oct", account_id: "bank" });
    for (const request of f.requests) {
      request.values.forEach((_, index) => {
        assert.match(request.text, new RegExp(`\\$${index + 1}(?!\\d)`), `Bound parameter $${index + 1} must be referenced so PostgreSQL can determine its type`);
      });
    }
    const coverage = f.requests.find((request) => request.text.includes("restricted"));
    assert.match(coverage.text, /\$3::date/);
  } finally { f.db.close(); }
});
