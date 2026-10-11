"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { DatabaseSync } = require("node:sqlite");
const { transactionVisibilitySql } = require("../api/_shared/erp/transaction-visibility");

// Execute the report's actual relational query. Only PostgreSQL scalar casts
// are removed for SQLite; joins, permission predicates and aggregates remain.
function fixture({ administrator = false, permission = null, lineDivision = "root", status = "approved" } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE erp_division(division_id,parent_division_id,tenant_id,organisation_id);
    CREATE TABLE erp_journal(journal_id,tenant_id,organisation_id,fiscal_period_id,workflow_status,transaction_type_id);
    CREATE TABLE erp_journal_line(journal_id,division_id,gl_account_id,debit_amount,credit_amount);
    CREATE TABLE erp_fiscal_period(fiscal_period_id,fiscal_year_id,start_date,end_date);
    CREATE TABLE erp_gl_account(gl_account_id,gl_account_type_id,account_code,account_name);
    CREATE TABLE erp_gl_account_type(gl_account_type_id,type_code,type_name);
    CREATE TABLE erp_financial_statement_line_account(financial_statement_line_id,gl_account_id,tenant_id,organisation_id,financial_statement_format_id);
    CREATE TABLE erp_user_role(role_id,tenant_id,organisation_id,email,valid_from,valid_to);
    CREATE TABLE erp_role(role_id,is_active);
    CREATE TABLE erp_role_permission(role_id,division_id,resource_kind,resource_code,workflow_status,valid_from,valid_to,applies_to_children);
    INSERT INTO erp_division VALUES('root',NULL,'tenant','org'),('child','root','tenant','org'),('unrelated',NULL,'tenant','org');
    INSERT INTO erp_fiscal_period VALUES('period04','FY2027','2026-10-01','2026-10-31');
    INSERT INTO erp_gl_account_type VALUES('asset','asset','Asset'),('equity','equity','Equity');
    INSERT INTO erp_gl_account VALUES('bank','asset','1010','Bank Clearing'),('equity','equity','3000','Owner Equity');
    INSERT INTO erp_financial_statement_line_account VALUES('cash','bank','tenant','org','format'),('equity','equity','tenant','org','format');
    INSERT INTO erp_role VALUES('role',1);
    INSERT INTO erp_user_role VALUES('role','tenant','org','user@example.com','2020-01-01',NULL);
  `);
  db.prepare("INSERT INTO erp_journal VALUES('journal','tenant','org','period04',?,'owner_deposit')").run(status);
  db.prepare("INSERT INTO erp_journal_line VALUES('journal',?,'bank',1000,0),('journal',?,'equity',0,1000)").run(lineDivision,lineDivision);
  if (permission) db.prepare("INSERT INTO erp_role_permission VALUES('role',?,'transaction',?,?,?,?,?)").run(
    permission.division || "root", permission.code || "*", permission.status || "view",
    permission.from || "2020-01-01", permission.to || null, permission.children ? 1 : 0,
  );
  const context = { module: { exports: {} }, require: (name) => name.includes("transaction-visibility") ? { transactionVisibilitySql } : {
    authTenant: async () => ({ tenantId: "tenant", setupAdministrator: administrator, auth: { email: "user@example.com" } }),
    requireBusinessAccess: async () => null,
    isAdministrator: (access) => access.setupAdministrator === true,
  } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve("../api/reports/financial"),"utf8"),context);
  async function run(report, query = {}) {
    return context.module.exports({
      query: { organisation_id: "org", format_id: "format", period_from_id: "period01", period_to_id: "period12", fiscal_year_id: "FY2027", report, ...query },
      send: (status,body) => ({ status,body }),
      broker: async (_profile,_action,request) => {
        let rows;
        if (request.text.includes("visible_lines AS")) {
          const sql = request.text.replace(/::(?:uuid|date|boolean|text)/g,"").replaceAll("CURRENT_DATE","'2026-10-03'");
          const statement = db.prepare(sql);
          statement.setAllowUnknownNamedParameters(true);
          const values = Object.fromEntries(Array.from(request.values,(value,index) => [String(index+1),typeof value === "boolean" ? Number(value) : value]));
          rows = statement.all(values);
        } else if (request.text.includes("FROM erp_financial_statement_format")) rows = [{ statement_type: "balance" }];
        else if (request.text.includes("WITH RECURSIVE tree")) rows = [
          { financial_statement_line_id: "cash", line_code: "CASH", line_type: "account_group", sign_multiplier: 1 },
          { financial_statement_line_id: "equity", line_code: "EQUITY", line_type: "account_group", sign_multiplier: 1 },
          { financial_statement_line_id: "total", line_code: "TOTAL", line_type: "formula", formula_json: { add: ["CASH"] } },
        ];
        else if (request.text.includes("min(start_date)")) rows = [{ start_date: "2026-07-01", end_date: "2027-06-30" }];
        else throw new Error("Unexpected report query");
        return { rows, rowCount: rows.length };
      },
    });
  }
  return { db,run };
}

async function expectContribution(options, query = {}, expected = 1000) {
  const { db,run } = fixture(options);
  try {
    const financial = await run("financial_statement",query);
    assert.equal(financial.rows.find((row) => row.line_code === "CASH").amount,expected);
    assert.equal(financial.rows.find((row) => row.line_code === "EQUITY").amount,expected);
    assert.equal(financial.rows.find((row) => row.line_code === "TOTAL").amount,expected);
    const ledger = await run("ledger",query);
    if (!expected) assert.equal(ledger.rows.length,0);
    else {
      assert.equal(ledger.rows.find((row) => row.account_code === "1010").balance,1000);
      assert.equal(ledger.rows.find((row) => row.account_code === "3000").balance,-1000);
    }
  } finally { db.close(); }
}

test("administrator sees approved owner contribution without explicit report permissions", async () => {
  await expectContribution({ administrator: true });
});
test("view, wildcard and approved-status permissions include journal amounts in both reports", async () => {
  for (const status of ["view","*","approved"]) await expectContribution({ permission: { status } });
});
test("missing, expired, future and wrong-type grants cannot expose financial data", async () => {
  for (const permission of [null,{ to: "2026-10-02" },{ from: "2026-10-04" },{ code: "supplier_invoice" },{ status: "draft" }])
    await expectContribution({ permission },{},0);
});
test("inherited permissions require applies-to-children and selected division filters remain effective", async () => {
  await expectContribution({ lineDivision: "child",permission: { children: false } },{},0);
  await expectContribution({ lineDivision: "child",permission: { children: true } });
  await expectContribution({ administrator: true,lineDivision: "child" },{ division_id: "root",include_child_divisions: "0" },0);
  await expectContribution({ administrator: true,lineDivision: "child" },{ division_id: "root",include_child_divisions: "1" });
  await expectContribution({ administrator: true,lineDivision: "unrelated" },{ division_id: "root",include_child_divisions: "1" },0);
});
test("approval and fiscal year are still required, including for administrators", async () => {
  for (const status of ["draft","submitted","rejected"]) await expectContribution({ administrator: true,status },{},0);
  const { db,run } = fixture({ administrator: true });
  try { assert.equal((await run("ledger",{ fiscal_year_id: "FY2026" })).rows.length,0); }
  finally { db.close(); }
});

test("reversed originals remain posted history in ledger and financial statements", async () => {
  await expectContribution({ administrator: true, status: "reversed" });
  await expectContribution({ status: "reversed", permission: { status: "approved" } });
});
