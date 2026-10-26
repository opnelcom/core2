(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.erpMovablePanels = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const controllers = new WeakMap();
  const installations = new WeakSet();
  const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
  function install({ root = document, workspace = root.querySelector("main") } = {}) {
    if (installations.has(root)) return;
    installations.add(root);
    const records = new Map();
    let scheduled, active;
    function bounds(record) {
      // Modal content stays in its own viewport; ordinary editors stay in the ERP workspace.
      const modal = record.panel.closest(".modal-backdrop, dialog");
      const rect = !modal && workspace?.getBoundingClientRect();
      const viewport = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
      const area = rect && rect.width && rect.height ? {
        left: Math.max(viewport.left, rect.left), top: Math.max(viewport.top, rect.top),
        right: Math.min(viewport.right, rect.right), bottom: Math.min(viewport.bottom, rect.bottom),
      } : viewport;
      return { left: area.left + 8, top: area.top + 8, right: Math.max(area.left + 8, area.right - 8), bottom: Math.max(area.top + 8, area.bottom - 8) };
    }
    function visible(record) { return record.panel.isConnected && record.panel.getClientRects().length > 0; }
    function own(record, property, value) {
      if (!record.original.has(property)) record.original.set(property, [record.panel.style.getPropertyValue(property), record.panel.style.getPropertyPriority(property)]);
      if (record.panel.style.getPropertyValue(property) !== value) record.panel.style.setProperty(property, value);
      record.owned.set(property, value);
    }
    function activate(record) {
      if (active && active !== record) {
        const original = active.original.get("z-index");
        if (original) active.panel.style.setProperty("z-index", ...original);
      }
      active = record;
      own(record, "z-index", "30");
    }
    function position(record, x, y, width, height) {
      const area = bounds(record);
      width = Math.max(1, Math.min(width, area.right - area.left));
      height = Math.max(1, Math.min(height, area.bottom - area.top));
      x = clamp(x, area.left, area.right - width); y = clamp(y, area.top, area.bottom - height);
      // Keep the existing DOM and selectors intact; only the floating surface changes position.
      own(record, "position", "fixed"); own(record, "box-sizing", "border-box");
      own(record, "right", "auto"); own(record, "bottom", "auto"); own(record, "margin", "0px");
      own(record, "left", `${x}px`); own(record, "top", `${y}px`);
      own(record, "width", `${width}px`); own(record, "height", `${height}px`);
      own(record, "max-width", `${Math.max(1, area.right - area.left)}px`);
      own(record, "max-height", `${Math.max(1, area.bottom - y)}px`);
      record.moved = true;
    }
    function reset(record) {
      record.drag = null;
      record.panel.classList.remove("editor-moving");
      // Respect independent sizing/reset handlers that have already changed an owned property.
      for (const [property, [value, priority]] of record.original) {
        if (record.panel.style.getPropertyValue(property) !== record.owned.get(property)) continue;
        if (value) record.panel.style.setProperty(property, value, priority);
        else record.panel.style.removeProperty(property);
      }
      record.original.clear(); record.owned.clear(); record.moved = false;
      if (active === record) active = null;
    }
    function fit(record) {
      if (!record.moved || !visible(record)) return;
      const rect = record.panel.getBoundingClientRect();
      position(record, rect.left, rect.top, rect.width, rect.height);
    }
    function register(candidate) {
      if (candidate.matches(".erp-editor-dialog, #transaction-type-form")) return;
      // Resource roles have a floating wrapper; fiscal editors are already separate panel surfaces.
      const panel = candidate.closest(".organisation-setup-panel-wrapper") || candidate;
      if (panel.closest(".movable-editor") && !records.has(panel)) return;
      const style = getComputedStyle(panel);
      const floating = ["absolute", "fixed"].includes(style.position) || panel.closest(".editor-stack, .modal-backdrop, dialog");
      if (!floating) return;
      const heading = candidate.querySelector("h2");
      if (!heading) return;
      let record = records.get(panel);
      if (!record) {
        record = { panel, candidate, original: new Map(), owned: new Map(), moved: false, drag: null };
        records.set(panel, record); panel.classList.add("movable-editor");
        controllers.set(panel, { resize(width, height) {
          if (!record.moved) return false;
          const rect = panel.getBoundingClientRect(), area = bounds(record);
          // Preserve the existing resize grip's 420×280 minimum and top/right anchoring.
          const maxWidth = Math.max(1, rect.right - area.left), maxHeight = Math.max(1, area.bottom - rect.top);
          width = clamp(width, Math.min(420, maxWidth), maxWidth);
          height = clamp(height, Math.min(280, maxHeight), maxHeight);
          position(record, rect.right - width, rect.top, width, height);
          return true;
        } });
        const handle = document.createElement("button");
        handle.type = "button"; handle.className = "editor-move-handle"; handle.textContent = "✥";
        handle.setAttribute("aria-label", "Move edit panel; drag or use arrow keys");
        handle.title = "Drag heading to move; arrow keys move the panel";
        record.handle = handle;
        handle.addEventListener("keydown", event => {
          const steps = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
          if (!steps[event.key]) return;
          event.preventDefault(); event.stopPropagation();
          const rect = panel.getBoundingClientRect(), step = event.shiftKey ? 50 : 10;
          activate(record); position(record, rect.left + steps[event.key][0] * step, rect.top + steps[event.key][1] * step, rect.width, rect.height);
        });
        panel.addEventListener("pointerdown", event => {
          const title = event.target.closest(".editor-drag-heading");
          if (!title || !panel.contains(title) || event.button !== 0 || event.isPrimary === false || record.drag) return;
          const control = event.target.closest("button, input, select, textarea, a, summary, [contenteditable], [role='button']");
          if (control && control !== record.handle) return;
          if (!visible(record)) return;
          event.preventDefault();
          const rect = panel.getBoundingClientRect();
          activate(record); position(record, rect.left, rect.top, rect.width, rect.height);
          const start = panel.getBoundingClientRect();
          record.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: start.left, top: start.top };
          // Capture on the title, so releasing cannot look like a click on a modal backdrop.
          title.setPointerCapture(event.pointerId); panel.classList.add("editor-moving");
        });
        panel.addEventListener("pointermove", event => {
          const drag = record.drag;
          if (!drag || drag.id !== event.pointerId) return;
          const rect = panel.getBoundingClientRect();
          position(record, drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y, rect.width, rect.height);
        });
        const release = event => {
          if (!record.drag || event.pointerId !== record.drag.id) return;
          record.drag = null; panel.classList.remove("editor-moving");
        };
        for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) panel.addEventListener(event, release);
        const resizeObserver = new ResizeObserver(() => { if (!record.drag) fit(record); });
        resizeObserver.observe(panel); record.resizeObserver = resizeObserver;
      }
      const header = heading.closest(".record-editor-header, .organisation-setup-heading") ||
        (heading.parentElement.classList.contains("panel-head") ? heading.parentElement : heading);
      if (record.header !== header) {
        record.header?.classList.remove("editor-drag-heading");
        record.header = header; header.classList.add("editor-drag-heading");
      }
      // Existing editors replace heading text when records change. Reattach the same keyboard control.
      if (!heading.contains(record.handle)) heading.prepend(record.handle);
    }
    function scan() {
      scheduled = null;
      root.querySelectorAll(".panel.form, dialog:has(form)").forEach(register);
      for (const [panel, record] of records) if (!panel.isConnected) {
        if (active === record) active = null;
        record.resizeObserver.disconnect(); controllers.delete(panel); records.delete(panel);
      }
    }
    const observer = new MutationObserver(changes => {
      for (const change of changes) if (change.type === "attributes") {
        for (const record of records.values()) {
          if (change.target === record.panel || change.target.contains(record.panel)) reset(record);
        }
      }
      if (changes.some(change => change.type === "childList") && !scheduled) scheduled = requestAnimationFrame(scan);
    });
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "open"] });
    window.addEventListener("resize", () => records.forEach(fit));
    workspace?.addEventListener("scroll", () => records.forEach(fit), { passive: true });
    if (workspace) new ResizeObserver(() => records.forEach(fit)).observe(workspace);
    scan();
  }
  function resize(panel, width, height) { return controllers.get(panel)?.resize(width, height) || false; }
  return { install, resize };
});
