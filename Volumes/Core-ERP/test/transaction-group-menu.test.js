'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
function functionSource(name, next) {
  return app.slice(app.indexOf(`  function ${name}(`), app.indexOf(`  function ${next}(`, app.indexOf(`  function ${name}(`)));
}
function context() {
  const ctx = { state: {
    navigation: { permissions: [{ role_id: 'role', resource_kind: 'transaction', resource_code: 'payment' }] },
    subledgerAccountTypes: [], accountingObjectTypes: [], accountingDimensionTypes: [],
    transactionGroups: [{ transaction_group_id: 'payments', group_name: 'Payments & receipts' }, { transaction_group_id: 'empty', group_name: 'Empty' }],
    transactionTypes: [
      { transaction_type_id: 'payment', transaction_group_id: 'payments', type_name: 'Payment', module_ids: ['cash'] },
      { transaction_type_id: 'restricted', transaction_group_id: 'payments', type_name: 'Restricted', module_ids: ['cash'] },
      { transaction_type_id: 'other', transaction_group_id: 'payments', type_name: 'Other module', module_ids: ['sales'] },
      { transaction_type_id: 'inactive', transaction_group_id: 'payments', type_name: 'Inactive', module_ids: ['cash'], is_active: false }
    ] }, fixedMenuIconMarkup: name => `<span data-icon="${name}"></span>`, resourceIconMarkup: () => '',
    definedReportMenuItems: () => [], canViewResourceAssignments: () => false };
  vm.createContext(ctx);
  vm.runInContext(functionSource('menuAttribute', 'menuItemMarkup') + functionSource('menuItemMarkup', 'expandedMenuGroups') + functionSource('resourceMenuItem', 'resourcePermissionRows') + functionSource('resourcesForModules', 'resourceDateLabel'), ctx);
  return ctx;
}
test('module groups start collapsed, omit empty groups and retain module and active-type filtering', () => {
  const ctx = context();
  const html = ctx.resourcesForModules(new Set(['cash']), { menuScope: 'module-cash' }).join('');
  assert.match(html, /Payments &amp; receipts/);
  assert.match(html, /data-icon="transactionGroup"/);
  assert.match(html, /menu-entry--transaction-group/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /id="module-cash-transaction-group-payments"[^>]*hidden/);
  assert.match(html, /data-transaction-type="payment"/);
  assert.match(html, /data-transaction-type="restricted"/);
  assert.match(html, /menu-entry--depth-3/);
  assert.doesNotMatch(html, /Other module|Inactive|Empty/);
});
test('role groups retain role permissions and have distinct targets from modules and other roles', () => {
  const ctx = context();
  const html = ctx.resourcesForModules(new Set(['cash']), { role: { role_id: 'role' }, menuScope: 'role-role' }).join('');
  assert.match(html, /role-role-transaction-group-payments/);
  assert.match(html, /data-icon="transactionGroup"/);
  assert.match(html, /Payments &amp; receipts/);
  assert.match(html, /data-transaction-type="payment"/);
  assert.doesNotMatch(html, /Restricted|Other module|Inactive/);
  assert.equal(ctx.resourcesForModules(new Set(['cash']), { role: { role_id: 'denied' }, menuScope: 'role-denied' }).length, 0);
});
test('nested group controls expand and collapse their own content', () => {
  const content = { hidden: true };
  const attrs = { 'aria-expanded': 'false', 'aria-controls': 'group-content' };
  const button = { getAttribute: key => attrs[key], setAttribute: (key, value) => { attrs[key] = value; } };
  const menu = { querySelectorAll: selector => selector === '[data-resource-transaction-group]' ? [button] : [] };
  const ctx = { $: id => { assert.equal(id, 'group-content'); return content; } };
  vm.createContext(ctx);
  vm.runInContext(functionSource('bindMenu', 'buildDynamicMenu'), ctx);
  ctx.bindMenu(menu, 'module');
  button.onclick(); assert.equal(content.hidden, false); assert.equal(attrs['aria-expanded'], 'true');
  button.onclick(); assert.equal(content.hidden, true); assert.equal(attrs['aria-expanded'], 'false');
});
