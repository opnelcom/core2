/* Explicit scalar field presentation; shared widths live in style.css. */
(function () {
  "use strict";
  const fields = {
    short: ["transaction-type-code", "transaction-type-sort", "erp-user-valid_from", "erp-user-valid_to"],
    medium: ["transaction-type-group", "transaction-type-workflow-path", "transaction-type-default-grid-view", "erp-user-title"],
    wide: ["transaction-type-name", "transaction-type-description", "erp-user-email", "erp-user-known_name", "erp-user-full_name", "erp-user-description"],
  };
  window.erpEditorConventions = { install() {
    for (const [size, ids] of Object.entries(fields)) for (const id of ids) {
      const label = document.getElementById(id)?.closest("label");
      if (label) label.classList.add("detail-field", `detail-field--${size}`);
    }
    document.getElementById("erp-user-tab-identification")?.classList.add("erp-identification-fields");
    document.getElementById("transaction-type-form")?.classList.add("erp-field-rows");
  } };
})();
