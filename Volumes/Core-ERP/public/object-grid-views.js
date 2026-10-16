(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.erpObjectGridViews = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const controls = new WeakMap();
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
    contextKey, defaultView = "columnar" }) {
    const options = arguments[0];
    if (globalThis.erpWorkflowGridVisibility) rows = globalThis.erpWorkflowGridVisibility.prepare(target, rows, statuses || [], () => render(options));
    let control = controls.get(target);
    if (!control && enabled) {
      const label = document.createElement("label");
      label.className = "object-grid-view-control";
      label.append(document.createTextNode("Grid Views"));
      const select = document.createElement("select");
      select.setAttribute("aria-label", "Grid Views");
      for (const { label: value } of viewOptions) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.append(option);
      }
      select.value = "Columnar";
      label.append(select);
      toolbar.prepend(label);
      control = { label, select };
      controls.set(target, control);
      select.addEventListener("change", () => {
        control.options.beforeChange?.();
        render(control.options);
      });
    }
    if (control) {
      if (control.contextKey !== contextKey || control.defaultView !== defaultView || control.enabled !== enabled) {
        control.select.value = viewOptions.find(view => view.value === defaultView)?.label || "Columnar";
        control.contextKey = contextKey;
        control.defaultView = defaultView;
        control.enabled = enabled;
      }
      control.options = arguments[0];
      control.label.hidden = !enabled;
    }
    if (!enabled || control.select.value === "Columnar") {
      target.classList.remove("object-status-grid-wrap");
      table(target, columns, rows, onOpen, true);
      return;
    }
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
        tile.append(open, workflowButton(row));
        if (actionButton) tile.append(actionButton(row));
        lane.append(tile);
      }
      board.append(lane);
    }
    target.append(board);
  }
  return { statusGroups, render, viewOptions, installDefaultControl };
});
