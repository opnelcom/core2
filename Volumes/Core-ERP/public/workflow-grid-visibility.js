(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.erpWorkflowGridVisibility = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const controls = new WeakMap();
  function visibleRows(rows, statuses, showHidden = false) {
    if (showHidden) return rows;
    const hidden = new Set(statuses.filter(s => s.displayed === false).map(s => s.status_code));
    return rows.filter(row => !hidden.has(row.workflow_status));
  }
  function prepare(target, rows, statuses, refresh) {
    let control = controls.get(target);
    if (!control && rows.some(row => row.workflow_status)) {
      const label = document.createElement('label');
      label.className = 'check';
      const input = document.createElement('input');
      input.type = 'checkbox';
      label.append(input, document.createTextNode('Show hidden records'));
      target.before(label);
      control = { label, input };
      controls.set(target, control);
      input.addEventListener('change', () => control.refresh());
    }
    if (control) {
      control.refresh = refresh;
      control.label.hidden = !rows.some(row => row.workflow_status);
    }
    return visibleRows(rows, statuses, control?.input.checked === true);
  }
  return { visibleRows, prepare };
});
