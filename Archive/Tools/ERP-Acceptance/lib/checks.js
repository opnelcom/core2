'use strict';
function cents(value) {
  const text = String(value ?? '0');
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) throw new Error(`Invalid monetary amount: ${text}`);
  const [whole, fraction = ''] = text.replace('-', '').split('.');
  const n = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(n)) throw new Error('Amount exceeds supported precision');
  return text.startsWith('-') ? -n : n;
}
function subset(actual, expected, path = '') {
  const differences = [];
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return [{ path, expected, actual }];
    expected.forEach((v, i) => differences.push(...subset(actual[i], v, `${path}[${i}]`)));
  } else if (expected && typeof expected === 'object') {
    for (const [k, v] of Object.entries(expected)) differences.push(...subset(actual?.[k], v, path ? `${path}.${k}` : k));
  } else if (actual !== expected) differences.push({ path, expected, actual });
  return differences;
}
function postingKey(line) {
  return JSON.stringify([line.gl, line.subledger || null,
    [...(line.objects || [])].sort(), [...(line.dimensions || [])].sort()]);
}
function comparePostings(actual, expected) {
  function totals(lines) {
    const map = new Map();
    for (const line of lines) {
      const key = postingKey(line), row = map.get(key) || { debit: 0, credit: 0 };
      row.debit += cents(line.debit); row.credit += cents(line.credit); map.set(key, row);
    }
    return map;
  }
  const a = totals(actual), e = totals(expected), differences = [];
  for (const key of new Set([...a.keys(), ...e.keys()])) {
    const av = a.get(key) || { debit: 0, credit: 0 }, ev = e.get(key) || { debit: 0, credit: 0 };
    if (av.debit !== ev.debit || av.credit !== ev.credit) differences.push({ path: key, expected: ev, actual: av });
  }
  return differences;
}
function ledgerComparison(actual, expected) {
  const a = new Map();
  for (const row of actual) {
    if (a.has(row.account_code)) throw new Error(`Duplicate report account ${row.account_code}`);
    a.set(row.account_code, { debit: cents(row.debit_total), credit: cents(row.credit_total), balance: cents(row.balance) });
  }
  const e = new Map();
  for (const line of expected) {
    const row = e.get(line.gl) || { debit: 0, credit: 0, balance: 0 };
    row.debit += cents(line.debit); row.credit += cents(line.credit); row.balance = row.debit - row.credit; e.set(line.gl, row);
  }
  return [...new Set([...a.keys(), ...e.keys()])].sort().map(gl => {
    const av = a.get(gl) || { debit: 0, credit: 0, balance: 0 }, ev = e.get(gl) || { debit: 0, credit: 0, balance: 0 };
    return { gl, expected: ev, actual: av, difference: av.balance - ev.balance,
      passed: av.debit === ev.debit && av.credit === ev.credit && av.balance === ev.balance };
  });
}
module.exports = { cents, subset, comparePostings, ledgerComparison };
