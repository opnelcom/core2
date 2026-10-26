'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const lists = require('../public/standard-grid-lists');
const grid = require('../public/standard-grid');
const context = { workflowLabel: r => r.workflow_step_label || r.workflow_status || '', dateOnly: v => v ? v.slice(0, 10) : '' };
test('rollout registration is limited to main lists, with explicit types and protected nested/report tables', () => {
  assert.equal(lists.ids.length, 29);
  for (const id of ['organisation-list', 'fiscal-year-list', 'ledger-family-list', 'exchange-rate-list', 'journal-list', 'accounting-dimension-list', 'erp-user-list', 'report-definition-list', 'resource-assignment-list']) assert.ok(lists.ids.includes(id));
  for (const id of ['report-result', 'exchange-rate-history', 'legal-entity-account-list', 'schema-grid', 'journal-lines', 'account-document-list']) assert.equal(lists.build(id, [], context), null);
  assert.throws(() => lists.build('organisation-list', [], context), /registration mismatch/);
});
test('raw values filter and export balances and journals numerically without changing displayed callbacks', () => {
  const columns = [['Code', r => r.code], ['Name', () => 'Name'], ['Entity', () => 'Entity'], ['Owner', () => 'Division'], ['Balance', () => '1.234,50 (visible transactions only)'], ['Status', () => ({ textContent: 'Approvedv' })], ['Actions', () => ({ textContent: 'Actions' })]];
  const config = lists.build('account-list', columns, context);
  const rows = [{ code: 'A', transaction_balance: '1234.50', workflow_step_label: 'Approved' }, { code: 'B', transaction_balance: '9', workflow_step_label: 'Draft' }];
  assert.equal(config.columns[4].value(rows[0]), '1234.50'); assert.equal(config.columns[4].render(rows[0]), '1.234,50 (visible transactions only)');
  assert.deepEqual(grid.filterRows(rows, config.columns, { 'column-4': { min: '1000' } }), [rows[0]]);
  const exported = grid.exportText(rows, config.columns, 'csv'); assert.ok(exported.includes('1234.5')); assert.ok(!exported.includes('Approvedv')); assert.ok(!exported.includes('Actions'));
  const gl = lists.build('account-list', columns.slice(0, 4), context); assert.equal(gl.columns[2].type, 'enum');
  const journal = lists.build('journal-list', [['Date/time', () => '2026-10-23 14:30'], ...columns.slice(0, 5)], context);
  assert.equal(journal.columns[0].value({ journal_date: '2026-10-23' }), '2026-10-23');
  assert.equal(journal.columns[0].exportValue({}), '2026-10-23 14:30'); assert.equal(journal.columns[4].value({ debit_total: '1000.25' }), '1000.25');
});
test('numeric-looking country identifiers remain text while rate/count columns are numeric and flags are enums', () => {
  const display = label => [label, () => '001'];
  const countries = lists.build('country-list', ['A2', 'A3', 'Numeric', 'Name', 'Seeded'].map(display), context);
  assert.equal(countries.columns[2].type, 'text'); assert.equal(countries.columns[2].value({}), '001');
  const currency = lists.build('currency-list', ['Code', 'Name', 'Decimals', 'Format', 'Seeded'].map(display), context);
  assert.equal(currency.columns[2].type, 'number'); assert.equal(currency.columns[4].type, 'enum');
  const tax = lists.build('tax-type-list', [['Code', () => 'VAT'], ['Description', () => 'VAT'], ['Direction', () => 'Input'], ['Rate', () => '15.00%'], ['Active', () => 'Yes']], context);
  assert.equal(tax.columns[3].value({}), 15);
  const roles = lists.build('role-list', Array.from({ length: 8 }, (_, i) => ['Column ' + i, () => i]), context);
  assert.equal(roles.columns[3].type, 'number'); assert.equal(roles.columns[7].type, 'enum');
});


test('workflow usage is numeric for sorting, filters and exports', () => {
  const columns = ['Code', 'Label', 'Colour', 'Description', 'Workflows', 'Enabled', 'Displayed', 'Transitional']
    .map((label, index) => [label, row => index === 4 ? row.workflow_count : '']);
  const config = lists.build('workflow-status-list', columns, context);
  const rows = [{workflow_count: 2}, {workflow_count: 12}, {workflow_count: 0}];
  assert.equal(config.columns[4].type, 'number');
  assert.deepEqual(grid.filterRows(rows, config.columns, {'column-4': {min: '10'}}), [rows[1]]);
  assert.equal(config.columns[4].exportValue(rows[2]), 0);
});
