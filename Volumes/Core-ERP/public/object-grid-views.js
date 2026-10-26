(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.erpObjectGridViews = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const controls = new WeakMap();
  const statusFilters = new WeakMap();
  function setStatusFilter(target, filter) {
    const previous=statusFilters.get(target);
    previous?.label?.remove();
    statusFilters.delete(target);
    if(filter)statusFilters.set(target,{...filter});
  }
  const viewOptions = [{ value: "columnar", label: "Columnar" }, { value: "status", label: "Status" }];
  function installDefaultControl(workflowControl, id) {
    if (!workflowControl || document.getElementById(id)) return;
    const label = document.createElement("label");
    label.append(document.createTextNode("Default grid view"));
    const select = document.createElement("select");
    select.id = id;
    for (const view of viewOptions) {
      const option = document.createElement("option");
      option.value = view.value;
      option.textContent = view.label;
      select.append(option);
    }
    label.append(select);
    workflowControl.closest("label").after(label);
  }

  function statusGroups(rows, { statuses = [], steps = [], workflowPath }) {
    const paths = new Set(rows.map(workflowPath).filter(Boolean));
    const groups = new Map();
    for (const row of rows) {
      const code = row.workflow_status || "";
      if (!groups.has(code)) {
        const status = statuses.find(item => item.status_code === code);
        const orders = steps.filter(step => paths.has(step.workflow_path_id) && step.step_code === code)
          .map(step => Number(step.sort_order)).filter(Number.isFinite);
        groups.set(code, {
          code,
          label: status?.status_label || row.workflow_step_label || code || "No status",
          colour: status?.colour || row.workflow_step_colour || "#667085",
          sort: orders.length ? Math.min(...orders) : Infinity,
          rows: [],
        });
      }
      groups.get(code).rows.push(row);
    }
    return [...groups.values()].sort((a, b) =>
      (a.sort === b.sort ? 0 : a.sort < b.sort ? -1 : 1) ||
      a.label.localeCompare(b.label) || a.code.localeCompare(b.code));
  }

  function render({ target, toolbar, enabled = true, columns, rows, onOpen,
    code, name, workflowButton, actionButton, table, statuses, steps, workflowPath, beforeChange,
    contextKey, defaultView = "columnar", tileValue, tileDescription }) {
    const options = arguments[0];
    let filter=statusFilters.get(target);
    if(filter && filter.contextKey!==contextKey){setStatusFilter(target,null);filter=null;}
    if(filter){
      rows=rows.filter(row=>row.workflow_status===filter.status_code);
      if(!filter.label){
        const label=document.createElement('div');label.className='dashboard-status-filter';
        const text=document.createElement('span');text.textContent=`Workflow status: ${filter.status_label}`;
        const clear=document.createElement('button');clear.type='button';clear.className='secondary';clear.textContent='Clear status filter';
        clear.addEventListener('click',()=>{setStatusFilter(target,null);render(options);});
        label.append(text,clear);target.before(label);filter.label=label;
      }
    }
    if (globalThis.erpWorkflowGridVisibility) rows = globalThis.erpWorkflowGridVisibility.prepare(target, rows, statuses || [], () => render(options),!!filter);
    let control = controls.get(target);
    if (!control && enabled) {
      const label = document.createElement("div");
      label.className = "object-grid-view-control";
      label.setAttribute("role", "group");
      label.setAttribute("aria-label", "Grid Views");
      const buttons = [];
      for (const view of viewOptions) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "secondary";
        button.setAttribute("aria-label", view.label);
        button.setAttribute("title", view.label);
        const path = view.value === "columnar"
          ? 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18'
          : 'M3 3h4v18H3zM10 3h4v12h-4zM17 3h4v15h-4z';
        button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
        button.addEventListener("click", () => {
          if (control.view === view.value) return;
          control.view = view.value;
          control.options.beforeChange?.();
          render(control.options);
        });
        buttons.push(button);
        label.append(button);
      }
      const tools = toolbar.parentElement?.querySelector(".object-grid-tools") ||
        (toolbar.classList.contains("object-grid-toolbar") && toolbar.querySelector(".panel-actions"));
      if (tools) tools.append(label);
      else toolbar.prepend(label);
      control = { label, buttons, view: "columnar" };
      controls.set(target, control);
    }
    if (control) {
      if (control.contextKey !== contextKey || control.defaultView !== defaultView || control.enabled !== enabled) {
        control.view = viewOptions.find(view => view.value === defaultView)?.value || "columnar";
        control.contextKey = contextKey;
        control.defaultView = defaultView;
        control.enabled = enabled;
      }
      control.options = arguments[0];
      control.label.hidden = !enabled;
      control.buttons.forEach((button, index) => button.setAttribute("aria-pressed", String(viewOptions[index].value === control.view)));
    }
    if (!enabled || control.view === "columnar") {
      target.classList.remove("object-status-grid-wrap");
      if (options.standardGrid) {
        globalThis.erpStandardGrid.render({ ...options.standardGrid, target, toolbar, rows, onOpen,
          contextKey, beforeChange, columns: options.standardGrid.columns.map((column, index) =>
            ({ ...column, label: columns[index][0], render: columns[index][1] })) });
      } else table(target, columns, rows, onOpen, true);
      return;
    }
    globalThis.erpStandardGrid?.suspend(target);
    target.replaceChildren();
    target.classList.add("grid-wrap", "object-status-grid-wrap");
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "No records to display.";
      target.append(empty);
      return;
    }
    const board = document.createElement("div");
    board.className = "object-status-grid";
    board.setAttribute("aria-label", "Records by workflow status");
    for (const group of statusGroups(rows, { statuses, steps, workflowPath })) {
      const lane = document.createElement("section");
      lane.className = "object-status-column";
      lane.style.setProperty("--workflow-colour", group.colour);
      lane.setAttribute("aria-label", `${group.label}: ${group.rows.length} records`);
      const heading = document.createElement("h3");
      heading.className = "object-status-column-heading";
      const title = document.createElement("span");
      title.textContent = group.label;
      const count = document.createElement("span");
      count.className = "object-status-column-count";
      count.textContent = group.rows.length;
      heading.append(title, count);
      lane.append(heading);
      for (const row of group.rows) {
        const tile = document.createElement("article");
        tile.className = "object-status-tile";
        const open = document.createElement("button");
        open.type = "button";
        open.className = "object-status-record";
        open.setAttribute("aria-label", `Open ${code(row)} ${name(row)}`);
        open.textContent = `${code(row)} - ${name(row)}`;
        open.addEventListener("click", () => onOpen(row));
        tile.append(open);
        const descriptionText = tileDescription?.(row);
        if (descriptionText) {
          const description = document.createElement("div");
          description.className = "object-status-description";
          description.textContent = descriptionText;
          tile.append(description);
        }
        if (tileValue) {
          const value = document.createElement("div");
          value.className = "object-status-value";
          value.textContent = tileValue(row);
          tile.append(value);
        }
        tile.append(workflowButton(row));
        if (actionButton) tile.append(actionButton(row));
        lane.append(tile);
      }
      board.append(lane);
    }
    target.append(board);
  }
  return { statusGroups, render, viewOptions, installDefaultControl, setStatusFilter };
});
