"use strict";
const { transactionVisibilitySql } = require("./transaction-visibility");

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "") || Number(value.slice(0, 4)) < 1) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function dateOnly(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value || "").slice(0, 10);
}
async function resolveRange(ctx, tenantId, organisationId) {
  const query = ctx.query;
  let from, to;
  if (query.range_mode === "dates") {
    from = query.date_from;
    to = query.date_to;
  } else if (!query.range_mode || query.range_mode === "periods") {
    if (!query.period_from_id || !query.period_to_id) throw Object.assign(new Error("Choose both fiscal periods"), { status: 400 });
    const result = await ctx.broker("core_erp", "query", {
      text: `SELECT first.start_date,last.end_date,first.fiscal_year_id first_year,last.fiscal_year_id last_year,first.period_number first_number,last.period_number last_number
             FROM erp_fiscal_period first JOIN erp_fiscal_period last ON last.tenant_id=first.tenant_id AND last.organisation_id=first.organisation_id
             WHERE first.tenant_id=$1 AND first.organisation_id=$2 AND first.fiscal_period_id=$3 AND last.fiscal_period_id=$4`,
      values: [tenantId, organisationId, query.period_from_id, query.period_to_id],
    });
    const bounds = result.rows[0];
    if (!bounds || bounds.first_year !== bounds.last_year || bounds.first_number > bounds.last_number) throw Object.assign(new Error("Choose an ordered period range within one fiscal year"), { status: 400 });
    from = dateOnly(bounds.start_date);
    to = dateOnly(bounds.end_date);
  } else throw Object.assign(new Error("Invalid range mode"), { status: 400 });
  if (!validDate(from) || !validDate(to) || from > to) throw Object.assign(new Error("Choose a valid date range with the start on or before the end"), { status: 400 });
  return { date_from: from, date_to: to };
}

// Shared by summary, opening drill-down and period drill-down: all use journal
// dates, posting statuses and exactly the same division/permission scope.
function scopedLinesSql() {
  return `WITH RECURSIVE report_range AS (
    SELECT $3::date date_from,$4::date date_to
  ), selected_division AS (
    SELECT division_id FROM erp_division WHERE tenant_id=$1 AND organisation_id=$2 AND division_id=$5
    UNION ALL
    SELECT child.division_id FROM erp_division child JOIN selected_division parent ON child.parent_division_id=parent.division_id
    WHERE child.tenant_id=$1 AND child.organisation_id=$2 AND $6::boolean
  ), scoped_lines AS (
    SELECT l.journal_line_id,l.journal_id,l.tenant_id,l.organisation_id,l.division_id,l.gl_account_id,l.line_number,l.description,l.debit_amount,l.credit_amount,
      l.created_at line_created_at,j.created_at journal_created_at,
      j.journal_date,j.journal_number,j.description journal_description,j.transaction_type_id,j.workflow_status,j.reversing_journal_id,
      ${transactionVisibilitySql({ tenant: "$1", organisation: "$2", division: "l.division_id", transactionType: "j.transaction_type_id", status: "CASE WHEN j.workflow_status='reversed' THEN 'approved' ELSE j.workflow_status END", email: "$7", administrator: "$8" })} is_visible
    FROM erp_journal_line l JOIN erp_journal j ON j.journal_id=l.journal_id AND j.tenant_id=l.tenant_id AND j.organisation_id=l.organisation_id
    WHERE j.tenant_id=$1 AND j.organisation_id=$2 AND j.posted_at IS NOT NULL
      AND j.journal_date <= (SELECT date_to FROM report_range) AND ($5::uuid IS NULL OR l.division_id IN (SELECT division_id FROM selected_division))
  ), visible_lines AS (SELECT * FROM scoped_lines WHERE is_visible)`;
}
module.exports = { validDate, resolveRange, scopedLinesSql };
