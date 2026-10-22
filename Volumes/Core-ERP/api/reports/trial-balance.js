"use strict";
const { authTenant, requireBusinessAccess, isAdministrator } = require("../_shared/erp");
const { resolveRange, scopedLinesSql } = require("../_shared/erp/trial-balance");
const math = require("../../public/trial-balance-math");

module.exports = async (ctx) => {
  if (ctx.req.method !== "GET") return ctx.send(405, { error: "GET required" });
  const access = await authTenant(ctx);
  if (access.status) return ctx.send(access.status, access.body);
  const orgId = ctx.query.organisation_id;
  if (!orgId) return ctx.send(400, { error: "organisation_id is required" });
  const denied = await requireBusinessAccess(ctx, access, orgId);
  if (denied) return ctx.send(denied.status, denied.body);
  if (ctx.query.division_id) {
    const division = await ctx.broker("core_erp", "query", { text: `SELECT division_id FROM erp_division WHERE tenant_id=$1 AND organisation_id=$2 AND division_id=$3`, values: [access.tenantId, orgId, ctx.query.division_id] });
    if (!division.rows.length) return ctx.send(400, { error: "Choose a division belonging to this organisation" });
  }
  let range;
  try { range = await resolveRange(ctx, access.tenantId, orgId); }
  catch (error) { if (error.status) return ctx.send(error.status, { error: error.message }); throw error; }
  const values = [access.tenantId, orgId, range.date_from, range.date_to, ctx.query.division_id || null, ctx.query.include_child_divisions === "1", access.auth.email, isAdministrator(access)];
  const scope = scopedLinesSql();
  const coverage = await ctx.broker("core_erp", "query", { text: `${scope} SELECT EXISTS(SELECT 1 FROM scoped_lines WHERE NOT is_visible) restricted`, values });
  const metadata = { report: "trial_balance", ...range, division_id: values[4], include_child_divisions: values[5], restricted: coverage.rows[0]?.restricted === true || coverage.rows[0]?.restricted === 1 };
  if (ctx.query.account_id) {
    const account = await ctx.broker("core_erp", "query", { text: `SELECT gl_account_id,account_code,account_name FROM erp_gl_account WHERE tenant_id=$1 AND organisation_id=$2 AND gl_account_id=$3`, values: [access.tenantId, orgId, ctx.query.account_id] });
    if (!account.rows.length) return ctx.send(404, { error: "GL account not found" });
    const section = ctx.query.section || "movement";
    if (!["opening", "movement"].includes(section)) return ctx.send(400, { error: "Invalid drill-down section" });
    const offset = Number(ctx.query.offset || 0);
    if (!Number.isSafeInteger(offset) || offset < 0) return ctx.send(400, { error: "Invalid transaction page" });
    const predicate = section === "opening" ? "journal_date < $3::date" : "journal_date >= $3::date";
    const summary = await ctx.broker("core_erp", "query", { text: `${scope} SELECT COALESCE(sum(CASE WHEN journal_date < $3::date THEN debit_amount-credit_amount ELSE 0 END),0) opening_balance,
      COALESCE(sum(CASE WHEN ${predicate} THEN 1 ELSE 0 END),0) total_count FROM visible_lines WHERE gl_account_id=$9`, values: [...values, ctx.query.account_id] });
    const result = await ctx.broker("core_erp", "query", {
      text: `${scope}, account_lines AS (
        SELECT *,sum(debit_amount-credit_amount) OVER (ORDER BY journal_date,journal_created_at,journal_id,line_number,journal_line_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) running_balance
        FROM visible_lines WHERE gl_account_id=$9
      ) SELECT l.*,d.division_name,t.type_code,t.type_name FROM account_lines l
      JOIN erp_division d ON d.division_id=l.division_id AND d.tenant_id=$1 AND d.organisation_id=$2
      LEFT JOIN erp_transaction_type t ON t.transaction_type_id=l.transaction_type_id AND t.tenant_id=$1 AND t.organisation_id=$2
      WHERE ${section === "opening" ? "l.journal_date < $3::date" : "l.journal_date >= $3::date"}
      ORDER BY l.journal_date,l.journal_created_at,l.journal_id,l.line_number,l.journal_line_id LIMIT 100 OFFSET $10`,
      values: [...values, ctx.query.account_id, offset],
    });
    return { ...metadata, account: account.rows[0], section, opening_balance: String(summary.rows[0]?.opening_balance || "0.00"), total_count: Number(summary.rows[0]?.total_count || 0), offset, page_size: 100, rows: result.rows };
  }
  const result = await ctx.broker("core_erp", "query", {
    text: `${scope}, amounts AS (
      SELECT gl_account_id,
        sum(CASE WHEN journal_date < $3::date THEN debit_amount-credit_amount ELSE 0 END) opening_balance,
        sum(CASE WHEN journal_date >= $3::date THEN debit_amount ELSE 0 END) period_debit,
        sum(CASE WHEN journal_date >= $3::date THEN credit_amount ELSE 0 END) period_credit,
        sum(debit_amount-credit_amount) closing_balance
      FROM visible_lines GROUP BY gl_account_id
    ) SELECT a.gl_account_id,a.account_code,a.account_name,t.type_code account_type_code,t.type_name account_type_name,
      COALESCE(amounts.opening_balance,0) opening_balance,COALESCE(amounts.period_debit,0) period_debit,
      COALESCE(amounts.period_credit,0) period_credit,COALESCE(amounts.closing_balance,0) closing_balance
    FROM erp_gl_account a LEFT JOIN amounts ON amounts.gl_account_id=a.gl_account_id
    LEFT JOIN erp_gl_account_type t ON t.gl_account_type_id=a.gl_account_type_id AND t.tenant_id=$1 AND t.organisation_id=$2
    WHERE a.tenant_id=$1 AND a.organisation_id=$2 AND (a.workflow_status <> 'deleted' OR amounts.gl_account_id IS NOT NULL)
    ORDER BY a.account_code`, values,
  });
  const rows = result.rows.map((row) => {
    const opening = math.splitBalance(row.opening_balance);
    const closing = math.splitBalance(row.closing_balance);
    return { ...row, period_debit: String(row.period_debit), period_credit: String(row.period_credit), opening_debit: opening.debit, opening_credit: opening.credit, closing_debit: closing.debit, closing_credit: closing.credit };
  });
  return { ...metadata, rows, totals: math.totals(rows) };
};

module.exports=require("../_shared/context").withContext(module.exports);
