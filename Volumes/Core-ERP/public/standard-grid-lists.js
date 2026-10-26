(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.erpStandardGridLists = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Explicit list registration, never inferred from caption wording or sample data.
  // t=text, e=enum, n=number, d=date, a=non-data action control.
  const definitions = {
    'organisation-list': ['t', 't', 'e', 'e'],
    'division-list': ['t', 't', 'e'],
    'fiscal-year-list': ['a', 't', 'd', 'd', 'e', 'a'],
    'country-list': ['t', 't', 't', 't', 'e'],
    'currency-list': ['t', 't', 'n', 't', 'e'],
    'exchange-rate-list': ['e', 'e', 'd', 'n'],
    'tax-type-list': ['t', 't', 'e', 'n', 'e'],
    'gl-account-type-list': ['t', 't', 'e', 'e'],
    'ledger-family-list': ['t', 't', 't', 'e', 't', 'e', 'e'],
    'accounting-object-type-list': ['t', 't', 't', 'e', 't', 'e', 'e'],
    'accounting-dimension-type-list': ['t', 't', 't', 'e', 't', 'e', 'e'],
    'module-list': ['t', 't', 't', 'e'],
    'resource-role-list': ['t', 't', 't', 'e'],
    'resource-list': ['t', 't', 'e', 't', 'e'],
    'resource-assignment-list': ['e', 't', 'e', 'e', 't', 'd', 'd'],
    'resource-assignment-resource-list': ['t', 't', 'e', 't', 'e'],
    'financial-format-list': ['t', 't', 'e', 'e'],
    'legal-entity-list': ['t', 't', 'e', 'e', 'n', 'n'],
    'account-list': ['t', 't', 'e', 'e', 'n', 'e', 'a'],
    'accounting-object-list': ['t', 't', 't', 'e', 'e', 'd', 'd', 'a'],
    'accounting-dimension-list': ['t', 't', 'e', 'e', 'e', 'd', 'd'],
    'journal-list': ['d', 't', 't', 'e', 'n', 'n'],
    'transaction-group-list': ['t', 't', 'n', 'e'],
    'transaction-reference': ['t', 't', 'e', 't', 'e', 'n', 'e'],
    'workflow-status-list': ['t', 't', 'e', 't', 'n', 'e', 'e', 'e'],
    'workflow-list': ['t', 'e', 'n', 'n', 'e'],
    'role-list': ['t', 't', 'e', 'n', 'n', 'n', 'n', 'e'],
    'erp-user-list': ['t', 't', 't', 'e', 'd', 'd', 'n', 'n'],
    'report-definition-list': ['t', 't', 'e', 'e'],
  };
  const types = { t: 'text', e: 'enum', n: 'number', d: 'date' };
  function build(id, columns, context = {}) {
    const registered = definitions[id]; if (!registered) return null;
    const layout = id === 'account-list' && columns.length === 4 ? ['t', 't', 'e', 'e'] : registered;
    if (layout.length !== columns.length) throw new Error(`Standard grid column registration mismatch: ${id}`);
    const raw = {}, labels = {};
    const assign = (index, value) => { raw[index] = value; };
    function workflow(index) { assign(index, r => r.workflow_status || ''); labels[index] = r => context.workflowLabel(r); }
    function owner(index) { assign(index, r => r.owner_division_id || ''); labels[index] = r => r.owner_division_name || ''; }
    if (id === 'division-list') { assign(0, r => r.division_code); workflow(2); }
    if (id === 'legal-entity-list') { workflow(3); assign(5, r => r.total_balance || 0); }
    if (id === 'account-list' && columns.length !== 4) { assign(4, r => r.transaction_balance ?? null); workflow(5); owner(3); }
    if (id === 'accounting-object-list') { workflow(4); owner(3); }
    if (id === 'accounting-dimension-list') { workflow(3); owner(4); }
    if (id === 'journal-list') {
      assign(0, r => context.dateOnly(r.journal_date)); workflow(3);
      assign(4, r => r.debit_total ?? null);
      assign(5, r => r.credit_total ?? null);
    }
    if (id === 'workflow-status-list') assign(2, r => r.colour || '');
    if (id === 'tax-type-list') assign(3, r => {
      const label = columns[3][1](r); return label === '' ? null : Number(String(label).replace(/%$/, ''));
    });
    if (id === 'resource-assignment-list') {
      assign(5, r => r.resource_assignment_id && !['-infinity', 'infinity'].includes(r.valid_from) ? context.dateOnly(r.valid_from) : '');
      assign(6, r => r.resource_assignment_id && !['-infinity', 'infinity'].includes(r.valid_to) ? context.dateOnly(r.valid_to) : '');
    }
    function scalar(value) { return value && typeof value === 'object' && 'textContent' in value ? value.textContent : value; }
    return { columns: columns.map(([label, render], index) => {
      const kind = layout[index];
      const value = raw[index] || (row => {
        const result = scalar(render(row));
        return result;
      });
      return { key: `column-${index}`, label, type: types[kind], value, render,
        sortValue: labels[index] || (id === 'journal-list' && index === 0 ? row => scalar(render(row)) : undefined),
        exportValue: labels[index] || ((id === 'journal-list' && index === 0) || (id === 'resource-assignment-list' && index >= 5)
          ? row => scalar(render(row)) : value),
        export: kind !== 'a', sort: kind !== 'a', filter: kind !== 'a',
        width: kind === 'd' ? 150 : kind === 'a' ? 150 : /name|description|heading/i.test(label) ? 260 : 180 };
    }) };
  }
  function toolbar(target) {
    const panel = target.closest('.panel');
    const heading = panel?.querySelector(':scope > .panel-head');
    // A panel may contain multiple initial lists (resource overviews, currency tabs).
    const listCount = panel ? [...panel.querySelectorAll('[id]')].filter(node => definitions[node.id]).length : 0;
    if (heading && listCount === 1) return heading;
    let tools = target.previousElementSibling;
    if (!tools?.classList.contains('standard-grid-list-toolbar')) {
      tools = document.createElement('div'); tools.className = 'standard-grid-list-toolbar'; target.before(tools);
    }
    return tools;
  }
  return { build, toolbar, ids: Object.keys(definitions) };
});
