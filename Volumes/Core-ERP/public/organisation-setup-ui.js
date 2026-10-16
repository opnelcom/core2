/* Shared presentation for Setup > Organisation; existing handlers own all writes. */
(function (root) {
  "use strict";
  root.installOrganisationSetupUi = function () {
    const document = root.document;
    const byId = id => document.getElementById(id);
    const definitions = [
      ["organisation-form", "Organisation", "org-id", "organisation-form", ["open-org-copy", "open-org-delete"]],
      ["division-form", "Division", "division-id"],
      ["fiscal-form", "Fiscal Year", "fiscal-year-id", "fiscal-editor-panel"],
      ["fiscal-period-form", "Fiscal Period", "fiscal-period-id", "fiscal-period-panel"],
      ["country-form", "Country", "country-code"],
      ["currency-form", "Currency", "currency-code"],
      ["exchange-rate-form", "Exchange Rate", null],
      ["tax-type-form", "Tax Type", "tax-type-id"],
      ["resource-role-form", "Resource Role", "resource-role-id", "resource-role-modal"],
      ["financial-format-form", "Financial Statement Format", "financial-format-id", null, ["delete-financial-format"]],
    ];
    const rolePanel = byId("resource-role-modal");
    rolePanel.classList.remove("modal-backdrop");
    rolePanel.classList.add("organisation-setup-panel-wrapper");
    byId("resource-role-form").classList.remove("resource-role-modal-panel");
    byId("resource-role-form").removeAttribute("aria-modal");
    byId("resource-role-form").removeAttribute("role");

    for (const [formId, name, identityId, wrapperId, actionIds = []] of definitions) {
      const form = byId(formId), panel = byId(wrapperId || formId);
      form.classList.add("organisation-setup-editor", "organisation-standard-editor", "erp-field-rows", "accounting-record-editor");
      panel.classList.add("organisation-standard-panel");
      if (formId === "financial-format-form") panel.classList.add("organisation-standard-panel--wide");
      const heading = form.querySelector("h2");
      const header = document.createElement("div");
      header.className = "organisation-setup-heading";
      heading.before(header); header.append(heading);
      const footer = form.querySelector(":scope > .actions");
      footer.classList.add("organisation-setup-footer", "account-editor-actions");
      footer.querySelectorAll('[id^="new-"]').forEach(button => { button.hidden = true; });
      const close = panel.querySelector(":scope > .panel-close") || form.querySelector(".panel-close");
      const save = footer.querySelector('[type="submit"]');
      save.textContent = `Save ${name}`;
      const openerState = { element: null };
      if (formId !== "resource-role-form") close.addEventListener("click", () => {
        const opener = openerState.element;
        if (opener?.isConnected && opener.getClientRects().length) opener.focus();
      });
      const update = () => {
        if (panel.hidden) return;
        if (!openerState.element || !form.contains(document.activeElement)) openerState.element = document.activeElement;
        const editing = identityId ? !!byId(identityId).value : byId("exchange-rate-from").disabled;
        heading.textContent = `${editing ? "Edit" : "New"} ${name}`;
        form.querySelectorAll('[role="tab"]').forEach(tab => { tab.tabIndex = tab.getAttribute("aria-selected") === "true" ? 0 : -1; });
        if (actionIds.length) {
          actions.hidden = !editing;
          actions.open = false;
        }
        root.requestAnimationFrame(() => {
          if (!panel.hidden) form.querySelector('input:not([type="hidden"]):not([disabled]),select:not([disabled]),textarea:not([disabled])')?.focus();
        });
      };
      let actions;
      if (actionIds.length) {
        actions = document.createElement("details"); actions.className = "organisation-setup-actions";
        const summary = document.createElement("summary"); summary.textContent = "Actions";
        const menu = document.createElement("div"); menu.className = "organisation-setup-action-list";
        actions.append(summary, menu); header.append(actions);
        for (const id of actionIds) {
          const button = byId(id); menu.append(button);
          button.addEventListener("click", () => { actions.open = false; });
        }
      }
      new root.MutationObserver(update).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
      form.addEventListener("keydown", event => {
        if (event.key === "Escape" && formId !== "resource-role-form") { event.preventDefault(); close.click(); }
      });
      // A different row can be selected while the panel is already open.
      const view = form.closest(".view");
      view.dataset.organisationSetup = "true";
      view.addEventListener("click", event => {
        if (!event.target.closest("form") && event.target.closest(".click-row, .add-record-button")) root.queueMicrotask(update);
      });
      form.querySelectorAll("label:not(.check)").forEach(label => {
        if (label.closest(".schema-grid")) return;
        const control = label.querySelector(":scope > input, :scope > select, :scope > textarea");
        if (!control) return;
        const short = control.type === "date" || control.type === "number" || /code|alpha3|numeric/.test(control.id);
        const medium = control.tagName === "SELECT" || /region|currency|symbol|calling/.test(control.id);
        label.classList.add("detail-field", short ? "detail-field--short" : medium ? "detail-field--medium" : "detail-field--wide");
      });
      view.querySelectorAll(".grid-search").forEach(input => input.setAttribute("aria-label", input.placeholder));
      view.querySelectorAll(".add-record-button").forEach(button => {
        const sectionName = button.closest(".panel-head")?.querySelector("h2")?.textContent || name;
        if (!button.hasAttribute("aria-label")) button.setAttribute("aria-label", `Add ${sectionName}`);
        button.title = button.getAttribute("aria-label");
      });
      // Existing tab activation handlers remain authoritative; add shared keyboard navigation.
      form.querySelectorAll('[role="tablist"]').forEach(tablist => {
        const tabs = [...tablist.querySelectorAll("button")];
        tabs.forEach((button, index) => {
          if (formId === "organisation-form") {
            button.id = `organisation-tab-${index}`;
            const panel = byId(button.getAttribute("aria-controls"));
            panel.setAttribute("role", "tabpanel"); panel.setAttribute("aria-labelledby", button.id);
            const syncTabStops = () => tabs.forEach(tab => { tab.tabIndex = tab.getAttribute("aria-selected") === "true" ? 0 : -1; });
            button.addEventListener("click", syncTabStops);
            syncTabStops();
          }
          button.addEventListener("keydown", event => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            // Resource Roles and Exchange Rates already implement keyboard tabs.
            if (["resource-role-form", "exchange-rate-form"].includes(formId)) return;
            event.preventDefault();
            const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
            tabs[next].click(); tabs[next].focus();
          });
        });
      });
    }
    byId("division-list").closest(".panel").querySelector("h2").textContent = "Divisions";
  };
})(window);
