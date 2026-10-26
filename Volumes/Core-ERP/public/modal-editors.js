(function () {
  "use strict";
  const installed = new WeakSet();
  window.erpModalEditors = { install({ root = document } = {}) {
    if (installed.has(root)) return;
    installed.add(root);
    const records = new Map();
    function visible(panel) {
      for (let node = panel; node && node !== root; node = node.parentElement) {
        if (node.hidden) return false;
      }
      return panel.isConnected;
    }
    function register(candidate) {
      if (candidate.closest("#transaction-type-form, dialog")) return;
      const panel = candidate.closest(".organisation-setup-panel-wrapper, #intake-modal") || candidate;
      if (records.has(panel)) return;
      const dialog = document.createElement("dialog");
      dialog.className = "erp-editor-dialog";
      const heading = panel.querySelector("h2, h3");
      if (heading) {
        if (!heading.id) heading.id = `${panel.id || "erp-editor"}-modal-heading`;
        dialog.setAttribute("aria-labelledby", heading.id);
      } else dialog.setAttribute("aria-label", "Edit record");
      // Preserve the existing editor size categories rather than stretching every form.
      const wide = new Set(["tax-type-form", "role-form", "legal-entity-form", "report-definition-form", "accounting-object-form", "accounting-dimension-form", "resource-form", "module-form", "gl-account-type-form", "account-form", "master-record-form", "erp-user-form"]);
      const width = panel.matches(".organisation-standard-panel--wide, #journal-form") ? 1100 : panel.classList.contains("organisation-standard-panel") ? 520 : panel.id === "workflow-form" ? 940 : wide.has(panel.id) ? 820 : 520;
      panel.style.setProperty("--erp-editor-width", `${width}px`);
      panel.before(dialog);
      dialog.append(panel);
      panel.classList.add("erp-modal-surface");
      records.set(panel, dialog);
      dialog.addEventListener("click", event => {
        // These two existing overlays dismiss through their own backdrop handlers.
        if (event.target === dialog && panel.matches("#intake-modal, #resource-role-modal")) panel.click();
      });
      dialog.addEventListener("keydown", event => {
        if (event.key !== "Tab") return;
        const fields = [...dialog.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
          .filter(field => !field.disabled && field.tabIndex >= 0 && field.getClientRects().length);
        const first = fields[0], last = fields[fields.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      });
      dialog.addEventListener("cancel", event => {
        event.preventDefault();
        const close = panel.querySelector(".panel-close, #close-resource-role-modal, #close-intake");
        if (close) close.click();
      });
    }
    function sync() {
      root.querySelectorAll(".panel.form, .organisation-setup-panel-wrapper, #intake-modal").forEach(register);
      for (const [panel, dialog] of records) {
        if (!panel.isConnected) { dialog.remove(); records.delete(panel); continue; }
        if (visible(panel)) {
          if (!dialog.open) dialog.showModal();
        } else if (dialog.open) dialog.close();
      }
    }
    new MutationObserver(sync).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden"] });
    sync();
  } };
})();
