'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { filterRows, exportText, wildcard } = require('../public/standard-grid');
const columns = [
  { key: 'name', label: 'Name', type: 'text', value: r => r.name },
  { key: 'status', label: 'Status', type: 'enum', value: r => r.status },
  { key: 'value', label: 'Value', type: 'number', value: r => r.value },
  { key: 'date', label: 'Date', type: 'date', value: r => r.date },
  { key: 'actions', label: 'Actions', value: () => 'private action', export: false },
];
const rows = [
  { name: 'Lease 10', status: 'draft', value: 10, date: '2026-10-23' },
  { name: 'Lease 2', status: 'approved', value: 2, date: '2026-10-01' },
  { name: 'Service', status: 'submitted', value: 0, date: '2026-09-01' },
  { name: 'Empty', status: '', value: null, date: null },
];
test('wildcards are case insensitive, support ? and * and escape regex metacharacters', () => {
  assert.equal(wildcard('LEASE 10', '*lease*'), true);
  assert.equal(wildcard('Lease 2', 'Lease ?'), true);
  assert.equal(wildcard('Lease 10', 'Lease ?'), false);
  for (const literal of ['a.b', '[abc]', 'a+b', 'x\\y', '(test)', '^$', 'a|b']) {
    assert.equal(wildcard(literal, literal), true);
    assert.equal(wildcard('unrelated', literal), false);
  }
});
test('enum selections use OR, combine columns with AND, and an empty selection matches nothing', () => {
  assert.deepEqual(filterRows(rows, columns, { status: { values: ['draft', 'approved'] }, name: { pattern: '*lease*' } }), rows.slice(0, 2));
  assert.deepEqual(filterRows(rows, columns, { status: { values: [] } }), []);
  assert.deepEqual(filterRows(rows, columns, { status: { values: [''] } }), [rows[3]]);
});
test('ranges are inclusive, permit one bound, retain zero, and exclude missing values', () => {
  assert.deepEqual(filterRows(rows, columns, { value: { min: '0', max: '2' } }), [rows[1], rows[2]]);
  assert.deepEqual(filterRows(rows, columns, { value: { min: '10', max: '' } }), [rows[0]]);
  assert.deepEqual(filterRows(rows, columns, { date: { min: '2026-10-01', max: '2026-10-23' } }), rows.slice(0, 2));
  assert.deepEqual(filterRows(rows, columns, { date: { min: '', max: '2026-09-01' } }), [rows[2]]);
});
test('single-column sorts are numeric or natural text, stable, nonmutating, and put nulls last', () => {
  assert.deepEqual(filterRows(rows, columns, {}, { key: 'value', direction: 'asc' }), [rows[2], rows[1], rows[0], rows[3]]);
  assert.deepEqual(filterRows(rows, columns, {}, { key: 'value', direction: 'desc' }), [rows[0], rows[1], rows[2], rows[3]]);
  assert.deepEqual(filterRows(rows.slice(0, 2), columns, {}, { key: 'name', direction: 'asc' }), [rows[1], rows[0]]);
  assert.equal(rows[0].name, 'Lease 10');
});
test('numeric string amounts retain decimal precision when sorted, filtered and exported', () => {
  const fields = [{ key: 'value', label: 'Value', type: 'number', value: r => r.value }];
  const values = [{ value: '9007199254740993.02' }, { value: '9007199254740993.01' }, { value: '-0.000000000000000001' }];
  assert.deepEqual(filterRows(values, fields, {}, { key: 'value', direction: 'asc' }), [values[2], values[1], values[0]]);
  assert.deepEqual(filterRows(values, fields, { value: { min: '9007199254740993.02' } }), [values[0]]);
  const output = exportText(values, fields, 'txt'); assert.ok(output.includes('9007199254740993.02'));
  assert.ok(output.includes('\r\n-0.000000000000000001')); assert.ok(!output.includes("'-0"));
});
test('CSV and tab-delimited TXT export data labels in filtered order and protect spreadsheet cells', () => {
  const input = [{ name: '=1+1', status: 'a,"b"\nnext', value: -2.5, date: '' }];
  const csv = exportText(input, columns, 'csv');
  assert.ok(csv.startsWith('\uFEFFName,Status,Value,Date\r\n'));
  assert.ok(csv.includes("'=1+1,\"a,\"\"b\"\"\nnext\",-2.5,"));
  assert.ok(!csv.includes('Actions')); assert.ok(!csv.includes('private action'));
  const selected = filterRows(rows, columns, { status: { values: ['draft', 'approved'] } }, { key: 'value', direction: 'asc' });
  const txt = exportText(selected, columns, 'txt');
  assert.ok(txt.startsWith('\uFEFFName\tStatus\tValue\tDate\r\nLease 2\tapproved'));
  assert.ok(txt.endsWith('Lease 10\tdraft\t10\t2026-10-23'));
  const display = [{ label: 'Status', value: r => r.status, exportValue: () => 'Approved' }];
  assert.ok(exportText([rows[1]], display, 'csv').endsWith('Approved'));
});
