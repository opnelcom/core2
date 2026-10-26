(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.erpStandardGrid = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const controls = new WeakMap();
  let activePopup = null;
  let nextId = 0;
  const empty = value => value === null || value === undefined || value === '';
  const text = value => empty(value) ? '' : String(value);
  function decimal(value) {
    const match = text(value).match(/^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
    if (!match || !(match[2] || match[3])) return null;
    const exponent = Number(match[4] || 0); if (Math.abs(exponent) > 1000) return null;
    return { coefficient: BigInt((match[1] === '-' ? '-' : '') + ((match[2] || '') + (match[3] || ''))), scale: (match[3] || '').length - exponent };
  }
  function compareNumbers(left, right) {
    const a = decimal(left), b = decimal(right);
    if (!a || !b) return NaN;
    const scale = Math.max(a.scale, b.scale);
    const x = a.coefficient * 10n ** BigInt(scale - a.scale), y = b.coefficient * 10n ** BigInt(scale - b.scale);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  function wildcard(value, pattern) {
    const expression = String(pattern).split('').map(character => character === '*' ? '.*' :
      character === '?' ? '.' : character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('');
    return new RegExp(`^${expression}$`, 'iu').test(text(value));
  }
  function filterRows(rows, columns, filters = {}, sort = null) {
    const result = rows.filter(row => columns.every(column => {
      const filter = filters[column.key];
      if (!filter) return true;
      const value = column.value(row);
      if (column.type === 'enum') return filter.values.includes(text(value));
      if (column.type === 'text') return wildcard(value, filter.pattern);
      if (empty(value)) return false;
      const comparable = text(value).slice(0, 10);
      if (column.type === 'number') return decimal(value) !== null &&
        (empty(filter.min) || compareNumbers(value, filter.min) >= 0) && (empty(filter.max) || compareNumbers(value, filter.max) <= 0);
      return (empty(filter.min) || comparable >= filter.min) && (empty(filter.max) || comparable <= filter.max);
    }));
    const column = sort && columns.find(item => item.key === sort.key);
    if (column) result.sort((a, b) => {
      const left = column.sortValue ? column.sortValue(a) : column.value(a);
      const right = column.sortValue ? column.sortValue(b) : column.value(b);
      // Keep missing values last in either direction. Array sort is stable for ties.
      if (empty(left) || empty(right)) return empty(left) === empty(right) ? 0 : empty(left) ? 1 : -1;
      const comparison = column.type === 'number' ? compareNumbers(left, right) :
        text(left).localeCompare(text(right), undefined, { numeric: true, sensitivity: 'base' });
      return sort.direction === 'desc' ? -comparison : comparison;
    });
    return result;
  }
  function exportText(rows, columns, format) {
    const delimiter = format === 'csv' ? ',' : '\t';
    const exported = columns.filter(column => column.export !== false);
    function cell(value, column) {
      let result = text(value);
      // Prevent spreadsheet formula interpretation; preserve genuine numeric values.
      if (typeof value !== 'number' && !(column?.type === 'number' && decimal(value)) && /^[\s\uFEFF]*[=+\-@]/u.test(result)) result = `'${result}`;
      return /["\r\n\t,]/u.test(result) ? `"${result.replace(/"/g, '""')}"` : result;
    }
    return '\uFEFF' + [exported.map(column => cell(column.label)).join(delimiter),
      ...rows.map(row => exported.map(column => cell((column.exportValue || column.value)(row), column)).join(delimiter))].join('\r\n');
  }
  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }
  function button(label, action, className = 'secondary') {
    const node = element('button', className, label);
    node.type = 'button';
    if (action) node.addEventListener('click', action);
    return node;
  }
  function iconButton(label, icon, action) {
    const node = button('', action, 'secondary standard-grid-icon');
    node.setAttribute('aria-label', label);
    node.title = label;
    // Local shared icons, independent of an external icon runtime.
    const paths = { menu: 'M4 6h16M4 12h16M4 18h16', filter: 'M4 5h16l-6 7v6l-4 2v-8z',
      all: 'M4 4h16v16H4zM7 12l3 3 7-7', none: 'M4 4h16v16H4z' };
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.6');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', paths[icon]); svg.append(path); node.append(svg);
    return node;
  }
  function closePopup(restoreFocus = true) {
    if (!activePopup) return;
    const { panel, trigger, controller } = activePopup;
    activePopup = null;
    controller.abort();
    if (panel.matches(':popover-open')) panel.hidePopover();
    panel.remove(); trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus && trigger.isConnected) trigger.focus();
  }
  function popup(control, trigger, title) {
    closePopup(false);
    control.options.beforeChange?.();
    const panel = element('section', 'standard-grid-popover');
    panel.setAttribute('popover', 'auto'); panel.setAttribute('role', 'dialog');
    panel.id = `standard-grid-popup-${++nextId}`;
    const heading = element('div', 'standard-grid-popover-heading');
    const caption = element('span', '', title); caption.id = `${panel.id}-title`;
    panel.setAttribute('aria-labelledby', caption.id);
    heading.append(caption, button('×', () => closePopup(), 'panel-close standard-grid-close'));
    heading.lastChild.setAttribute('aria-label', 'Close');
    panel.append(heading); document.body.append(panel);
    const controller = new AbortController();
    activePopup = { control, panel, trigger, controller };
    trigger.setAttribute('aria-expanded', 'true'); trigger.setAttribute('aria-controls', panel.id);
    panel.addEventListener('toggle', () => {
      if (!panel.matches(':popover-open') && activePopup?.panel === panel) closePopup();
    }, { signal: controller.signal });
    panel.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePopup(); }
    }, { signal: controller.signal });
    window.addEventListener('resize', () => closePopup(false), { signal: controller.signal });
    window.addEventListener('scroll', event => {
      if (!panel.contains(event.target)) closePopup(false);
    }, { capture: true, signal: controller.signal });
    return panel;
  }
  function reveal(panel, trigger) {
    panel.showPopover();
    const anchor = trigger.getBoundingClientRect();
    const bounds = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - bounds.width - 8))}px`;
    panel.style.top = `${Math.max(8, Math.min(anchor.bottom + 6, window.innerHeight - bounds.height - 8))}px`;
    panel.querySelector('input,select,button:not(.standard-grid-close)')?.focus();
  }
  function optionsFor(control, column) {
    const values = new Map();
    for (const option of column.options || []) {
      const entry = typeof option === 'object' ? option : { value: option, label: option };
      values.set(text(entry.value), { value: text(entry.value), label: text(entry.label) || '(Blank)' });
    }
    for (const row of control.options.rows) {
      const value = text(column.value(row));
      if (!values.has(value)) values.set(value, { value, label: text((column.exportValue || column.value)(row)) || '(Blank)' });
    }
    return [...values.values()].sort((a, b) => a.label.localeCompare(b.label));
  }
  function openFilter(control, column, trigger) {
    const panel = popup(control, trigger, `Filter ${column.label}`);
    const saved = control.filters[column.key];
    const fields = element('div', 'erp-field-rows standard-grid-filter-fields'); panel.append(fields);
    let read;
    if (column.type === 'enum') {
      const choices = optionsFor(control, column);
      const selected = new Set(saved ? saved.values : choices.map(choice => choice.value));
      const search = document.createElement('input'); search.type = 'search';
      search.placeholder = 'Search options…';
      search.setAttribute('aria-label', `Search ${column.label} options`);
      fields.append(search);
      const tools = element('div', 'standard-grid-selection-tools');
      const count = element('span', 'standard-grid-selection-count'); count.setAttribute('aria-live', 'polite');
      const list = element('div', 'standard-grid-enum-options');
      const updateCount = () => { count.textContent = `${selected.size} of ${choices.length} selected`; };
      const checks = [];
      for (const choice of choices) {
        const label = element('label', 'check');
        const check = document.createElement('input'); check.type = 'checkbox'; check.checked = selected.has(choice.value);
        check.addEventListener('change', () => { check.checked ? selected.add(choice.value) : selected.delete(choice.value); updateCount(); });
        label.append(check, document.createTextNode(choice.label)); list.append(label); checks.push({ check, label, choice });
      }
      function select(all) {
        selected.clear(); checks.forEach(({ check, choice }) => { check.checked = all; if (all) selected.add(choice.value); }); updateCount();
      }
      tools.append(iconButton('Select all options', 'all', () => select(true)),
        iconButton('Select no options', 'none', () => select(false)), count);
      search.addEventListener('input', () => checks.forEach(({ label, choice }) => {
        label.hidden = !choice.label.toLocaleLowerCase().includes(search.value.toLocaleLowerCase());
      }));
      fields.append(tools, list); updateCount();
      read = () => selected.size === choices.length ? null : { values: [...selected] };
    } else {
      const inputs = {};
      function field(key, caption, type, value) {
        const label = element('label', 'detail-field detail-field--full');
        const input = document.createElement('input'); input.type = type; input.value = value || '';
        if (type === 'number') input.step = 'any';
        label.append(element('span', 'account-field-caption', caption), input); fields.append(label); inputs[key] = input;
        return input;
      }
      if (column.type === 'text') {
        const input = field('pattern', 'Matches', 'text', saved?.pattern);
        input.placeholder = '*lease*';
        fields.append(element('p', 'muted', '* matches any text; ? matches one character.'));
        read = () => input.value ? { pattern: input.value } : null;
      } else {
        field('min', 'From', column.type, saved?.min); field('max', 'To', column.type, saved?.max);
        read = () => {
          const min = inputs.min.value, max = inputs.max.value;
          return min || max ? { min, max } : null;
        };
      }
      fields.addEventListener('input', () => Object.values(inputs).forEach(input => input.setCustomValidity('')));
      fields.validate = () => {
        for (const input of Object.values(inputs)) if (!input.reportValidity()) return false;
        if (inputs.min?.value && inputs.max?.value) {
          const comparison = column.type === 'number' ? compareNumbers(inputs.min.value, inputs.max.value) : inputs.min.value.localeCompare(inputs.max.value);
          if (comparison > 0) { inputs.max.setCustomValidity('To must be greater than or equal to From.'); inputs.max.reportValidity(); return false; }
        }
        return true;
      };
    }
    const footer = element('div', 'standard-grid-popover-footer');
    footer.append(button('Clear', () => { delete control.filters[column.key]; closePopup(false); draw(control, column.key); }),
      button('Apply', () => {
        if (fields.validate && !fields.validate()) return;
        const filter = read(); if (filter) control.filters[column.key] = filter; else delete control.filters[column.key];
        closePopup(false); draw(control, column.key);
      }, ''));
    panel.append(footer); reveal(panel, trigger);
  }
  function openExport(control, trigger) {
    const panel = popup(control, trigger, 'Export grid');
    const fields = element('div', 'erp-field-rows standard-grid-filter-fields');
    const label = element('label', 'detail-field detail-field--full');
    const select = document.createElement('select'); select.setAttribute('aria-label', 'Format');
    for (const [value, caption] of [['txt', 'Tab-delimited (.txt)'], ['csv', 'CSV (.csv)']]) {
      const option = element('option', '', caption); option.value = value; select.append(option);
    }
    label.append(element('span', 'account-field-caption', 'Format'), select); fields.append(label);
    const rows = filterRows(control.options.rows, control.options.columns, control.filters, control.sort);
    fields.append(element('p', 'muted', `Export ${rows.length} filtered rows in current sort order. Actions are excluded.`));
    panel.append(fields);
    const footer = element('div', 'standard-grid-popover-footer');
    footer.append(button('Export', () => {
      const format = select.value;
      const content = exportText(rows, control.options.columns, format);
      const url = URL.createObjectURL(new Blob([content], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url;
      link.download = `${text(control.options.exportName || 'grid').replace(/[^a-z0-9_-]/gi, '-')}.${format}`;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); closePopup();
    }, '')); panel.append(footer); reveal(panel, trigger);
  }
  function openMenu(control, trigger) {
    const panel = popup(control, trigger, 'Grid options');
    panel.classList.add('standard-grid-menu');
    panel.append(button('Reset widths', () => { control.widths = {}; closePopup(false); draw(control); control.menu.focus(); }),
      button('Export', () => openExport(control, trigger)),
      button('Clear filters', () => { control.filters = {}; closePopup(false); draw(control); control.menu.focus(); }));
    reveal(panel, trigger);
  }
  function draw(control, focusKey) {
    const { target, columns, rows, onOpen } = control.options;
    control.options.beforeChange?.();
    target.replaceChildren(); target.classList.add('grid-wrap', 'standard-grid-wrap');
    const table = element('table', 'data-grid standard-grid');
    const colgroup = document.createElement('colgroup');
    const total = () => columns.reduce((sum, column) => sum + (control.widths[column.key] || column.width || 150), 0);
    table.style.width = `${total()}px`;
    const head = document.createElement('thead'), headers = document.createElement('tr');
    for (const column of columns) {
      const col = document.createElement('col'); col.style.width = `${control.widths[column.key] || column.width || 150}px`; colgroup.append(col);
      const th = document.createElement('th'); th.scope = 'col';
      const heading = element('div', 'standard-grid-heading');
      if (column.sort !== false && column.type) {
        const sorted = control.sort?.key === column.key;
        th.setAttribute('aria-sort', sorted ? control.sort.direction === 'asc' ? 'ascending' : 'descending' : 'none');
        const sort = button(column.label + (sorted ? control.sort.direction === 'asc' ? ' ↑' : ' ↓' : ''), () => {
          closePopup(false);
          control.sort = control.sort?.key !== column.key ? { key: column.key, direction: 'asc' } :
            control.sort.direction === 'asc' ? { key: column.key, direction: 'desc' } : null;
          draw(control); target.querySelector(`[data-sort-key="${column.key}"]`)?.focus();
        }, 'standard-grid-sort');
        sort.dataset.sortKey = column.key; heading.append(sort);
      } else heading.append(element('span', '', column.label));
      if (column.type && column.filter !== false) {
        const filter = iconButton(`Filter ${column.label}${control.filters[column.key] ? ' (active)' : ''}`, 'filter', () => openFilter(control, column, filter));
        filter.dataset.filterKey = column.key; filter.setAttribute('aria-haspopup', 'dialog'); filter.setAttribute('aria-expanded', 'false');
        filter.classList.toggle('standard-grid-filter-active', Boolean(control.filters[column.key])); heading.append(filter);
      }
      const resize = element('span', 'standard-grid-resize');
      resize.tabIndex = 0; resize.setAttribute('role', 'separator'); resize.setAttribute('aria-orientation', 'vertical');
      resize.setAttribute('aria-label', `Resize ${column.label}`); resize.setAttribute('aria-valuemin', '90');
      resize.setAttribute('aria-valuenow', String(control.widths[column.key] || column.width || 150));
      function setWidth(width) {
        control.widths[column.key] = Math.max(90, Math.round(width)); col.style.width = `${control.widths[column.key]}px`;
        resize.setAttribute('aria-valuenow', String(control.widths[column.key])); table.style.width = `${total()}px`;
      }
      resize.addEventListener('keydown', event => {
        if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); setWidth(parseFloat(col.style.width) + (event.key === 'ArrowRight' ? 10 : -10)); }
      });
      resize.addEventListener('pointerdown', event => {
        event.preventDefault(); closePopup(false);
        const start = event.clientX, width = parseFloat(col.style.width); resize.setPointerCapture(event.pointerId);
        const move = event => setWidth(width + event.clientX - start);
        const end = () => { resize.removeEventListener('pointermove', move); resize.removeEventListener('pointerup', end); resize.removeEventListener('pointercancel', end); };
        resize.addEventListener('pointermove', move); resize.addEventListener('pointerup', end); resize.addEventListener('pointercancel', end);
      });
      th.append(heading, resize); headers.append(th);
    }
    head.append(headers); table.append(colgroup, head);
    const body = document.createElement('tbody');
    const displayed = filterRows(rows, columns, control.filters, control.sort);
    for (const row of displayed) {
      const tr = element('tr', onOpen ? 'click-row' : '');
      if (onOpen) {
        tr.tabIndex = 0;
        tr.addEventListener('click', event => {
          if (!event.target.closest('button,a,input,select,textarea,summary')) onOpen(row);
        });
        tr.addEventListener('keydown', event => {
          if (event.target === tr && ['Enter', ' '].includes(event.key)) { event.preventDefault(); onOpen(row); }
        });
      }
      for (const column of columns) {
        const td = document.createElement('td');
        if (column.type === 'number') td.className = 'standard-grid-number';
        const value = (column.render || column.value)(row);
        if (value instanceof Node) td.append(value); else td.textContent = text(value);
        tr.append(td);
      }
      body.append(tr);
    }
    if (!displayed.length) { const tr = document.createElement('tr'), td = element('td', '', 'No records match the current filters.'); td.colSpan = columns.length; tr.append(td); body.append(tr); }
    table.append(body); target.append(table);
    control.options.afterRows?.({ body, rows: displayed });
    const summary = element('div', 'standard-grid-summary', `${displayed.length} of ${rows.length} records`);
    summary.setAttribute('aria-live', 'polite'); target.append(summary);
    if (focusKey) target.querySelector(`[data-filter-key="${focusKey}"]`)?.focus();
  }
  function render(options) {
    let control = controls.get(options.target);
    if (!control) { control = { filters: {}, widths: {}, sort: null }; controls.set(options.target, control); }
    if (activePopup?.control === control) closePopup(false);
    if (control.options?.contextKey !== options.contextKey) { control.filters = {}; control.widths = {}; control.sort = null; }
    control.options = options;
    control.inactive = false; control.suspended = false;
    options.target.dataset.standardGrid = 'true';
    if (!control.menu) {
      control.menu = iconButton('Grid options', 'menu', () => openMenu(control, control.menu));
      control.menu.classList.add('standard-grid-menu-trigger'); control.menu.setAttribute('aria-haspopup', 'dialog'); control.menu.setAttribute('aria-expanded', 'false');
    }
    control.menu.hidden = false;
    const toolbar = options.target.closest('.panel')?.querySelector('.object-grid-tools') ||
      options.toolbar.querySelector('.panel-actions') || options.toolbar;
    toolbar.append(control.menu); draw(control);
  }
  function suspend(target) {
    const control = controls.get(target); if (!control) return;
    if (activePopup?.control === control) closePopup(false);
    control.menu.hidden = true; control.widths = {}; control.suspended = true;
  }
  function leave(target) {
    const control = controls.get(target); if (!control) return;
    if (activePopup?.control === control) closePopup(false);
    control.filters = {}; control.widths = {}; control.sort = null;
    control.menu.hidden = true; control.inactive = true;
  }
  function resume(target) {
    const control = controls.get(target);
    if (!control?.inactive) return;
    control.inactive = false;
    if (!control.suspended) render(control.options);
  }
  function destroy(target) {
    const control = controls.get(target); if (!control) return;
    suspend(target); control.menu.remove(); controls.delete(target);
  }
  return { render, suspend, leave, resume, destroy, filterRows, exportText, wildcard };
});
