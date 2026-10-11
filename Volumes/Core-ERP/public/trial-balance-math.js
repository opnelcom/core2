(function (root) {
  "use strict";
  function minorUnits(value) {
    const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value ?? "0"));
    if (!match) throw new Error("Invalid ledger amount");
    const units = BigInt(match[2]) * 100n + BigInt((match[3] || "").padEnd(2, "0"));
    return match[1] ? -units : units;
  }
  function decimal(units) {
    const magnitude = units < 0n ? -units : units;
    return `${units < 0n ? "-" : ""}${magnitude / 100n}.${String(magnitude % 100n).padStart(2, "0")}`;
  }
  function splitBalance(value) {
    const units = minorUnits(value);
    return { debit: decimal(units > 0n ? units : 0n), credit: decimal(units < 0n ? -units : 0n) };
  }
  function totals(rows) {
    const fields = ["opening_debit", "opening_credit", "period_debit", "period_credit", "closing_debit", "closing_credit"];
    const result = Object.fromEntries(fields.map((field) => [field, decimal(rows.reduce((sum, row) => sum + minorUnits(row[field]), 0n))]));
    for (const prefix of ["opening", "period", "closing"]) result[`${prefix}_difference`] = decimal(minorUnits(result[`${prefix}_debit`]) - minorUnits(result[`${prefix}_credit`]));
    result.balanced = ["opening", "period", "closing"].every((prefix) => result[`${prefix}_difference`] === "0.00");
    return result;
  }
  const api = { minorUnits, decimal, splitBalance, totals };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TrialBalanceMath = api;
})(typeof globalThis === "object" ? globalThis : this);
