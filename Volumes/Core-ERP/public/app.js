(() => {
  const $ = (id) => document.getElementById(id);
  let boot = {
    organisations: [],
    currencies: [],
    countries: [],
    subledger_account_types: [],
  };
  let state = {
    orgId: null,
    divisionId: null,
    includeChildren: false,
    navigation: {
      roles: [],
      modules: [],
      permissions: [],
      is_administrator: false,
    },
    modules: [],
    currencies: [],
    countries: [],
    taxTypes: [],
    taxRates: [],
    divisions: [],
    accounts: [],
    glAccountTypes: [],
    subledgerAccountTypes: [],
    masterTypes: [],
    masterRecords: [],
    accountingObjectTypes: [],
    accountingDimensionTypes: [],
    accountingObjects: [],
    accountingDimensions: [],
    legalEntities: [],
    legalEntityDetail: null,
    journals: [],
    years: [],
    periods: [],
    financialFormats: [],
    financialFormatLines: [],
    financialFormatMappings: [],
    transactionGroups: [],
    transactionTypes: [],
    lineDefinitions: [],
    workflowPaths: [],
    workflowSteps: [],
    workflowNext: [],
    roles: [],
    rolePermissions: [],
    roleUsers: [],
    dashboardSummary: null,
  };
  let selectedMasterRecord = null;
  let selectedAccountingObject = null;
  let selectedAccountingDimension = null;
  let accountingObjectParentOptions = [];
  let selectedJournal = null;
  let selectedLegalEntity = null;
  let selectedAccountScopeCode = "gl";
  let selectedAccountingObjectTypeId = "";
  let selectedAccountingDimensionTypeId = "";
  let selectedTransactionTypeId = "";
  let selectedReport = "financial_statement";
  let selectedFinancialFormatId = "";
  let currentIntakeDraft = null;
  let expandedFiscalYears = new Set();
  let expandedLedgerFamilies = new Set();
  let expandedTransactionGroups = new Set();
  let loadedAccountFamilies = new Set();
  let loadedSlices = {
    menu: false,
    dashboard: false,
    divisions: false,
    fiscal: false,
    countries: false,
    currencies: false,
    taxTypes: false,
    accountTypes: false,
    masterTypes: false,
    accountingObjectTypes: false,
    accountingDimensionTypes: false,
    legalEntities: false,
    financialFormats: false,
    transactions: false,
    permissions: false,
  };
  let visibleOrganisationLimit = 4;
  let collapsedDivisionIds = new Set();
  const dirtyForms = new WeakSet();
  const today = () => new Date().toISOString().slice(0, 10);
  const pretty = (v) => String(v || "").replaceAll("_", " ");
  const setupViews = new Set([
    "setup",
    "organisations",
    "divisions",
    "fiscal",
    "countries",
    "currencies",
    "taxtypes",
    "modules",
    "ledgerfamilies",
    "accountingobjecttypes",
    "accountingdimensiontypes",
    "financialformats",
    "transactiongroups",
    "transactiontypes",
    "workflows",
    "permissions",
  ]);
  const transactionWorkflowOptions = [
    "view",
    "*",
    "draft",
    "submitted",
    "approved",
    "rejected",
    "blocked",
    "reversed",
    "deleted",
  ];

  function sanitizedModuleSvg(value) {
    if (!value) return "";
    const parsed = new DOMParser().parseFromString(
      String(value),
      "image/svg+xml",
    );
    if (
      parsed.querySelector("parsererror") ||
      parsed.documentElement.localName !== "svg"
    )
      return "";
    const tags = new Set([
      "svg",
      "g",
      "path",
      "circle",
      "rect",
      "line",
      "polyline",
      "polygon",
      "ellipse",
    ]);
    const attrs = new Set([
      "viewBox",
      "d",
      "cx",
      "cy",
      "r",
      "x",
      "y",
      "width",
      "height",
      "x1",
      "y1",
      "x2",
      "y2",
      "points",
      "fill",
      "stroke",
      "stroke-width",
      "stroke-linecap",
      "stroke-linejoin",
      "transform",
      "opacity",
      "rx",
      "ry",
      "aria-hidden",
      "role",
    ]);
    const clone = (node) => {
      if (!tags.has(node.localName)) return null;
      const clean = document.createElementNS(
        "http://www.w3.org/2000/svg",
        node.localName,
      );
      for (const attribute of node.attributes || []) {
        if (
          attrs.has(attribute.name) &&
          !/(?:javascript:|url\s*\()/i.test(attribute.value)
        )
          clean.setAttribute(attribute.name, attribute.value);
      }
      for (const child of node.children || []) {
        const safe = clone(child);
        if (safe) clean.appendChild(safe);
      }
      return clean;
    };
    return clone(parsed.documentElement)?.outerHTML || "";
  }
  function sanitizedOrganisationSvg(value) {
    if (!value) return "";
    const parsed = new DOMParser().parseFromString(
      String(value),
      "image/svg+xml",
    );
    if (
      parsed.querySelector("parsererror") ||
      parsed.documentElement.localName.toLowerCase() !== "svg"
    )
      return "";
    const tagNames = new Map([
      ["svg", "svg"],
      ["g", "g"],
      ["path", "path"],
      ["rect", "rect"],
      ["circle", "circle"],
      ["ellipse", "ellipse"],
      ["line", "line"],
      ["polyline", "polyline"],
      ["polygon", "polygon"],
      ["title", "title"],
      ["desc", "desc"],
      ["defs", "defs"],
      ["lineargradient", "linearGradient"],
      ["radialgradient", "radialGradient"],
      ["stop", "stop"],
      ["clippath", "clipPath"],
      ["mask", "mask"],
    ]);
    const globalAttributes = new Set([
      "id",
      "transform",
      "fill",
      "stroke",
      "stroke-width",
      "stroke-linecap",
      "stroke-linejoin",
      "stroke-miterlimit",
      "fill-rule",
      "clip-rule",
      "opacity",
      "clip-path",
      "mask",
      "vector-effect",
    ]);
    const tagAttributes = {
      svg: [
        "xmlns",
        "viewbox",
        "width",
        "height",
        "role",
        "aria-label",
        "focusable",
        "preserveaspectratio",
      ],
      path: ["d", "pathlength"],
      rect: ["x", "y", "width", "height", "rx", "ry"],
      circle: ["cx", "cy", "r"],
      ellipse: ["cx", "cy", "rx", "ry"],
      line: ["x1", "y1", "x2", "y2"],
      polyline: ["points"],
      polygon: ["points"],
      linearGradient: [
        "x1",
        "y1",
        "x2",
        "y2",
        "gradientunits",
        "gradienttransform",
      ],
      radialGradient: [
        "cx",
        "cy",
        "r",
        "fx",
        "fy",
        "gradientunits",
        "gradienttransform",
      ],
      stop: ["offset", "stop-color", "stop-opacity"],
      clipPath: ["clippathunits"],
      mask: ["x", "y", "width", "height", "maskunits", "maskcontentunits"],
    };
    const canonicalAttributes = {
      viewbox: "viewBox",
      preserveaspectratio: "preserveAspectRatio",
      pathlength: "pathLength",
      gradientunits: "gradientUnits",
      gradienttransform: "gradientTransform",
      clippathunits: "clipPathUnits",
      maskunits: "maskUnits",
      maskcontentunits: "maskContentUnits",
    };
    const clone = (node) => {
      const tag = tagNames.get(node.localName.toLowerCase());
      if (!tag) return null;
      const clean = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const attribute of node.attributes || []) {
        const name = attribute.name.toLowerCase();
        const allowed =
          globalAttributes.has(name) ||
          (tagAttributes[tag] || []).includes(name) ||
          (tag === "svg" && name === "xmlns");
        if (!allowed || /[<>&`]/.test(attribute.value)) continue;
        if (
          /url\s*\(/i.test(attribute.value) &&
          !/^url\(#[A-Za-z_][A-Za-z0-9_.:-]*\)$/.test(attribute.value)
        )
          continue;
        clean.setAttribute(
          canonicalAttributes[name] || attribute.name,
          attribute.value,
        );
      }
      for (const child of node.childNodes) {
        if (child.nodeType === 1) {
          const safe = clone(child);
          if (safe) clean.appendChild(safe);
        } else if (
          child.nodeType === 3 &&
          ["title", "desc"].includes(tag) &&
          child.textContent.trim()
        )
          clean.appendChild(document.createTextNode(child.textContent.trim()));
      }
      return clean;
    };
    const svg = clone(parsed.documentElement);
    return svg ? new XMLSerializer().serializeToString(svg) : "";
  }
  function organisationIconElement(value, className = "organisation-tab-icon") {
    const icon = document.createElement("span");
    icon.className = className;
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML =
      sanitizedOrganisationSvg(value) || menuIconSvg.organisation;
    return icon;
  }
  const menuIconSvg = {
    dashboard:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10.5V20h14v-9.5"/><path d="M9.5 20v-6h5v6"/></svg>',
    legalEntity:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-5 9 5"/><path d="M5 10h14M4 20h16M7 10v8m5-8v8m5-8v8"/></svg>',
    role: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 20v-2a5.5 5.5 0 0 1 11 0v2M14 14.5a4.5 4.5 0 0 1 6.5 4V20"/></svg>',
    module:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>',
    glAccount:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h12a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2Z"/><path d="M8 3v18M11 8h5m-5 4h5m-5 4h3"/></svg>',
    subledger:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v17H6.5A2.5 2.5 0 0 0 4 22Z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v17h4.5A2.5 2.5 0 0 1 20 22Z"/><path d="M7 7h2m-2 4h2m6-4h2m-2 4h2"/></svg>',
    accountingObject:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4.5 7.8 7.5 4.3 7.5-4.3M12 12.1V21"/></svg>',
    accountingDimension:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3v18M12 3v18M17 3v18M3 7h18M3 12h18M3 17h18"/></svg>',
    transaction:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14l-3-3m3 3-3 3M19 17H5l3 3m-3-3 3-3"/></svg>',
    report:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h10l4 4v14H5Z"/><path d="M15 3v5h4M8 17v-3m4 3v-6m4 6v-4"/></svg>',
    organisation:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V7l8-4 8 4v14"/><path d="M8 10h2m4 0h2m-8 4h2m4 0h2M9 21v-3h6v3"/></svg>',
    division:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="4" rx="1"/><rect x="3" y="17" width="6" height="4" rx="1"/><rect x="15" y="17" width="6" height="4" rx="1"/><path d="M12 7v5M6 17v-5h12v5"/></svg>',
    calendar:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/></svg>',
    globe:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>',
    currency:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5c-.8-.7-1.9-1-3.2-1-1.8 0-3.3.8-3.3 2.3 0 3.7 6.5 1.4 6.5 5 0 1.5-1.5 2.7-3.5 2.7-1.4 0-2.7-.5-3.6-1.3M12 5v14"/></svg>',
    tax: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 18 12-12"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></svg>',
    security:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6Z"/><path d="m9 12 2 2 4-4"/></svg>',
    workflow:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="5" r="2"/><circle cx="18" cy="12" r="2"/><circle cx="6" cy="19" r="2"/><path d="M8 5h3a3 3 0 0 1 3 3v1a3 3 0 0 0 3 3M8 19h3a3 3 0 0 0 3-3v-1a3 3 0 0 1 3-3"/></svg>',
    recovery:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7v5h5"/><path d="M5.5 16a8 8 0 1 0 .5-9l-2 5"/></svg>',
    reset:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7v5h5"/><path d="M5.5 16a8 8 0 1 0 .5-9l-2 5"/><path d="M12 8v5m0 3h.01"/></svg>',
  };
  function fixedMenuIconMarkup(name, className = "fixed-menu-icon") {
    return `<span class="${className}" aria-hidden="true">${menuIconSvg[name] || menuIconSvg.module}</span>`;
  }
  function moduleIconMarkup(value) {
    const svg = sanitizedModuleSvg(value);
    return `<span class="module-menu-icon" aria-hidden="true">${svg || menuIconSvg.module}</span>`;
  }
  function resourceIconMarkup(kind) {
    const icons = {
      subledger: ["subledger", "Sub-ledger"],
      accountingObject: ["accountingObject", "Accounting object"],
      accountingDimension: ["accountingDimension", "Accounting dimension"],
      transaction: ["transaction", "Transaction"],
    };
    const [icon, label] = icons[kind] || icons.transaction;
    return `<span class="resource-type-icon" role="img" aria-label="${label}" title="${label}">${menuIconSvg[icon]}</span>`;
  }
  function renderModuleIconPreview() {
    const preview = $("module-icon-preview");
    if (!preview) return;
    const svg = sanitizedModuleSvg($("module-icon-svg")?.value);
    preview.innerHTML = svg || "<span>No valid SVG preview</span>";
  }
  function installModuleIconEditor() {
    if ($("module-icon-svg")) return;
    const description = $("module-description")?.closest("label");
    if (!description) return;
    const label = document.createElement("label");
    label.textContent = "SVG icon";
    const textarea = document.createElement("textarea");
    textarea.id = "module-icon-svg";
    textarea.rows = 5;
    textarea.placeholder = '<svg viewBox="0 0 24 24">...</svg>';
    textarea.addEventListener("input", renderModuleIconPreview);
    label.append(textarea);
    const preview = document.createElement("div");
    preview.id = "module-icon-preview";
    preview.className = "module-icon-preview";
    description.insertAdjacentElement("afterend", label);
    label.insertAdjacentElement("afterend", preview);
  }

  function panelTransparencyValue(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(100, Math.round(number)));
  }

  function setPanelGlass(enabled, transparency = enabled ? 60 : 0) {
    const amount = enabled ? panelTransparencyValue(transparency) : 0;
    document.body.classList.toggle("panels-glass", amount > 0);
    document.body.style.setProperty(
      "--panel-glass-alpha",
      String(1 - amount / 100),
    );
  }

  const themeStorageKey = "erp.theme";
  function applyTheme(theme) {
    const dark = theme === "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    const toggle = $("theme-toggle");
    if (toggle) {
      toggle.innerHTML = `<span aria-hidden="true">${dark ? "☀" : "☾"}</span>`;
      toggle.setAttribute(
        "aria-label",
        dark ? "Switch to light mode" : "Switch to dark mode",
      );
      toggle.setAttribute("aria-pressed", dark ? "true" : "false");
      toggle.title = dark ? "Switch to light mode" : "Switch to dark mode";
    }
  }
  function initTheme() {
    let theme = "light";
    try {
      theme =
        window.localStorage.getItem(themeStorageKey) === "dark"
          ? "dark"
          : "light";
    } catch {}
    applyTheme(theme);
    $("theme-toggle")?.addEventListener("click", () => {
      const next =
        document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      applyTheme(next);
      try {
        window.localStorage.setItem(themeStorageKey, next);
      } catch {}
    });
  }
  initTheme();

  const panelGlassParams = new URLSearchParams(location.search);
  setPanelGlass(
    panelGlassParams.get("panel_glass") === "1",
    panelGlassParams.get("panel_transparency") || 60,
  );
  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin) return;
    if (event.data && event.data.type === "core-saas-panel-glass") {
      setPanelGlass(event.data.enabled, event.data.transparency);
    }
  });

  function initSidebarResize() {
    const shell = document.querySelector(".erp-shell");
    const handle = $("sidebar-resizer");
    if (!shell || !handle) return;
    const storageKey = "erp.sidebarWidth";
    const desktopQuery = window.matchMedia("(min-width:981px)");
    const clampWidth = (value) => {
      const max = Math.min(460, Math.max(220, window.innerWidth - 420));
      return Math.max(190, Math.min(max, Math.round(value)));
    };
    const applyWidth = (value) => {
      if (!desktopQuery.matches) return;
      document.documentElement.style.setProperty(
        "--sidebar-width",
        `${clampWidth(value)}px`,
      );
    };
    try {
      const saved = Number(window.localStorage.getItem(storageKey));
      if (Number.isFinite(saved)) applyWidth(saved);
    } catch {}
    const resetWidth = () => {
      document.documentElement.style.removeProperty("--sidebar-width");
      try {
        window.localStorage.removeItem(storageKey);
      } catch {}
    };
    handle.addEventListener("pointerdown", (event) => {
      if (!desktopQuery.matches) return;
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      document.body.classList.add("sidebar-resizing");
      const onPointerMove = (moveEvent) => applyWidth(moveEvent.clientX);
      const onPointerUp = (upEvent) => {
        if (handle.hasPointerCapture?.(upEvent.pointerId))
          handle.releasePointerCapture(upEvent.pointerId);
        document.body.classList.remove("sidebar-resizing");
        try {
          const width = getComputedStyle(document.documentElement)
            .getPropertyValue("--sidebar-width")
            .trim();
          window.localStorage.setItem(
            storageKey,
            String(parseInt(width, 10) || 250),
          );
        } catch {}
        handle.removeEventListener("pointermove", onPointerMove);
        handle.removeEventListener("pointerup", onPointerUp);
        handle.removeEventListener("pointercancel", onPointerUp);
      };
      handle.addEventListener("pointermove", onPointerMove);
      handle.addEventListener("pointerup", onPointerUp);
      handle.addEventListener("pointercancel", onPointerUp);
    });
    handle.addEventListener("dblclick", resetWidth);
    handle.addEventListener("keydown", (event) => {
      if (!desktopQuery.matches) return;
      if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Home") {
        resetWidth();
        return;
      }
      const current =
        parseInt(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--sidebar-width",
          ),
          10,
        ) || 250;
      const next = current + (event.key === "ArrowRight" ? 16 : -16);
      applyWidth(next);
      try {
        window.localStorage.setItem(storageKey, String(clampWidth(next)));
      } catch {}
    });
    desktopQuery.addEventListener("change", (event) => {
      if (!event.matches)
        document.documentElement.style.removeProperty("--sidebar-width");
      else {
        try {
          const saved = Number(window.localStorage.getItem(storageKey));
          if (Number.isFinite(saved)) applyWidth(saved);
        } catch {}
      }
    });
  }

  function initSidebarCollapse() {
    const shell = document.querySelector(".erp-shell");
    const toggle = $("sidebar-collapse-toggle");
    if (!shell || !toggle) return;
    const storageKey = "erp.sidebarCollapsed";
    const desktopQuery = window.matchMedia("(min-width:981px)");
    let collapsed = false;
    try {
      collapsed = window.localStorage.getItem(storageKey) === "1";
    } catch {}
    const apply = () => {
      const active = desktopQuery.matches && collapsed;
      shell.classList.toggle("sidebar-collapsed", active);
      toggle.setAttribute("aria-expanded", active ? "false" : "true");
      toggle.setAttribute(
        "aria-label",
        active ? "Expand menu" : "Collapse menu",
      );
      toggle.title = active ? "Expand menu" : "Collapse menu";
    };
    toggle.addEventListener("click", () => {
      collapsed = !collapsed;
      try {
        window.localStorage.setItem(storageKey, collapsed ? "1" : "0");
      } catch {}
      apply();
    });
    shell.querySelector(".sidebar")?.addEventListener(
      "click",
      (event) => {
        if (
          !shell.classList.contains("sidebar-collapsed") ||
          !event.target.closest(".menu-entry--group-toggle")
        )
          return;
        collapsed = false;
        try {
          window.localStorage.setItem(storageKey, "0");
        } catch {}
        apply();
      },
      true,
    );
    desktopQuery.addEventListener("change", apply);
    apply();
  }

  function orgStorageKey() {
    return boot.tenant_id
      ? `erp.currentOrg.${boot.tenant_id}`
      : "erp.currentOrg";
  }
  function getStoredOrgId() {
    try {
      return window.localStorage.getItem(orgStorageKey()) || "";
    } catch {
      return "";
    }
  }
  function storeCurrentOrg(orgId = state.orgId) {
    if (!orgId) return;
    try {
      window.localStorage.setItem(orgStorageKey(), orgId);
    } catch {}
  }
  function resolveCurrentOrgId() {
    const exists = (id) =>
      boot.organisations.some((org) => org.organisation_id === id);
    if (exists(state.orgId)) return state.orgId;
    const params = new URLSearchParams(location.search);
    const fromUrl = params.get("organisation_id");
    if (exists(fromUrl)) return fromUrl;
    const preferred = boot.user_context?.organisation_id;
    if (exists(preferred)) return preferred;
    const stored = getStoredOrgId();
    if (exists(stored)) return stored;
    return boot.organisations[0]?.organisation_id || null;
  }
  function organisationContext(orgId = state.orgId) {
    return (
      boot.user_context?.organisations?.find(
        (context) => context.organisation_id === orgId,
      ) || null
    );
  }
  function currentView() {
    return (
      document
        .querySelector(".view:not([hidden])")
        ?.id?.replace(/^view-/, "") || "dashboard"
    );
  }
  function syncContextUrl({ push = false } = {}) {
    const url = new URL(location.href);
    if (state.orgId) url.searchParams.set("organisation_id", state.orgId);
    else url.searchParams.delete("organisation_id");
    if (state.divisionId) url.searchParams.set("division_id", state.divisionId);
    else url.searchParams.delete("division_id");
    url.searchParams.set("include_children", state.includeChildren ? "1" : "0");
    url.searchParams.set("view", currentView());
    history[push ? "pushState" : "replaceState"](
      { organisation_id: state.orgId, division_id: state.divisionId },
      "",
      url,
    );
  }
  function resolveDivisionContext() {
    const exists = (id) =>
      state.divisions.some((division) => division.division_id === id);
    const params = new URLSearchParams(location.search);
    const urlOrg = params.get("organisation_id");
    const urlDivision = params.get("division_id");
    const saved = organisationContext();
    state.divisionId =
      urlOrg === state.orgId && exists(urlDivision)
        ? urlDivision
        : exists(saved?.division_id)
          ? saved.division_id
          : state.divisions[0]?.division_id || null;
    state.includeChildren =
      urlOrg === state.orgId && params.has("include_children")
        ? params.get("include_children") === "1"
        : saved?.include_children === true;
  }
  function updateClientContextPreference() {
    boot.user_context = boot.user_context || {
      organisation_id: null,
      organisations: [],
    };
    boot.user_context.organisation_id = state.orgId;
    const contexts =
      boot.user_context.organisations || (boot.user_context.organisations = []);
    let context = contexts.find((item) => item.organisation_id === state.orgId);
    if (!context) {
      context = { organisation_id: state.orgId };
      contexts.push(context);
    }
    context.division_id = state.divisionId;
    context.include_children = state.includeChildren;
  }
  async function saveWorkspaceContext() {
    if (!state.orgId) return;
    updateClientContextPreference();
    await api("context/save", {
      method: "POST",
      body: JSON.stringify({
        organisation_id: state.orgId,
        division_id: state.divisionId,
        include_children: state.includeChildren,
      }),
    });
  }
  function dateOnly(value) {
    return String(value || "").slice(0, 10);
  }
  function timeOnly(value) {
    if (!value) return "";
    const date = new Date(value);
    if (!Number.isNaN(date.getTime()))
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    const match = String(value).match(/T(\d{2}:\d{2})/);
    return match ? match[1] : "";
  }
  function journalDateTime(row) {
    const time = timeOnly(row.created_at);
    return time
      ? `${dateOnly(row.journal_date)} ${time}`
      : dateOnly(row.journal_date);
  }
  function searchTerm(id) {
    return String($(id)?.value || "")
      .trim()
      .toLowerCase();
  }
  function rowMatches(row, term) {
    if (!term) return true;
    return Object.values(row || {}).some((value) => {
      if (value === null || value === undefined || typeof value === "object")
        return false;
      return String(value).toLowerCase().includes(term);
    });
  }
  async function api(path, options = {}) {
    let requestPath = path;
    const method = String(options.method || "GET").toUpperCase();
    if (method === "GET" && state.orgId && path !== "setup/bootstrap") {
      const [pathname, query = ""] = path.split("?");
      const params = new URLSearchParams(query);
      if (state.divisionId && !params.has("active_division_id"))
        params.set("active_division_id", state.divisionId);
      if (!params.has("include_child_divisions"))
        params.set(
          "include_child_divisions",
          state.includeChildren ? "1" : "0",
        );
      requestPath = `${pathname}?${params.toString()}`;
    }
    const r = await fetch("/erp/api/" + requestPath, {
      headers: { "content-type": "application/json" },
      ...options,
    });
    const j = await r.json();
    if (!r.ok)
      throw Object.assign(new Error(j.error || "Request failed"), {
        details: j,
      });
    return j;
  }
  function alert(message) {
    $("alert").hidden = !message;
    $("alert-message").textContent = message || "";
  }
  function option(select, items, valueKey, labelKey, blank = "") {
    if (!select) return;
    select.innerHTML = blank ? `<option value="">${blank}</option>` : "";
    items.forEach((item) => {
      const o = document.createElement("option");
      o.value = item[valueKey];
      o.textContent =
        typeof labelKey === "function" ? labelKey(item) : item[labelKey];
      select.append(o);
    });
  }
  const moduleChecklistIds = new Set([
    "ledger-family-modules",
    "accounting-object-type-modules",
    "accounting-dimension-type-modules",
    "transaction-type-modules",
    "role-modules",
  ]);
  function selectedModuleIds(id) {
    const target = $(id);
    if (!target) return [];
    if (target.classList?.contains("module-checklist"))
      return [...target.querySelectorAll('input[type="checkbox"]:checked')].map(
        (input) => input.value,
      );
    return [...target.selectedOptions].map((option) => option.value);
  }
  function fillModuleSelect(id, selected = []) {
    const select = $(id);
    if (!select) return;
    const wanted = new Set(selected || []);
    const modules = state.modules.filter(
      (module) => module.is_active !== false,
    );
    if (select.classList?.contains("module-checklist")) {
      select.innerHTML = "";
      modules.forEach((module) => {
        const label = document.createElement("label");
        label.className = "check module-check";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = module.module_id;
        input.checked = wanted.has(module.module_id);
        label.append(input, module.module_name);
        select.append(label);
      });
      return;
    }
    option(select, modules, "module_id", (module) => module.module_name);
    [...select.options].forEach((item) => {
      item.selected = wanted.has(item.value);
    });
  }
  function ensureRoleModuleTabSection() {
    const form = $("role-form");
    const tabs = form?.querySelector(".tabs");
    if (!form || !tabs) return null;
    if (!tabs.querySelector('[data-role-tab="modules"]')) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "tab";
      tab.dataset.roleTab = "modules";
      tab.textContent = "Modules";
      tabs.insertBefore(tab, tabs.querySelector('[data-role-tab="master"]'));
      tab.addEventListener("click", () => showRoleTab("modules"));
    }
    if (!$("role-tab-modules")) {
      const section = document.createElement("div");
      section.className = "permission-section";
      section.id = "role-tab-modules";
      section.hidden = true;
      section.innerHTML =
        '<div class="panel-head"><h2>Modules</h2></div><div id="role-module-picker"></div>';
      $("role-tab-users").insertAdjacentElement("afterend", section);
    }
    return $("role-module-picker");
  }
  function installModuleField(formId, selectId) {
    const form = $(formId);
    if (!form || $(selectId)) return;
    const isChecklist = moduleChecklistIds.has(selectId);
    const wrapper = isChecklist
      ? document.createElement("div")
      : document.createElement("label");
    if (isChecklist) wrapper.className = "module-scope-field";
    const caption = document.createElement(isChecklist ? "span" : "span");
    caption.textContent =
      selectId === "role-modules"
        ? "Available modules"
        : selectId === "transaction-type-modules"
          ? "Applicable modules"
          : "Modules";
    wrapper.append(caption);
    const control = isChecklist
      ? document.createElement("div")
      : document.createElement("select");
    control.id = selectId;
    if (isChecklist) control.className = "module-checklist";
    else {
      control.multiple = true;
      control.required = true;
      control.size = 5;
    }
    wrapper.append(control);
    if (selectId === "role-modules") {
      ensureRoleModuleTabSection()?.append(wrapper);
      return;
    }
    const active = [...form.querySelectorAll("label")].find((item) =>
      item.textContent.includes("Active"),
    );
    form.insertBefore(wrapper, active || form.querySelector(".actions"));
  }
  function fillWorkflowPathSelect(id, selected = "") {
    const select = $(id);
    if (!select) return;
    option(
      select,
      state.workflowPaths.filter((path) => path.is_active !== false),
      "workflow_path_id",
      (path) => path.path_name,
      "Select workflow path",
    );
    select.value =
      selected ||
      select.value ||
      state.workflowPaths[0]?.workflow_path_id ||
      "";
  }
  function installWorkflowPathField(formId, selectId) {
    const form = $(formId);
    if (!form || $(selectId)) return;
    const label = document.createElement("label");
    label.textContent = "Workflow path";
    const select = document.createElement("select");
    select.id = selectId;
    select.required = true;
    label.append(select);
    const schema = [...form.querySelectorAll("label")].find((item) =>
      item.textContent.includes("JSON schema"),
    );
    form.insertBefore(label, schema || form.querySelector(".actions"));
  }
  function installOrgCopyWorkflowOption() {
    const accountingTypes = $("copy-accounting-types");
    if (!accountingTypes || $("copy-workflow-paths")) return;
    const label = document.createElement("label");
    label.className = "check";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = "copy-workflow-paths";
    input.checked = true;
    label.append(input, " Workflow paths");
    accountingTypes
      .closest("label")
      ?.insertAdjacentElement("beforebegin", label);
  }
  function installWorkflowUi() {
    installOrgCopyWorkflowOption();
    document
      .querySelectorAll("[data-master-action]")
      .forEach((button) => button.remove());
    installWorkflowPathField(
      "ledger-family-form",
      "ledger-family-workflow-path",
    );
    installWorkflowPathField(
      "accounting-object-type-form",
      "accounting-object-type-workflow-path",
    );
    installWorkflowPathField(
      "accounting-dimension-type-form",
      "accounting-dimension-type-workflow-path",
    );
    if (!$("view-workflows")) {
      const section = document.createElement("section");
      section.id = "view-workflows";
      section.className = "view";
      section.hidden = true;
      section.innerHTML =
        '<div class="split workflow-setup"><div class="panel"><div class="panel-head"><h2>Workflow Paths</h2><button type="button" id="add-workflow" class="add-record-button" aria-label="Add workflow path" title="Add workflow path">+</button></div><input id="workflow-search" class="grid-search" placeholder="Search workflow paths"><div id="workflow-list"></div></div><form id="workflow-form" class="panel form workflow-editor" hidden><div class="panel-head workflow-editor-head"><div><h2>Workflow Path</h2><span id="workflow-path-meta" class="muted"></span></div><label class="check workflow-active-check"><input type="checkbox" id="workflow-path-active" checked> Active</label></div><input type="hidden" id="workflow-path-id"><div class="form-row compact-row"><label>Name<input id="workflow-path-name" required></label><label>Initial step<select id="workflow-initial-step" required></select></label></div><section class="setup-section full workflow-config-section"><div class="panel-head"><h2>Steps</h2><button type="button" id="add-workflow-step" class="add-record-button" aria-label="Add workflow step" title="Add workflow step">+</button></div><div id="workflow-step-lines"></div></section><section class="setup-section full workflow-config-section"><div class="panel-head"><h2>Allowed Next Steps</h2><button type="button" id="add-workflow-next" class="add-record-button" aria-label="Add next step" title="Add next step">+</button></div><div id="workflow-next-lines"></div></section><div class="actions"><button type="submit">Save Workflow</button><button type="button" id="new-workflow" class="secondary">New</button></div></form></div>';
      $("view-setup").insertAdjacentElement("beforebegin", section);
      $("add-workflow").addEventListener("click", newWorkflowPath);
      $("new-workflow").addEventListener("click", newWorkflowPath);
      $("workflow-search").addEventListener("input", renderWorkflows);
      $("add-workflow-step").addEventListener("click", () => {
        addWorkflowStepLine({
          sort_order:
            (document.querySelectorAll(
              ".workflow-step-line:not(.workflow-step-line-head)",
            ).length +
              1) *
            10,
        });
        syncWorkflowInitialOptions($("workflow-initial-step").value);
      });
      $("add-workflow-next").addEventListener("click", () =>
        addWorkflowNextLine(),
      );
      $("workflow-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        await api("setup/workflows", {
          method: "POST",
          body: JSON.stringify({
            organisation_id: state.orgId,
            workflow_path_id: $("workflow-path-id").value,
            path_name: $("workflow-path-name").value,
            initial_step_code: $("workflow-initial-step").value,
            is_active: $("workflow-path-active").checked,
            steps: collectWorkflowSteps(),
            next: collectWorkflowNext(),
          }),
        });
        $("workflow-form").hidden = true;
        await loadMenuData(true);
        renderWorkflows();
        fillWorkflowPathSelect("ledger-family-workflow-path");
        fillWorkflowPathSelect("master-workflow-path");
        fillWorkflowPathSelect("accounting-object-type-workflow-path");
        fillWorkflowPathSelect("accounting-dimension-type-workflow-path");
      });
    }
    if (!$("accounting-object-workflow-progress")) {
      const form = $("accounting-object-form");
      form
        ?.querySelector("h2")
        ?.insertAdjacentHTML(
          "afterend",
          '<div id="accounting-object-workflow-header" class="workflow-header"></div>',
        );
      form
        ?.querySelector(".actions")
        ?.insertAdjacentHTML(
          "beforebegin",
          '<section id="accounting-object-workflow-progress" class="workflow-panel full"></section><section id="accounting-object-workflow-history" class="workflow-panel full"></section>',
        );
    }
  }
  function ensureTextareaField(formId, inputId, labelText, afterId) {
    if ($(inputId)) return;
    const after = $(afterId)?.closest("label");
    const label = document.createElement("label");
    label.textContent = labelText;
    const textarea = document.createElement("textarea");
    textarea.id = inputId;
    textarea.className = "setup-description-field";
    textarea.rows = 4;
    label.append(textarea);
    after?.insertAdjacentElement("afterend", label);
  }
  function installLedgerFamilyUiSchemaField() {
    if ($("ledger-family-ui-schema")) return;
    const schema = $("ledger-family-schema")?.closest("label");
    const label = document.createElement("label");
    label.textContent = "UI schema";
    const textarea = document.createElement("textarea");
    textarea.id = "ledger-family-ui-schema";
    textarea.placeholder = '{"sections":[]}';
    label.append(textarea);
    schema?.insertAdjacentElement("afterend", label);
  }
  function moveControlToPanel(panel, id) {
    const control = $(id);
    const wrapper =
      control?.closest("label") ||
      control?.closest(".module-scope-field") ||
      control;
    if (wrapper) panel.append(wrapper);
  }
  function showSetupTypeTab(prefix, tab) {
    document
      .querySelectorAll(`[data-setup-type-tab="${prefix}"]`)
      .forEach((button) =>
        button.classList.toggle("active", button.dataset.tab === tab),
      );
    document
      .querySelectorAll(`[data-setup-type-panel="${prefix}"]`)
      .forEach((panel) => {
        panel.hidden = panel.dataset.panel !== tab;
      });
  }
  function installSetupTypeTabs({ formId, prefix, tabs: tabDefinitions }) {
    const form = $(formId);
    if (!form || form.querySelector(`[data-setup-type-tabs="${prefix}"]`))
      return;
    const tabs = document.createElement("div");
    tabs.className = "tabs setup-type-tabs";
    tabs.dataset.setupTypeTabs = prefix;
    tabs.setAttribute("role", "tablist");
    tabs.innerHTML = tabDefinitions
      .map(
        (tab, index) =>
          `<button type="button" class="tab${index === 0 ? " active" : ""}" data-tab="${tab.name}">${tab.label}</button>`,
      )
      .join("");
    tabs
      .querySelectorAll("button")
      .forEach((button) => (button.dataset.setupTypeTab = prefix));
    const panels = {};
    tabDefinitions.forEach((tab, index) => {
      const panel = document.createElement("div");
      panel.className = "setup-type-panel";
      panel.dataset.setupTypePanel = prefix;
      panel.dataset.panel = tab.name;
      panel.hidden = index !== 0;
      panels[tab.name] = panel;
      tab.controlIds.forEach((id) => moveControlToPanel(panel, id));
    });
    tabs
      .querySelectorAll("button")
      .forEach((button) =>
        button.addEventListener("click", () =>
          showSetupTypeTab(prefix, button.dataset.tab),
        ),
      );
    const heading = form.querySelector("h2");
    heading?.insertAdjacentElement("afterend", tabs);
    tabDefinitions.forEach((tab) =>
      form.insertBefore(panels[tab.name], form.querySelector(".actions")),
    );
  }
  function installSetupTypeEditors() {
    ensureTextareaField(
      "ledger-family-form",
      "ledger-family-description",
      "Description",
      "ledger-family-name",
    );
    installLedgerFamilyUiSchemaField();
    ensureTextareaField(
      "accounting-object-type-form",
      "accounting-object-type-description",
      "Description",
      "accounting-object-type-name",
    );
    ensureTextareaField(
      "accounting-dimension-type-form",
      "accounting-dimension-type-description",
      "Description",
      "accounting-dimension-type-name",
    );
    installSetupTypeTabs({
      formId: "ledger-family-form",
      prefix: "ledger-family",
      tabs: [
        {
          name: "definition",
          label: "Definition",
          controlIds: [
            "ledger-family-code",
            "ledger-family-name",
            "ledger-family-description",
            "ledger-family-workflow-path",
            "ledger-family-legal-entity",
            "ledger-family-active",
          ],
        },
        {
          name: "scope",
          label: "Scope",
          controlIds: ["ledger-family-modules"],
        },
        {
          name: "design",
          label: "Design",
          controlIds: ["ledger-family-schema", "ledger-family-ui-schema"],
        },
      ],
    });
    installSetupTypeTabs({
      formId: "accounting-object-type-form",
      prefix: "accounting-object-type",
      tabs: [
        {
          name: "definition",
          label: "Definition",
          controlIds: [
            "accounting-object-type-code",
            "accounting-object-type-name",
            "accounting-object-type-description",
            "accounting-object-type-workflow-path",
            "accounting-object-type-active",
          ],
        },
        {
          name: "scope",
          label: "Scope",
          controlIds: ["accounting-object-type-modules"],
        },
        {
          name: "design",
          label: "Design",
          controlIds: [
            "accounting-object-type-schema",
            "accounting-object-type-ui-schema",
          ],
        },
      ],
    });
    installSetupTypeTabs({
      formId: "accounting-dimension-type-form",
      prefix: "accounting-dimension-type",
      tabs: [
        {
          name: "definition",
          label: "Definition",
          controlIds: [
            "accounting-dimension-type-code",
            "accounting-dimension-type-name",
            "accounting-dimension-type-description",
            "accounting-dimension-type-workflow-path",
            "accounting-dimension-type-active",
          ],
        },
        {
          name: "scope",
          label: "Scope",
          controlIds: ["accounting-dimension-type-modules"],
        },
        {
          name: "design",
          label: "Design",
          controlIds: [
            "accounting-dimension-type-schema",
            "accounting-dimension-type-ui-schema",
          ],
        },
      ],
    });
    installSetupTypeTabs({
      formId: "transaction-type-form",
      prefix: "transaction-type",
      tabs: [
        {
          name: "definition",
          label: "Definition",
          controlIds: [
            "transaction-type-group",
            "transaction-type-code",
            "transaction-type-name",
            "transaction-type-description",
            "transaction-type-sort",
            "transaction-type-financial",
            "transaction-type-additional-lines",
            "transaction-type-active",
          ],
        },
        {
          name: "scope",
          label: "Scope",
          controlIds: ["transaction-type-modules"],
        },
        {
          name: "lines",
          label: "Line Definitions",
          controlIds: ["transaction-line-editor"],
        },
      ],
    });
  }
  function setTransactionTypeEditorOpen(open) {
    const view = $("view-transactiontypes");
    const form = $("transaction-type-form");
    if (!view || !form) return;
    view.classList.toggle("transaction-type-editor-open", open);
    form.hidden = !open;
  }
  function updateTransactionTypeEditorTitle(name = "") {
    const subtitle = $("transaction-type-editor-subtitle");
    if (subtitle) subtitle.textContent = name || "New transaction type";
  }
  function installTransactionTypeEditorUi() {
    const form = $("transaction-type-form");
    if (!form || form.querySelector(".transaction-type-editor-header")) return;
    const heading = form.querySelector(":scope > h2");
    const header = document.createElement("header");
    header.className = "transaction-type-editor-header";
    header.innerHTML =
      '<div><button type="button" id="transaction-type-back" class="transaction-type-back" aria-label="Back to transaction types">&larr; Transaction Types</button><h2>Manage Transaction Type</h2><p id="transaction-type-editor-subtitle">New transaction type</p></div><div class="transaction-type-editor-actions"></div>';
    heading.replaceWith(header);
    const actions = header.querySelector(".transaction-type-editor-actions");
    const newButton = $("new-transaction-type");
    const saveButton = form.querySelector(
      ':scope > .actions button[type="submit"]',
    );
    if (newButton) {
      newButton.textContent = "New";
      actions.append(newButton);
    }
    if (saveButton) {
      saveButton.textContent = "Save Transaction Type";
      actions.append(saveButton);
    }
    form.querySelector(":scope > .actions")?.remove();
    $("transaction-type-back").addEventListener("click", () =>
      setTransactionTypeEditorOpen(false),
    );
    const editor = $("transaction-line-editor");
    const editorHeading = editor?.querySelector(".panel-head");
    if (editorHeading) {
      const intro = document.createElement("p");
      intro.className = "transaction-line-intro";
      intro.textContent =
        "Define the posting lines, then specify the sub-ledger and analysis requirements for each line.";
      editorHeading.insertAdjacentElement("afterend", intro);
    }
    const addLine = $("add-transaction-line");
    if (addLine) {
      addLine.classList.remove("add-record-button");
      addLine.classList.add("secondary", "add-transaction-line-button");
      addLine.textContent = "+ Add Line Definition";
    }
    $("transaction-type-name")?.addEventListener("input", (event) =>
      updateTransactionTypeEditorTitle(event.target.value.trim()),
    );
  }
  function moduleNames(row) {
    const ids = new Set(row.module_ids || []);
    return state.modules
      .filter((module) => ids.has(module.module_id))
      .map((module) => module.module_name)
      .join(", ");
  }
  function prependOption(select, value, label) {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    select.insertBefore(o, select.firstChild);
  }
  function table(target, columns, rows, onClick) {
    if (!rows.length) {
      target.innerHTML = '<p class="empty">No records yet.</p>';
      return;
    }
    const el = document.createElement("table");
    el.className = "data-grid";
    el.innerHTML = `<thead><tr>${columns.map((c) => `<th>${c[0]}</th>`).join("")}</tr></thead>`;
    const body = document.createElement("tbody");
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.tabIndex = 0;
      tr.className = "click-row";
      columns.forEach(([, fn]) => {
        const td = document.createElement("td");
        const value = fn(row);
        if (value instanceof Node) td.append(value);
        else td.textContent = value ?? "";
        tr.append(td);
      });
      if (onClick) tr.addEventListener("click", () => onClick(row));
      body.append(tr);
    });
    el.append(body);
    target.innerHTML = "";
    target.classList.add("grid-wrap");
    target.append(el);
  }
  function workflowStepsForPath(pathId) {
    return state.workflowSteps
      .filter((step) => step.workflow_path_id === pathId)
      .sort(
        (a, b) =>
          (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) ||
          String(a.step_label).localeCompare(String(b.step_label)),
      );
  }
  function workflowPathForType(type) {
    return (
      state.workflowPaths.find(
        (path) => path.workflow_path_id === type?.workflow_path_id,
      ) || null
    );
  }
  function workflowStepFor(type, row) {
    const path = workflowPathForType(type);
    return (
      state.workflowSteps.find(
        (step) =>
          step.workflow_path_id === path?.workflow_path_id &&
          step.step_code === row?.workflow_status,
      ) || null
    );
  }
  function workflowStepLabel(row) {
    return row.workflow_step_label || pretty(row.workflow_status);
  }
  function workflowDot(colour) {
    const dot = document.createElement("span");
    dot.className = "workflow-dot";
    dot.style.background = colour || "#667085";
    return dot;
  }
  function workflowStatusButton({ row, kind, onMove }) {
    const wrap = document.createElement("span");
    wrap.className = "workflow-status-wrap";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "workflow-status-button";
    button.style.setProperty(
      "--workflow-colour",
      row.workflow_step_colour || "#667085",
    );
    button.append(workflowDot(row.workflow_step_colour));
    const label = document.createElement("span");
    label.textContent = workflowStepLabel(row);
    button.append(label);
    const arrow = document.createElement("span");
    arrow.className = "workflow-status-arrow";
    arrow.textContent = "v";
    button.append(arrow);
    wrap.append(button);
    const menu = document.createElement("div");
    menu.className = "workflow-status-menu";
    menu.hidden = true;
    const steps = Array.isArray(row.available_workflow_steps)
      ? row.available_workflow_steps
      : [];
    if (!steps.length) {
      const empty = document.createElement("div");
      empty.className = "workflow-menu-empty";
      empty.textContent = "No available next steps";
      menu.append(empty);
    } else {
      steps.forEach((step) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "workflow-menu-item";
        item.append(workflowDot(step.colour));
        const text = document.createElement("span");
        text.textContent = step.step_label || pretty(step.step_code);
        item.append(text);
        item.addEventListener("click", (event) => {
          event.stopPropagation();
          menu.hidden = true;
          if (onMove) onMove(step.step_code);
        });
        menu.append(item);
      });
    }
    wrap.append(menu);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      document.querySelectorAll(".workflow-status-menu").forEach((other) => {
        if (other !== menu) other.hidden = true;
      });
      menu.hidden = !menu.hidden;
    });
    wrap.addEventListener("click", (event) => event.stopPropagation());
    return wrap;
  }
  document.addEventListener("click", () =>
    document.querySelectorAll(".workflow-status-menu").forEach((menu) => {
      menu.hidden = true;
    }),
  );
  async function moveAccountingObjectWorkflow(record, nextStepCode) {
    await api("accounting-objects/workflow", {
      method: "POST",
      body: JSON.stringify({
        accounting_object_id: record.accounting_object_id,
        next_step_code: nextStepCode,
      }),
    });
    await loadAccountingMasterRecords("object");
  }
  function renderWorkflowProgress(targetId, type, row) {
    const target = $(targetId);
    if (!target) return;
    const path = workflowPathForType(type);
    const steps = workflowStepsForPath(path?.workflow_path_id);
    if (!row?.workflow_status || !steps.length) {
      target.innerHTML = "";
      return;
    }
    target.innerHTML = "<h2>Workflow progress</h2>";
    const line = document.createElement("div");
    line.className = "workflow-progress";
    steps.forEach((step) => {
      const item = document.createElement("span");
      item.className = "workflow-progress-step";
      if (step.step_code === row.workflow_status) item.classList.add("current");
      item.append(workflowDot(step.colour));
      const label = document.createElement("span");
      label.textContent = step.step_label;
      item.append(label);
      line.append(item);
    });
    target.append(line);
  }
  function renderWorkflowHistory(targetId, row) {
    const target = $(targetId);
    if (!target) return;
    const history = Array.isArray(row?.workflow_history)
      ? row.workflow_history
      : [];
    target.innerHTML = "<h2>Workflow history</h2>";
    if (!history.length) {
      target.insertAdjacentHTML(
        "beforeend",
        '<p class="empty">No workflow history yet.</p>',
      );
      return;
    }
    const grid = document.createElement("div");
    target.append(grid);
    table(
      grid,
      [
        ["Date", (h) => dateOnly(h.created_at)],
        ["From", (h) => pretty(h.previous_step_code || "")],
        ["To", (h) => pretty(h.new_step_code)],
        ["User", (h) => h.user_email || ""],
        ["Comment", (h) => h.comment || ""],
      ],
      history,
    );
  }
  function renderWorkflowHeader(targetId, row, onMove) {
    const target = $(targetId);
    if (!target) return;
    target.innerHTML = "";
    if (row?.workflow_status)
      target.append(workflowStatusButton({ row, onMove }));
  }
  function currentOrg() {
    return (
      boot.organisations.find((o) => o.organisation_id === state.orgId) ||
      boot.organisations[0]
    );
  }
  function canBootstrapSetup() {
    return boot?.can_bootstrap_setup === true;
  }
  function canInitialiseTemplateOrg() {
    return boot?.can_initialise_template_org === true;
  }
  function currentOrganisationId() {
    return state.orgId || $("organisation-select")?.value || "";
  }
  function hasDirtyForm() {
    return [...document.querySelectorAll("form")].some(
      (form) =>
        !form.hidden && !form.closest("[hidden]") && dirtyForms.has(form),
    );
  }
  function confirmContextChange() {
    return (
      !hasDirtyForm() ||
      window.confirm(
        "Switching organisation or division will discard your unsaved changes. Continue?",
      )
    );
  }
  function closeOrganisationMenu() {
    if (!$("organisation-more-menu")) return;
    $("organisation-more-menu").hidden = true;
    $("organisation-more").setAttribute("aria-expanded", "false");
  }
  function closeDivisionPicker() {
    if (!$("division-picker-menu")) return;
    $("division-picker-menu").hidden = true;
    $("division-picker-button").setAttribute("aria-expanded", "false");
  }
  function organisationLabel(org) {
    return `${org.organisation_code} - ${org.organisation_name}`;
  }
  function renderOrganisationTabs() {
    const tabs = $("organisation-tabs");
    if (!tabs) return;
    tabs.innerHTML = "";
    const visible = boot.organisations.slice(0, visibleOrganisationLimit);
    const overflow = boot.organisations.slice(visibleOrganisationLimit);
    visible.forEach((org) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "organisation-tab";
      button.role = "tab";
      button.dataset.organisationId = org.organisation_id;
      button.setAttribute(
        "aria-selected",
        org.organisation_id === state.orgId ? "true" : "false",
      );
      button.title = organisationLabel(org);
      button.append(organisationIconElement(org.organisation_icon_svg));
      const code = document.createElement("span");
      code.className = "organisation-tab-code";
      code.textContent = org.organisation_code;
      const name = document.createElement("span");
      name.className = "organisation-tab-name";
      name.textContent = `– ${org.organisation_name}`;
      button.append(code, name);
      button.addEventListener("click", () =>
        switchWorkspaceOrganisation(org.organisation_id).catch((error) =>
          alert(error.message),
        ),
      );
      tabs.append(button);
    });
    const moreWrap = $("organisation-more-wrap");
    moreWrap.hidden = !overflow.length;
    const activeOverflow = overflow.find(
      (org) => org.organisation_id === state.orgId,
    );
    $("organisation-more").classList.toggle("active", !!activeOverflow);
    $("organisation-more").replaceChildren();
    if (activeOverflow) {
      $("organisation-more").append(
        organisationIconElement(activeOverflow.organisation_icon_svg),
      );
      const label = document.createElement("span");
      label.textContent = organisationLabel(activeOverflow);
      $("organisation-more").append(label);
    } else
      $("organisation-more").textContent =
        `More organisations (${overflow.length})`;
    renderOrganisationOverflow();
  }
  function renderOrganisationOverflow() {
    const target = $("organisation-more-list");
    if (!target) return;
    const term = String($("organisation-tab-search")?.value || "")
      .trim()
      .toLowerCase();
    const items = boot.organisations
      .slice(visibleOrganisationLimit)
      .filter(
        (org) => !term || organisationLabel(org).toLowerCase().includes(term),
      );
    target.innerHTML = "";
    items.forEach((org) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "organisation-more-option";
      button.role = "option";
      button.classList.toggle("active", org.organisation_id === state.orgId);
      button.setAttribute(
        "aria-selected",
        org.organisation_id === state.orgId ? "true" : "false",
      );
      button.append(
        organisationIconElement(
          org.organisation_icon_svg,
          "organisation-more-icon",
        ),
      );
      const label = document.createElement("span");
      label.className = "organisation-more-label";
      const code = document.createElement("strong");
      code.textContent = org.organisation_code;
      const name = document.createElement("small");
      name.textContent = org.organisation_name;
      label.append(code, name);
      button.append(label);
      button.addEventListener("click", () =>
        switchWorkspaceOrganisation(org.organisation_id).catch((error) =>
          alert(error.message),
        ),
      );
      target.append(button);
    });
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "No matching organisations.";
      target.append(empty);
    }
  }
  function divisionPath(division) {
    if (Array.isArray(division?.path)) return division.path.join(" / ");
    const parents = [];
    let item = division;
    const seen = new Set();
    while (item && !seen.has(item.division_id)) {
      seen.add(item.division_id);
      parents.unshift(item.division_name);
      item = state.divisions.find(
        (candidate) => candidate.division_id === item.parent_division_id,
      );
    }
    return parents.join(" / ");
  }
  function renderDivisionTree() {
    const target = $("division-tree");
    if (!target) return;
    const children = new Map();
    state.divisions.forEach((division) => {
      const key = division.parent_division_id || "";
      if (!children.has(key)) children.set(key, []);
      children.get(key).push(division);
    });
    target.innerHTML = "";
    const append = (division, depth, ancestorCollapsed = false) => {
      const childItems = children.get(division.division_id) || [];
      if (!ancestorCollapsed) {
        const row = document.createElement("div");
        row.className = "division-tree-item";
        row.role = "treeitem";
        row.style.setProperty("--division-depth", depth);
        row.setAttribute("aria-level", String(depth + 1));
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "division-tree-toggle";
        toggle.disabled = !childItems.length;
        toggle.textContent = childItems.length
          ? collapsedDivisionIds.has(division.division_id)
            ? "▸"
            : "▾"
          : "•";
        toggle.setAttribute(
          "aria-label",
          `${collapsedDivisionIds.has(division.division_id) ? "Expand" : "Collapse"} ${division.division_name}`,
        );
        toggle.addEventListener("click", () => {
          if (collapsedDivisionIds.has(division.division_id))
            collapsedDivisionIds.delete(division.division_id);
          else collapsedDivisionIds.add(division.division_id);
          renderDivisionTree();
        });
        const option = document.createElement("button");
        option.type = "button";
        option.className = "division-tree-option";
        option.setAttribute(
          "aria-selected",
          division.division_id === state.divisionId ? "true" : "false",
        );
        const label = document.createElement("strong");
        label.textContent = `${division.division_name} (${division.division_code})`;
        const path = document.createElement("small");
        path.textContent = divisionPath(division);
        option.append(label, path);
        option.addEventListener("click", () =>
          selectWorkspaceDivision(division.division_id).catch((error) =>
            alert(error.message),
          ),
        );
        row.append(toggle, option);
        target.append(row);
      }
      const collapsed =
        ancestorCollapsed || collapsedDivisionIds.has(division.division_id);
      childItems.forEach((child) => append(child, depth + 1, collapsed));
    };
    (children.get("") || []).forEach((root) => append(root, 0));
    if (!target.children.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "No divisions are available.";
      target.append(empty);
    }
  }
  function renderWorkspaceContext() {
    renderOrganisationTabs();
    option(
      $("organisation-select"),
      boot.organisations,
      "organisation_id",
      organisationLabel,
    );
    $("organisation-select").value = state.orgId || "";
    const organisation = currentOrg();
    const division = state.divisions.find(
      (item) => item.division_id === state.divisionId,
    );
    $("division-picker-button").disabled = !state.divisions.length;
    $("division-picker-button").textContent = division
      ? `${division.division_name} (${division.division_code})`
      : "No divisions available";
    $("include-child-divisions").checked = state.includeChildren;
    $("include-child-divisions").disabled = !division;
    const breadcrumb = [
      organisation?.organisation_name,
      division ? divisionPath(division) : "",
    ]
      .filter(Boolean)
      .join(" / ");
    $("scope-summary").textContent =
      `${breadcrumb}${division && state.includeChildren ? " / Including child divisions" : ""}`;
    renderDivisionTree();
  }
  async function switchWorkspaceOrganisation(orgId) {
    if (!orgId || orgId === state.orgId) {
      closeOrganisationMenu();
      return;
    }
    if (!confirmContextChange()) {
      renderWorkspaceContext();
      return;
    }
    state.orgId = orgId;
    state.divisionId = null;
    state.includeChildren = false;
    storeCurrentOrg();
    closeOrganisationMenu();
    closeDivisionPicker();
    selectedAccountScopeCode = "gl";
    selectedTransactionTypeId = "";
    selectedReport = "financial_statement";
    resetScreenState();
    await loadOrgData();
    await saveWorkspaceContext();
    syncContextUrl({ push: true });
    show("dashboard");
    loadDashboardData().catch((error) => alert(error.message));
  }
  async function selectWorkspaceDivision(divisionId) {
    if (!divisionId || divisionId === state.divisionId) {
      closeDivisionPicker();
      return;
    }
    if (!confirmContextChange()) return;
    state.divisionId = divisionId;
    closeDivisionPicker();
    resetScreenState();
    resetOrgLoadedState();
    await loadMenuData(true);
    await ensureDivisions(true);
    renderWorkspaceContext();
    await saveWorkspaceContext();
    syncContextUrl({ push: true });
    show("dashboard");
    loadDashboardData().catch((error) => alert(error.message));
  }
  function setMenuExpanded(toggleId, subnavId, expanded) {
    const toggle = $(toggleId);
    const subnav = $(subnavId);
    if (!toggle || !subnav) return;
    subnav.hidden = !expanded;
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    if (toggle.dataset.menuKind && toggle.dataset.menuGroup) {
      const groups = expandedMenuGroups(toggle.dataset.menuKind);
      if (expanded) {
        groups.clear();
        groups.add(toggle.dataset.menuGroup);
      } else groups.delete(toggle.dataset.menuGroup);
      localStorage.setItem(
        `erp.menuExpanded:${state.orgId}:${toggle.dataset.menuKind}`,
        JSON.stringify([...groups]),
      );
    }
  }
  function collapseDynamicMenus(exceptToggleId = "") {
    [
      ["subledger-toggle", "subledger-subnav"],
      ["object-toggle", "object-subnav"],
      ["dimension-toggle", "dimension-subnav"],
      ["transaction-toggle", "transaction-subnav"],
      ["reports-toggle", "reports-subnav"],
    ].forEach(([toggleId, subnavId]) => {
      if (toggleId !== exceptToggleId)
        setMenuExpanded(toggleId, subnavId, false);
    });
  }
  function show(view) {
    document
      .querySelectorAll(".view")
      .forEach((v) => (v.hidden = v.id !== `view-${view}`));
    document
      .querySelectorAll(".nav")
      .forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    $("reports-toggle")?.classList.toggle("active", view === "reports");
    $("page-title").textContent =
      document.querySelector(`[data-view="${view}"]`)?.textContent ||
      $("page-title").textContent;
    if (state.orgId) syncContextUrl();
  }
  async function openView(view) {
    if (view === "dashboard") {
      show(view);
      collapseDynamicMenus();
      renderDashboard();
      loadDashboardData().catch((e) => alert(e.message));
      return;
    }
    await ensureViewData(view);
    show(view);
    if (view !== "reports" && view !== "journals") collapseDynamicMenus();
  }
  function labelForFamily(code) {
    if (code === "gl") return "GL Accounts";
    return (
      state.subledgerAccountTypes.find((row) => row.type_code === code)
        ?.type_name || pretty(code)
    );
  }
  function ledgerFamilyRequiresLegalEntity(code) {
    return !!state.subledgerAccountTypes.find((row) => row.type_code === code)
      ?.requires_legal_entity;
  }
  function labelForTransactionType(id) {
    const type = state.transactionTypes.find(
      (row) => row.transaction_type_id === id,
    );
    return type?.type_name || "Transactions";
  }
  function menuAttribute(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }
  function menuItemMarkup({
    label,
    attributes = "",
    icon = "module",
    iconMarkup = "",
    depth = 1,
    action = false,
    danger = false,
    id = "",
  }) {
    const classes = [
      "nav",
      "menu-entry",
      "menu-entry--item",
      `menu-entry--depth-${depth}`,
    ];
    if (depth === 1 && !action) classes.push("menu-entry--link");
    if (action) classes.push("menu-entry--action");
    if (danger) classes.push("danger");
    const iconHtml = iconMarkup || fixedMenuIconMarkup(icon, "menu-entry-icon");
    return `<button type="button" class="${classes.join(" ")}"${id ? ` id="${id}"` : ""} aria-label="${menuAttribute(label)}" title="${menuAttribute(label)}" ${attributes}>${iconHtml}<span class="menu-entry-label">${label}</span></button>`;
  }
  function expandedMenuGroups(kind) {
    try {
      const saved = JSON.parse(
        localStorage.getItem(`erp.menuExpanded:${state.orgId}:${kind}`) || "[]",
      );
      return new Set(
        Array.isArray(saved) && saved.length ? [saved.at(-1)] : [],
      );
    } catch {
      return new Set();
    }
  }
  function menuGroupMarkup(
    kind,
    id,
    label,
    items,
    {
      icon = "module",
      iconMarkup = "",
      depth = 1,
      toggleId = "",
      contentId = "",
      expanded = null,
    } = {},
  ) {
    if (!items.length) return "";
    const isExpanded =
      expanded === null ? expandedMenuGroups(kind).has(id) : expanded;
    const targetId = contentId || `${kind}-menu-group-${id}`;
    const toggleClasses = [
      "nav",
      "menu-entry",
      "menu-entry--group-toggle",
      `menu-entry--depth-${depth}`,
    ];
    return `<div class="menu-entry-group"><button type="button" class="${toggleClasses.join(" ")}"${toggleId ? ` id="${toggleId}"` : ""} data-menu-kind="${kind}" data-menu-group="${id}" aria-label="${menuAttribute(label)}" title="${menuAttribute(label)}" aria-expanded="${isExpanded ? "true" : "false"}" aria-controls="${targetId}">${iconMarkup || fixedMenuIconMarkup(icon, "menu-entry-icon")}<span class="menu-entry-label">${label}</span></button><div id="${targetId}" class="menu-entry-children" ${isExpanded ? "" : "hidden"}>${items.join("")}</div></div>`;
  }
  function bindMenu(menu, kind) {
    menu
      .querySelectorAll("[data-view]")
      .forEach(
        (button) =>
          (button.onclick = () =>
            openView(button.dataset.view).catch((error) =>
              alert(error.message),
            )),
      );
    menu
      .querySelectorAll("[data-ledger-family]")
      .forEach(
        (button) =>
          (button.onclick = () =>
            openLedgerFamily(button.dataset.ledgerFamily).catch((error) =>
              alert(error.message),
            )),
      );
    menu
      .querySelectorAll("[data-accounting-master]")
      .forEach(
        (button) =>
          (button.onclick = () =>
            openAccountingMaster(
              button.dataset.accountingMaster,
              button.dataset.accountingTypeId,
            ).catch((error) => alert(error.message))),
      );
    menu
      .querySelectorAll("[data-transaction-type]")
      .forEach(
        (button) =>
          (button.onclick = () =>
            openTransactionType(button.dataset.transactionType).catch((error) =>
              alert(error.message),
            )),
      );
    menu
      .querySelectorAll("[data-report-view]")
      .forEach(
        (button) =>
          (button.onclick = () =>
            openReport(button.dataset.reportView).catch((error) =>
              alert(error.message),
            )),
      );
    menu
      .querySelectorAll('[data-menu-action="init-schema"]')
      .forEach(
        (button) =>
          (button.onclick = () =>
            initialiseSchema().catch((error) => alert(error.message))),
      );
    menu
      .querySelectorAll('[data-menu-action="init-template"]')
      .forEach(
        (button) =>
          (button.onclick = () =>
            initialiseTemplateOrganisation().catch((error) =>
              alert(error.message),
            )),
      );
    menu
      .querySelectorAll(":scope > .menu-entry-group > [data-menu-group]")
      .forEach((heading) => {
        heading.onclick = () => {
          const content = $(heading.getAttribute("aria-controls"));
          const expanded = heading.getAttribute("aria-expanded") === "true";
          menu
            .querySelectorAll(":scope > .menu-entry-group > [data-menu-group]")
            .forEach((other) => {
              other.setAttribute("aria-expanded", "false");
              const otherContent = $(other.getAttribute("aria-controls"));
              if (otherContent) otherContent.hidden = true;
            });
          const expandedGroups = expandedMenuGroups(kind);
          expandedGroups.clear();
          if (!expanded) {
            heading.setAttribute("aria-expanded", "true");
            if (content) content.hidden = false;
            expandedGroups.add(heading.dataset.menuGroup);
          }
          localStorage.setItem(
            `erp.menuExpanded:${state.orgId}:${kind}`,
            JSON.stringify([...expandedGroups]),
          );
        };
      });
  }
  function buildDynamicMenu() {
    const accessibleModules = new Set(
      state.navigation.modules.map((module) => module.module_id),
    );
    const permissions = state.navigation.permissions || [];
    const hasMaster =
      state.navigation.is_administrator ||
      permissions.some((permission) =>
        [
          "gl_account",
          "legal_entity",
          "subledger_account",
          "accounting_object",
          "accounting_dimension",
        ].includes(permission.resource_kind),
      );
    const hasAccountingObject = permissions.some(
      (permission) => permission.resource_kind === "accounting_object",
    );
    const hasTransactions = permissions.some(
      (permission) => permission.resource_kind === "transaction",
    );
    const linked = (row) =>
      state.navigation.is_administrator ||
      (row.module_ids || []).some((id) => accessibleModules.has(id));
    const masterAllowed = (type) =>
      state.navigation.is_administrator ||
      permissions.some(
        (permission) =>
          permission.resource_kind === "subledger_account" &&
          (permission.resource_code === "*" ||
            permission.resource_code === type.subledger_account_type_id),
      );
    const transactionAllowed = (id) =>
      state.navigation.is_administrator ||
      permissions.some(
        (permission) =>
          permission.resource_kind === "transaction" &&
          (permission.resource_code === "*" || permission.resource_code === id),
      );
    const families = state.subledgerAccountTypes.filter(
      (type) => type.is_active !== false && linked(type) && masterAllowed(type),
    );
    const subledgerItems = families.map((type) =>
      menuItemMarkup({
        label: type.type_name,
        attributes: `data-ledger-family="${type.type_code}"`,
        icon: "subledger",
        depth: 2,
      }),
    );
    const objectItems = state.accountingObjectTypes
      .filter(
        (type) =>
          type.is_active !== false && hasAccountingObject && linked(type),
      )
      .map((type) =>
        menuItemMarkup({
          label: type.type_name,
          attributes: `data-accounting-master="object" data-accounting-type-id="${type.accounting_object_type_id}"`,
          icon: "accountingObject",
          depth: 2,
        }),
      );
    const dimensionItems = state.accountingDimensionTypes
      .filter((type) => type.is_active !== false && hasMaster && linked(type))
      .map((type) =>
        menuItemMarkup({
          label: type.type_name,
          attributes: `data-accounting-master="dimension" data-accounting-type-id="${type.accounting_dimension_type_id}"`,
          icon: "accountingDimension",
          depth: 2,
        }),
      );
    const transactionItems = state.transactionGroups
      .filter((g) => g.is_active !== false)
      .map((group) => {
        const types = state.transactionTypes.filter(
          (type) =>
            type.transaction_group_id === group.transaction_group_id &&
            type.is_active !== false &&
            linked(type) &&
            transactionAllowed(type.transaction_type_id),
        );
        if (!types.length) return "";
        const expanded = expandedTransactionGroups.has(
          group.transaction_group_id,
        );
        return `<div class="menu-entry-group"><button type="button" class="nav menu-entry menu-entry--group-toggle menu-entry--depth-2" aria-expanded="${expanded ? "true" : "false"}" data-transaction-group="${group.transaction_group_id}" aria-controls="transaction-group-${group.transaction_group_id}">${fixedMenuIconMarkup("transaction", "menu-entry-icon")}<span class="menu-entry-label">${group.group_name}</span></button><div id="transaction-group-${group.transaction_group_id}" class="menu-entry-children" ${expanded ? "" : "hidden"}>${types.map((type) => menuItemMarkup({ label: type.type_name, attributes: `data-transaction-type="${type.transaction_type_id}"`, icon: "transaction", depth: 3 })).join("")}</div></div>`;
      })
      .filter(Boolean);
    const technicalEntries = [
      menuItemMarkup({
        label: "Dashboard",
        attributes: 'data-view="dashboard"',
        icon: "dashboard",
      }),
      hasMaster
        ? menuItemMarkup({
            label: "Legal Entities",
            attributes: 'data-view="legalentities"',
            icon: "legalEntity",
          })
        : "",
      state.navigation.is_administrator ||
      permissions.some(
        (permission) => permission.resource_kind === "gl_account",
      )
        ? menuItemMarkup({
            label: "GL Accounts",
            attributes: 'data-ledger-family="gl"',
            icon: "glAccount",
          })
        : "",
      menuGroupMarkup("technical", "subledger", "Sub Ledgers", subledgerItems, {
        icon: "subledger",
        toggleId: "subledger-toggle",
        contentId: "subledger-subnav",
      }),
      menuGroupMarkup(
        "technical",
        "objects",
        "Accounting Objects",
        objectItems,
        {
          icon: "accountingObject",
          toggleId: "object-toggle",
          contentId: "object-subnav",
        },
      ),
      menuGroupMarkup(
        "technical",
        "dimensions",
        "Accounting Dimensions",
        dimensionItems,
        {
          icon: "accountingDimension",
          toggleId: "dimension-toggle",
          contentId: "dimension-subnav",
        },
      ),
      hasTransactions
        ? menuGroupMarkup(
            "technical",
            "transactions",
            "Transactions",
            transactionItems,
            {
              icon: "transaction",
              toggleId: "transaction-toggle",
              contentId: "transaction-subnav",
            },
          )
        : "",
      hasMaster || hasTransactions
        ? menuGroupMarkup(
            "technical",
            "reports",
            "Reports",
            [
              menuItemMarkup({
                label: "Financial Statement",
                attributes: 'data-report-view="financial_statement"',
                icon: "report",
                depth: 2,
              }),
              menuItemMarkup({
                label: "Ledger Balances",
                attributes: 'data-report-view="ledger"',
                icon: "report",
                depth: 2,
              }),
            ],
            {
              icon: "report",
              toggleId: "reports-toggle",
              contentId: "reports-subnav",
            },
          )
        : "",
    ];
    $("technical-menu").innerHTML = technicalEntries.join("");
    bindMenu($("technical-menu"), "technical");
    $("technical-menu")
      .querySelectorAll("[data-transaction-group]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const groupId = button.dataset.transactionGroup;
          if (expandedTransactionGroups.has(groupId))
            expandedTransactionGroups.delete(groupId);
          else {
            expandedTransactionGroups.clear();
            expandedTransactionGroups.add(groupId);
          }
          buildDynamicMenu();
        });
      });
    highlightDynamicMenu();
  }
  function resourceMenuItem(label, attributes, kind) {
    return menuItemMarkup({
      label,
      attributes,
      iconMarkup: resourceIconMarkup(kind),
      depth: 2,
    });
  }
  function resourcesForModules(moduleIds, { role = null } = {}) {
    const linked = (row) =>
      (row.module_ids || []).some((id) => moduleIds.has(id));
    const permissions = role
      ? state.navigation.permissions.filter(
          (permission) => permission.role_id === role.role_id,
        )
      : [];
    const masterAllowed = (type) =>
      !role ||
      permissions.some(
        (permission) =>
          permission.resource_kind === "subledger_account" &&
          (permission.resource_code === "*" ||
            permission.resource_code === type.subledger_account_type_id),
      );
    const anyMaster =
      !role ||
      permissions.some((permission) =>
        [
          "subledger_account",
          "accounting_object",
          "accounting_dimension",
        ].includes(permission.resource_kind),
      );
    const accountingObjectAllowed = (type) =>
      !role ||
      permissions.some(
        (permission) =>
          permission.resource_kind === "accounting_object" &&
          (permission.resource_code === "*" ||
            permission.resource_code === type.accounting_object_type_id),
      );
    const transactionAllowed = (type) =>
      !role ||
      permissions.some(
        (permission) =>
          permission.resource_kind === "transaction" &&
          (permission.resource_code === "*" ||
            permission.resource_code === type.transaction_type_id),
      );
    return [
      ...state.subledgerAccountTypes
        .filter(
          (row) => row.is_active !== false && linked(row) && masterAllowed(row),
        )
        .map((row) =>
          resourceMenuItem(
            row.type_name,
            `data-ledger-family="${row.type_code}"`,
            "subledger",
          ),
        ),
      ...state.accountingObjectTypes
        .filter(
          (row) =>
            row.is_active !== false &&
            linked(row) &&
            accountingObjectAllowed(row),
        )
        .map((row) =>
          resourceMenuItem(
            row.type_name,
            `data-accounting-master="object" data-accounting-type-id="${row.accounting_object_type_id}"`,
            "accountingObject",
          ),
        ),
      ...state.accountingDimensionTypes
        .filter((row) => row.is_active !== false && linked(row) && anyMaster)
        .map((row) =>
          resourceMenuItem(
            row.type_name,
            `data-accounting-master="dimension" data-accounting-type-id="${row.accounting_dimension_type_id}"`,
            "accountingDimension",
          ),
        ),
      ...state.transactionTypes
        .filter(
          (row) =>
            row.is_active !== false && linked(row) && transactionAllowed(row),
        )
        .map((row) =>
          resourceMenuItem(
            row.type_name,
            `data-transaction-type="${row.transaction_type_id}"`,
            "transaction",
          ),
        ),
    ];
  }
  function setupMenuGroups() {
    const allowed = state.navigation?.is_administrator === true;
    const canBootstrap = canBootstrapSetup();
    const canInitialiseTemplate = canInitialiseTemplateOrg();
    const groups = [];
    if (allowed) {
      groups.push(
        {
          id: "organisation",
          label: "Organisation",
          icon: "organisation",
          items: [
            ["Organisations", 'data-view="organisations"', "organisation"],
            ["Divisions", 'data-view="divisions"', "division"],
            ["Fiscal Year", 'data-view="fiscal"', "calendar"],
            ["Countries", 'data-view="countries"', "globe"],
            ["Currencies", 'data-view="currencies"', "currency"],
            ["Tax Types", 'data-view="taxtypes"', "tax"],
            [
              "Financial Statement Formats",
              'data-view="financialformats"',
              "report",
            ],
          ],
        },
        {
          id: "accounting-model",
          label: "Accounting Model",
          icon: "accountingDimension",
          items: [
            ["Modules", 'data-view="modules"', "module"],
            [
              "Subledger Account Types",
              'data-view="ledgerfamilies"',
              "subledger",
            ],
            [
              "Accounting Object Types",
              'data-view="accountingobjecttypes"',
              "accountingObject",
            ],
            [
              "Accounting Dimension Types",
              'data-view="accountingdimensiontypes"',
              "accountingDimension",
            ],
          ],
        },
        {
          id: "transactions",
          label: "Transactions",
          icon: "transaction",
          items: [
            [
              "Transaction Groups",
              'data-view="transactiongroups"',
              "transaction",
            ],
            [
              "Transaction Types",
              'data-view="transactiontypes"',
              "transaction",
            ],
            ["Workflows", 'data-view="workflows"', "workflow"],
          ],
        },
        {
          id: "security",
          label: "Security",
          icon: "security",
          items: [["Permissions", 'data-view="permissions"', "role"]],
        },
      );
    }
    const recoveryItems = [];
    if (allowed || canBootstrap)
      recoveryItems.push(
        menuItemMarkup({
          label: "Initialise Schema",
          attributes: 'data-menu-action="init-schema"',
          icon: "recovery",
          depth: 2,
          action: true,
        }),
      );
    if (canInitialiseTemplate)
      recoveryItems.push(
        menuItemMarkup({
          label: "Initialise Template Org",
          attributes: 'data-menu-action="init-template"',
          icon: "recovery",
          depth: 2,
          action: true,
          id: "init-template-menu",
        }),
      );
    if (allowed)
      recoveryItems.push(
        menuItemMarkup({
          label: "ERP Reset",
          attributes: 'data-view="setup"',
          icon: "reset",
          depth: 2,
          danger: true,
        }),
      );
    if (recoveryItems.length)
      groups.push({
        id: "recovery",
        label: "Recovery",
        icon: "recovery",
        renderedItems: recoveryItems,
        expanded: !allowed,
      });
    return groups;
  }
  function buildSetupMenu() {
    const groups = setupMenuGroups();
    $("setup-menu").innerHTML = groups
      .map((group) =>
        menuGroupMarkup(
          "setup",
          group.id,
          group.label,
          group.renderedItems ||
            group.items.map(([label, attributes, icon]) =>
              menuItemMarkup({ label, attributes, icon, depth: 2 }),
            ),
          { icon: group.icon, expanded: group.expanded ?? null },
        ),
      )
      .join("");
    bindMenu($("setup-menu"), "setup");
  }
  function buildAlternativeMenus() {
    const hasMaster =
      state.navigation.is_administrator ||
      (state.navigation.permissions || []).some((permission) =>
        [
          "gl_account",
          "legal_entity",
          "subledger_account",
          "accounting_object",
          "accounting_dimension",
        ].includes(permission.resource_kind),
      );
    const common =
      menuItemMarkup({
        label: "Dashboard",
        attributes: 'data-view="dashboard"',
        icon: "dashboard",
      }) +
      (hasMaster
        ? menuItemMarkup({
            label: "Legal Entities",
            attributes: 'data-view="legalentities"',
            icon: "legalEntity",
          })
        : "");
    $("module-menu").innerHTML =
      common +
      state.navigation.modules
        .map((module) => {
          const items = resourcesForModules(new Set([module.module_id]));
          return menuGroupMarkup(
            "module",
            module.module_id,
            module.module_name,
            items,
            { iconMarkup: moduleIconMarkup(module.module_icon_svg) },
          );
        })
        .join("");
    $("role-menu").innerHTML =
      common +
      state.navigation.roles
        .map((role) => {
          const moduleIds = new Set(role.module_ids || []);
          const items = resourcesForModules(moduleIds, { role });
          return menuGroupMarkup("role", role.role_id, role.role_name, items, {
            icon: "role",
          });
        })
        .join("");
    bindMenu($("module-menu"), "module");
    bindMenu($("role-menu"), "role");
    syncSetupAccess();
    applyMenuMode(localStorage.getItem("erp.menuMode") || "module");
  }
  function syncSetupAccess() {
    const allowed = state.navigation?.is_administrator === true;
    const canInitialiseTemplate = canInitialiseTemplateOrg();
    const setupAvailable =
      allowed || canInitialiseTemplate || canBootstrapSetup();
    buildSetupMenu();
    document.querySelector('[data-menu-mode="setup"]').hidden = !setupAvailable;
    if (!setupAvailable) $("setup-menu").hidden = true;
    if (loadedSlices.menu && !setupAvailable) {
      if (localStorage.getItem("erp.menuMode") === "setup")
        applyMenuMode("module");
    }
    if (loadedSlices.menu && !allowed) {
      const visibleView = document
        .querySelector(".view:not([hidden])")
        ?.id?.replace("view-", "");
      if (setupViews.has(visibleView)) show("dashboard");
    }
  }
  function applyMenuMode(mode) {
    const allowedModes = ["technical", "module", "role"];
    if (
      state.navigation?.is_administrator === true ||
      canInitialiseTemplateOrg()
    )
      allowedModes.push("setup");
    const selected = allowedModes.includes(mode) ? mode : "module";
    $("technical-menu").hidden = selected !== "technical";
    $("module-menu").hidden = selected !== "module";
    $("role-menu").hidden = selected !== "role";
    $("setup-menu").hidden = selected !== "setup";
    document.querySelectorAll("[data-menu-mode]").forEach((tab) => {
      const active = tab.dataset.menuMode === selected;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
    localStorage.setItem("erp.menuMode", selected);
    highlightDynamicMenu();
  }
  function highlightDynamicMenu() {
    document
      .querySelectorAll("[data-ledger-family]")
      .forEach((button) =>
        button.classList.toggle(
          "active",
          button.dataset.ledgerFamily === selectedAccountScopeCode &&
            !$("view-accounts").hidden,
        ),
      );
    document.querySelectorAll("[data-accounting-master]").forEach((button) => {
      const selectedType =
        button.dataset.accountingMaster === "object"
          ? selectedAccountingObjectTypeId
          : selectedAccountingDimensionTypeId;
      button.classList.toggle(
        "active",
        button.dataset.accountingTypeId === selectedType &&
          !$(`view-accounting${button.dataset.accountingMaster}s`).hidden,
      );
    });
    document
      .querySelectorAll("[data-transaction-type]")
      .forEach((button) =>
        button.classList.toggle(
          "active",
          button.dataset.transactionType === selectedTransactionTypeId &&
            !$("view-journals").hidden,
        ),
      );
    document
      .querySelectorAll("[data-report-view]")
      .forEach((button) =>
        button.classList.toggle(
          "active",
          button.dataset.reportView === selectedReport &&
            !$("view-reports").hidden,
        ),
      );
    $("subledger-toggle")?.classList.toggle(
      "active",
      !$("view-accounts").hidden &&
        selectedAccountScopeCode &&
        selectedAccountScopeCode !== "gl",
    );
    $("object-toggle")?.classList.toggle(
      "active",
      !$("view-accountingobjects").hidden,
    );
    $("dimension-toggle")?.classList.toggle(
      "active",
      !$("view-accountingdimensions").hidden,
    );
    $("transaction-toggle")?.classList.toggle(
      "active",
      !$("view-journals").hidden,
    );
    $("reports-toggle")?.classList.toggle("active", !$("view-reports").hidden);
  }
  async function openAccountingMaster(kind, typeId = "") {
    const view =
      kind === "object" ? "accountingobjects" : "accountingdimensions";
    selectedAccountScopeCode = "";
    if (kind === "object")
      selectedAccountingObjectTypeId = typeId || selectedAccountingObjectTypeId;
    else
      selectedAccountingDimensionTypeId =
        typeId || selectedAccountingDimensionTypeId;
    selectedTransactionTypeId = "";
    await ensureViewData(view);
    const config = accountingMasterConfig(kind);
    if (typeId) $(`${config.prefix}-type-select`).value = typeId;
    await loadAccountingMasterRecords(kind);
    show(view);
    setMenuExpanded(
      kind === "object" ? "object-toggle" : "dimension-toggle",
      kind === "object" ? "object-subnav" : "dimension-subnav",
      true,
    );
    collapseDynamicMenus(
      kind === "object" ? "object-toggle" : "dimension-toggle",
    );
    $("page-title").textContent =
      kind === "object" ? "Accounting Objects" : "Accounting Dimensions";
    highlightDynamicMenu();
  }
  async function openLedgerFamily(familyCode) {
    await Promise.all([
      loadMenuData(),
      ensureDivisions(),
      ensureAccountTypes(),
      ensureLegalEntities(),
    ]);
    selectedAccountScopeCode = familyCode;
    selectedAccountingObjectTypeId = "";
    selectedAccountingDimensionTypeId = "";
    selectedTransactionTypeId = "";
    $("account-form-family").value = familyCode;
    $("account-form").hidden = true;
    show("accounts");
    if (familyCode === "gl") collapseDynamicMenus();
    else {
      setMenuExpanded("subledger-toggle", "subledger-subnav", true);
      collapseDynamicMenus("subledger-toggle");
    }
    const title =
      familyCode === "gl" ? "GL Accounts" : labelForFamily(familyCode);
    $("page-title").textContent = title;
    $("account-grid-title").textContent = title;
    await loadAccountsForFamily(familyCode);
    renderAccounts();
    highlightDynamicMenu();
  }
  async function openTransactionType(typeId) {
    await Promise.all([
      ensureTransactionSetup(),
      ensureDivisions(),
      ensureFiscal(),
      ensureLegalEntities(),
    ]);
    selectedTransactionTypeId = typeId;
    selectedAccountScopeCode = "";
    selectedAccountingObjectTypeId = "";
    selectedAccountingDimensionTypeId = "";
    const type = state.transactionTypes.find(
      (row) => row.transaction_type_id === typeId,
    );
    if (type?.transaction_group_id)
      expandedTransactionGroups.add(type.transaction_group_id);
    $("journal-form").hidden = true;
    show("journals");
    setMenuExpanded("transaction-toggle", "transaction-subnav", true);
    collapseDynamicMenus("transaction-toggle");
    $("page-title").textContent = labelForTransactionType(typeId);
    $("journal-grid-title").textContent = labelForTransactionType(typeId);
    await Promise.all([
      loadJournalsForTransactionType(typeId),
      loadAllAccounts(),
    ]);
    renderJournals();
    fillAccountSelects();
    patchDynamicSelects();
    highlightDynamicMenu();
  }
  async function openReport(report) {
    await ensureViewData("reports");
    selectedReport = report;
    selectedAccountScopeCode = "";
    selectedAccountingObjectTypeId = "";
    selectedAccountingDimensionTypeId = "";
    selectedTransactionTypeId = "";
    show("reports");
    setMenuExpanded("reports-toggle", "reports-subnav", true);
    collapseDynamicMenus("reports-toggle");
    const titles = {
      financial_statement: "Financial Statement",
      ledger: "Ledger Balances",
    };
    $("page-title").textContent = titles[report] || "Reports";
    $("report-title").textContent = titles[report] || "Reports";
    const financial = report === "financial_statement";
    [
      "report-format-label",
      "report-period-from-label",
      "report-period-to-label",
      "report-compare-year-label",
      "report-compare-period-from-label",
      "report-compare-period-to-label",
    ].forEach((id) => ($(id).hidden = !financial));
    $("report-division-label").hidden = true;
    fillReportFormatSelect();
    fillReportPeriodSelects();
    renderReport().catch((e) => alert(e.message));
    highlightDynamicMenu();
  }
  function fillSelects() {
    const currencies = state.currencies.length
      ? state.currencies
      : boot.currencies;
    const accountScopes = [
      { type_code: "gl", type_name: "GL Accounts" },
      ...state.subledgerAccountTypes,
    ];
    option(
      $("organisation-select"),
      boot.organisations,
      "organisation_id",
      (o) => `${o.organisation_code} - ${o.organisation_name}`,
    );
    $("organisation-select").value = state.orgId || "";
    const template = boot.organisations.find((o) => o.is_template);
    option(
      $("org-copy-source"),
      boot.organisations,
      "organisation_id",
      (o) => `${o.organisation_code} - ${o.organisation_name}`,
      "Select source organisation",
    );
    option(
      $("org-copy-target"),
      boot.organisations,
      "organisation_id",
      (o) => `${o.organisation_code} - ${o.organisation_name}`,
      "Select target organisation",
    );
    if (template) $("org-copy-source").value = template.organisation_id;
    $("org-copy-target").value = state.orgId || "";
    option(
      $("org-delete-target"),
      boot.organisations,
      "organisation_id",
      (o) => `${o.organisation_code} - ${o.organisation_name}`,
      "Select organisation",
    );
    $("org-delete-target").value = state.orgId || "";
    option(
      $("transaction-type-group"),
      state.transactionGroups,
      "transaction_group_id",
      (g) => `${g.group_code} - ${g.group_name}`,
      "Select group",
    );
    option(
      $("report-year"),
      state.years,
      "fiscal_year_id",
      (y) => y.fiscal_year_code,
      "Select fiscal year",
    );
    if (!$("report-year").value && state.years[0])
      $("report-year").value = state.years[0].fiscal_year_id;
    option(
      $("report-compare-year"),
      state.years,
      "fiscal_year_id",
      (y) => y.fiscal_year_code,
      "None",
    );
    [$("org-currency")].forEach((s) =>
      option(
        s,
        currencies,
        "currency_code",
        (c) => `${c.currency_code} - ${c.currency_name}`,
      ),
    );
    option(
      $("account-form-family"),
      accountScopes.filter((type) => type.is_active !== false),
      "type_code",
      (type) => `${type.type_code} - ${type.type_name}`,
    );
    option(
      $("account-subledger-family"),
      state.subledgerAccountTypes.filter((type) => type.is_active !== false),
      "subledger_account_type_id",
      (type) => `${type.type_code} - ${type.type_name}`,
      "None",
    );
    if (
      !$("account-form-family").value ||
      $("account-form-family").value === "bank"
    )
      $("account-form-family").value = "gl";
    $("account-form-family").disabled = true;
  }
  function fillDivisionSelects() {
    const label = (d) =>
      `${"  ".repeat(Number(d.depth) || 0)}${d.division_code} - ${d.division_name}`;
    const scopedIds = new Set();
    if (state.divisionId) {
      scopedIds.add(state.divisionId);
      if (state.includeChildren) {
        let changed = true;
        while (changed) {
          changed = false;
          state.divisions.forEach((division) => {
            if (
              scopedIds.has(division.parent_division_id) &&
              !scopedIds.has(division.division_id)
            ) {
              scopedIds.add(division.division_id);
              changed = true;
            }
          });
        }
      }
    }
    const scoped = state.divisionId
      ? state.divisions.filter((division) =>
          scopedIds.has(division.division_id),
        )
      : state.divisions;
    option(
      $("division-parent"),
      state.divisions,
      "division_id",
      label,
      "Root division",
    );
    [
      $("account-division"),
      $("journal-division"),
      $("accounting-object-division"),
      $("accounting-dimension-division"),
    ].forEach((select) => {
      option(select, scoped, "division_id", label);
      if (state.divisionId && scopedIds.has(state.divisionId))
        select.value = state.divisionId;
    });
    option(
      $("report-division"),
      state.divisions,
      "division_id",
      label,
      "All divisions",
    );
    if (state.divisionId) $("report-division").value = state.divisionId;
    document
      .querySelectorAll(".permission-division")
      .forEach((s) =>
        option(s, state.divisions, "division_id", label, "Select division"),
      );
  }
  function periodsForYear(yearId) {
    return state.periods
      .filter((period) => period.fiscal_year_id === yearId)
      .sort((a, b) => Number(a.period_number) - Number(b.period_number));
  }
  function fiscalPeriodForDate(dateValue) {
    const date = dateOnly(dateValue);
    if (!date) return null;
    return (
      state.periods.find(
        (period) =>
          date >= dateOnly(period.start_date) &&
          date <= dateOnly(period.end_date),
      ) || null
    );
  }
  function syncJournalPeriodToDate() {
    const period = fiscalPeriodForDate($("journal-date")?.value);
    if (period) $("journal-period").value = period.fiscal_period_id;
    else $("journal-period").value = "";
  }
  function fillReportPeriodRange(yearSelectId, fromId, toId) {
    const periods = periodsForYear($(yearSelectId)?.value);
    option(
      $(fromId),
      periods,
      "fiscal_period_id",
      (p) => `${p.period_number} - ${p.period_code}`,
      "Select period",
    );
    option(
      $(toId),
      periods,
      "fiscal_period_id",
      (p) => `${p.period_number} - ${p.period_code}`,
      "Select period",
    );
    if (periods[0] && !$(fromId).value)
      $(fromId).value = periods[0].fiscal_period_id;
    if (periods.at(-1) && !$(toId).value)
      $(toId).value = periods.at(-1).fiscal_period_id;
  }
  function fillReportPeriodSelects() {
    fillReportPeriodRange(
      "report-year",
      "report-period-from",
      "report-period-to",
    );
    fillReportPeriodRange(
      "report-compare-year",
      "report-compare-period-from",
      "report-compare-period-to",
    );
  }
  function fillReportFormatSelect() {
    const active = state.financialFormats.filter(
      (format) => format.is_active !== false,
    );
    option(
      $("report-format"),
      active,
      "financial_statement_format_id",
      (format) => `${format.format_name} (${pretty(format.statement_type)})`,
      "Select format",
    );
    if (
      selectedFinancialFormatId &&
      active.some(
        (format) =>
          format.financial_statement_format_id === selectedFinancialFormatId,
      )
    )
      $("report-format").value = selectedFinancialFormatId;
    selectedFinancialFormatId = $("report-format").value || "";
  }
  function fillAccountSelects() {
    const gl = state.accounts.filter(
      (account) => account.account_kind === "gl",
    );
    option(
      $("master-ledger-account"),
      state.accounts.filter((account) => account.account_kind === "subledger"),
      "account_id",
      (a) => `${a.account_code} - ${a.account_name}`,
      "None",
    );
    document.querySelectorAll(".line-gl").forEach((s) => {
      const value = s.value;
      option(
        s,
        gl,
        "account_id",
        (a) => `${a.account_code} - ${a.account_name}`,
        "Select GL account",
      );
      s.value = value;
    });
    document
      .querySelectorAll(".journal-line:not(.journal-line-head)")
      .forEach(syncJournalLineSubledgerOptions);
  }
  function subledgerTypeForJournalLine(row) {
    const setupType = row.dataset.subledgerType || "";
    if (setupType) return setupType;
    const glAccount = state.accounts.find(
      (account) =>
        account.account_kind === "gl" &&
        account.account_id === row.querySelector(".line-gl")?.value,
    );
    if (
      glAccount?.requires_subledger &&
      glAccount.required_subledger_account_type_id
    )
      return glAccount.required_subledger_account_type_id;
    return "";
  }
  function syncJournalLineSubledgerOptions(row) {
    const subledger = row.querySelector(".line-sub");
    if (!subledger) return;
    const value = subledger.value;
    const typeId = subledgerTypeForJournalLine(row);
    const accounts = state.accounts.filter(
      (account) =>
        account.account_kind === "subledger" &&
        (!typeId || account.subledger_account_type_id === typeId),
    );
    option(
      subledger,
      accounts,
      "account_id",
      (account) => `${account.account_name} (${account.account_code})`,
      "None",
    );
    subledger.value = accounts.some((account) => account.account_id === value)
      ? value
      : "";
  }
  function fillLegalEntitySelects() {
    option(
      $("account-legal-entity"),
      state.legalEntities,
      "legal_entity_id",
      (e) => `${e.known_name} - ${e.legal_name}`,
      "None",
    );
    document.querySelectorAll(".relationship-entity").forEach((select) =>
      option(
        select,
        state.legalEntities.filter(
          (e) => e.legal_entity_id !== selectedLegalEntity,
        ),
        "legal_entity_id",
        (e) => `${e.known_name} - ${e.legal_name}`,
        "Select legal entity",
      ),
    );
  }
  function setRequiredMarker(label, required) {
    if (!label) return;
    let marker = label.querySelector(":scope > .required-marker");
    if (required && !marker) {
      marker = document.createElement("span");
      marker.className = "required-marker";
      marker.textContent = "*";
      const textNode = [...label.childNodes].find(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
      );
      if (textNode) textNode.after(marker);
      else label.prepend(marker);
    } else if (!required && marker) {
      marker.remove();
    }
  }
  function syncRequiredMarkers(root = document) {
    root.querySelectorAll("label").forEach((label) => {
      const required =
        label.classList.contains("required") ||
        !!label.querySelector(
          "input[required],select[required],textarea[required]",
        );
      setRequiredMarker(label, required);
    });
  }
  function updateAccountLegalEntityRequirement() {
    const required = ledgerFamilyRequiresLegalEntity(
      $("account-form-family").value || selectedAccountScopeCode || "gl",
    );
    $("account-legal-entity").required = required;
    $("account-legal-entity")
      .closest("label")
      ?.classList.toggle("required", required);
    syncRequiredMarkers($("account-form"));
  }
  function formatBytes(bytes) {
    const size = Number(bytes) || 0;
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  function readFileDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () =>
        reject(reader.error || new Error("Could not read file"));
      reader.readAsDataURL(file);
    });
  }
  const documentTargets = {
    account: {
      kind: () =>
        selectedAccountScopeCode === "gl" ? "gl_account" : "subledger_account",
      id: () => $("account-id").value,
      list: "account-document-list",
      file: "account-document-file",
    },
    journal: {
      kind: "journal",
      id: () => $("journal-id").value,
      list: "journal-document-list",
      file: "journal-document-file",
    },
    legalEntity: {
      kind: "legal_entity",
      id: () => $("legal-entity-id").value,
      list: "legal-entity-document-list",
      file: "legal-entity-document-file",
    },
  };
  async function loadEntityDocuments(targetKey) {
    const target = documentTargets[targetKey];
    const list = $(target.list);
    const entityId = target.id();
    if (!entityId) {
      list.innerHTML =
        '<p class="empty">Save the record before uploading documents.</p>';
      return;
    }
    list.innerHTML = '<p class="empty">Loading documents...</p>';
    const params = new URLSearchParams({
      organisation_id: state.orgId,
      entity_kind:
        typeof target.kind === "function" ? target.kind() : target.kind,
      entity_id: entityId,
    });
    const r = await api(`documents/list?${params.toString()}`);
    const docs = r.documents || [];
    if (!docs.length) {
      list.innerHTML = '<p class="empty">No documents uploaded.</p>';
      return;
    }
    list.innerHTML = "";
    docs.forEach((doc) => {
      const row = document.createElement("article");
      row.className = "document-row";
      const link = document.createElement("a");
      link.href = doc.data_url;
      link.download = doc.file_name;
      link.textContent = doc.file_name;
      const meta = document.createElement("small");
      meta.textContent = `${doc.document_type || "other"} - ${doc.mime_type} - ${formatBytes(doc.file_size)}`;
      const del = document.createElement("button");
      del.type = "button";
      del.className = "secondary document-delete";
      del.textContent = "Delete";
      del.addEventListener("click", async () => {
        if (!confirm(`Delete document "${doc.file_name}"?`)) return;
        await api("documents/delete", {
          method: "POST",
          body: JSON.stringify({ document_id: doc.document_id }),
        });
        await loadEntityDocuments(targetKey);
      });
      row.append(link, meta, del);
      list.append(row);
    });
  }
  async function uploadEntityDocument(targetKey) {
    const target = documentTargets[targetKey];
    const entityId = target.id();
    if (!entityId) return alert("Save the record before uploading documents.");
    const input = $(target.file);
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("Document must be 10MB or smaller");
      const dataUrl = await readFileDataUrl(file);
      await api("documents/upload", {
        method: "POST",
        body: JSON.stringify({
          organisation_id: state.orgId,
          entity_kind:
            typeof target.kind === "function" ? target.kind() : target.kind,
          entity_id: entityId,
          document_type: "other",
          file_name: file.name,
          data_url: dataUrl,
        }),
      });
      input.value = "";
      await loadEntityDocuments(targetKey);
    } catch (error) {
      alert(error.message);
    }
  }
  function syncIntakeFieldsFromJson() {
    let draft;
    try {
      draft = JSON.parse($("intake-json").value || "{}");
    } catch {
      return;
    }
    draft.legal_entity = draft.legal_entity || {};
    draft.legal_entity.entity_type = $("intake-entity-type").value || "company";
    draft.legal_entity.legal_name = $("intake-legal-name").value;
    draft.legal_entity.known_name = $("intake-known-name").value;
    draft.legal_entity.effective_from =
      $("intake-effective-from").value || null;
    draft.legal_entity.effective_to = $("intake-effective-to").value || null;
    $("intake-json").value = JSON.stringify(draft, null, 2);
    currentIntakeDraft = draft;
  }
  function populateIntakeReview(intake) {
    const draft = intake.extracted_json || {};
    const entity = draft.legal_entity || {};
    currentIntakeDraft = draft;
    $("intake-id").value = intake.intake_id || "";
    $("intake-entity-type").value = entity.entity_type || "company";
    $("intake-legal-name").value = entity.legal_name || "";
    $("intake-known-name").value = entity.known_name || entity.legal_name || "";
    $("intake-effective-from").value = dateOnly(entity.effective_from);
    $("intake-effective-to").value = dateOnly(entity.effective_to);
    $("intake-confidence").value =
      `${Math.round((Number(draft.confidence) || 0) * 100)}%`;
    $("intake-json").value = JSON.stringify(draft, null, 2);
    $("intake-review").hidden = false;
    const notes = (draft.notes || []).filter(Boolean);
    $("intake-status").textContent = notes.length
      ? notes.join(" ")
      : "Review the extracted details before creating the legal entity.";
  }
  function closeDocumentIntake() {
    $("intake-modal").hidden = true;
  }
  function openDocumentIntake(target) {
    const labels = {
      legal_entity: "legal entity",
      gl_account: "GL account",
      subledger_account: `${labelForFamily(selectedAccountScopeCode || "")} account`,
      journal: `${selectedTransactionTypeId ? labelForTransactionType(selectedTransactionTypeId) : "transaction"}`,
    };
    $("intake-modal").hidden = false;
    $("intake-title").textContent =
      `Create ${labels[target] || "record"} from Document`;
    $("intake-subtitle").textContent =
      target === "legal_entity"
        ? "Upload a source document, review the extracted draft, then create the legal entity."
        : "Document analysis for this target will use the same review flow in the next implementation slice.";
    $("intake-target-kind").value = target;
    $("intake-id").value = "";
    $("intake-file").value = "";
    $("intake-status").textContent =
      target === "legal_entity"
        ? "Choose a document to analyse."
        : "Only legal entity intake is implemented in this step.";
    $("intake-review").hidden = true;
    currentIntakeDraft = null;
  }
  function showLegalEntityTab(tab) {
    document
      .querySelectorAll("[data-legal-entity-tab]")
      .forEach((button) =>
        button.classList.toggle(
          "active",
          button.dataset.legalEntityTab === tab,
        ),
      );
    document.querySelectorAll("[data-legal-entity-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.legalEntityPanel !== tab;
    });
  }
  function setupLegalEntityTabs() {
    const form = $("legal-entity-form");
    if (!form || form.dataset.tabsReady) return;
    const moveTo = (panel, ids) => {
      ids.forEach((id) => {
        const el = $(id);
        const wrapper = el?.closest("label") || el;
        if (wrapper) panel.append(wrapper);
      });
    };
    const makePanel = (id, label) => {
      const panel = document.createElement("div");
      panel.id = `legal-entity-tab-${id}`;
      panel.className = `legal-entity-tab-panel full${id === "details" ? " legal-entity-details-grid" : ""}`;
      panel.dataset.legalEntityPanel = id;
      panel.hidden = id !== "details";
      return panel;
    };
    const tabs = document.createElement("div");
    tabs.className = "tabs legal-entity-tabs full";
    tabs.setAttribute("role", "tablist");
    [
      ["details", "Details"],
      ["identifications", "Identification Numbers"],
      ["addresses", "Addresses"],
      ["relationships", "Relationships"],
      ["additional", "Additional Data"],
      ["accounts", "Linked Accounts"],
    ].forEach(([id, label], index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `tab${index ? "" : " active"}`;
      button.dataset.legalEntityTab = id;
      button.textContent = label;
      button.addEventListener("click", () => showLegalEntityTab(id));
      tabs.append(button);
    });
    const details = makePanel("details");
    moveTo(details, [
      "legal-entity-type",
      "legal-entity-legal-name",
      "legal-entity-known-name",
      "legal-entity-status",
      "legal-entity-effective-from",
      "legal-entity-effective-to",
    ]);
    const identifications = makePanel("identifications");
    identifications.append(
      $("legal-entity-identifications").closest("section"),
    );
    const addresses = makePanel("addresses");
    addresses.append($("legal-entity-addresses").closest("section"));
    const relationships = makePanel("relationships");
    relationships.append($("legal-entity-relationships").closest("section"));
    const additional = makePanel("additional");
    additional.append($("legal-entity-additional").closest("label"));
    const accounts = makePanel("accounts");
    accounts.append($("legal-entity-account-list").closest(".linked-accounts"));
    const heading = form.querySelector("h2");
    heading.insertAdjacentElement("afterend", tabs);
    let anchor = tabs;
    [
      details,
      identifications,
      addresses,
      relationships,
      additional,
      accounts,
    ].forEach((panel) => {
      anchor.insertAdjacentElement("afterend", panel);
      anchor = panel;
    });
    form.dataset.tabsReady = "true";
  }
  function fillAccountTypes() {
    const family = $("account-form-family").value || "gl";
    option(
      $("account-type"),
      family === "gl" ? state.glAccountTypes : [],
      "gl_account_type_id",
      (type) => `${type.type_code} - ${type.type_name}`,
      family === "gl" ? "Select type" : "Not applicable",
    );
    $("account-type").required = family === "gl";
    $("account-type").closest("label").hidden = family !== "gl";
  }
  function selectedAccountFamilySchema() {
    const scope =
      $("account-form-family").value || selectedAccountScopeCode || "gl";
    return scope === "gl"
      ? {}
      : state.subledgerAccountTypes.find((type) => type.type_code === scope)
          ?.schema_json || {};
  }
  function schemaFields(schema) {
    const properties =
      schema && typeof schema === "object" && !Array.isArray(schema)
        ? schema.properties || {}
        : {};
    return Object.entries(properties).filter(
      ([, field]) =>
        field && typeof field === "object" && !Array.isArray(field),
    );
  }
  function schemaTabs(schema, fields) {
    const fieldNames = fields.map(([name]) => name);
    const assigned = new Set();
    const tabs = Array.isArray(schema?.tabs) ? schema.tabs : [];
    const result = tabs
      .map((tab, index) => {
        const names = (Array.isArray(tab?.fields) ? tab.fields : []).filter(
          (name) => fieldNames.includes(name),
        );
        names.forEach((name) => assigned.add(name));
        return {
          id: `tab-${index}`,
          label: tab.label || tab.title || tab.name || `Tab ${index + 1}`,
          fields: names,
        };
      })
      .filter((tab) => tab.fields.length);
    const remaining = fieldNames.filter((name) => !assigned.has(name));
    if (remaining.length || !result.length)
      result.push({
        id: "details",
        label: "Details",
        fields: remaining.length ? remaining : fieldNames,
      });
    return result;
  }
  function valueForDetailField(detail, schema, name) {
    if (detail && Object.prototype.hasOwnProperty.call(detail, name))
      return detail[name];
    if (Object.prototype.hasOwnProperty.call(schema, "default"))
      return schema.default;
    return schema.type === "boolean" ? false : "";
  }
  function detailFieldType(field = {}) {
    const type = field.type || field.uiType || field["x-ui-type"] || "string";
    if (["text", "short_text", "long_text", "textarea"].includes(type))
      return type;
    return type;
  }
  function detailFieldWidth(field = {}) {
    const width =
      field.uiWidth ||
      field.width ||
      field["x-width"] ||
      field["x-ui-width"] ||
      "medium";
    if (["short", "medium", "wide", "full"].includes(width)) return width;
    if (detailFieldType(field) === "short_text") return "short";
    if (["long_text", "textarea"].includes(detailFieldType(field)))
      return "full";
    return "medium";
  }
  function detailInputType(field) {
    if (field.format === "date") return "date";
    if (field.format === "date-time") return "datetime-local";
    if (
      detailFieldType(field) === "number" ||
      detailFieldType(field) === "integer"
    )
      return "number";
    return "text";
  }
  function detailEnumOptions(field) {
    if (Array.isArray(field.options))
      return field.options.map((item) => {
        if (typeof item === "object")
          return {
            value: item.code ?? item.value ?? "",
            label:
              item.description ??
              item.label ??
              item.name ??
              item.code ??
              item.value ??
              "",
          };
        return { value: item, label: String(item) };
      });
    if (Array.isArray(field.enum))
      return field.enum.map((item, index) => ({
        value: item,
        label: field.enumNames?.[index] || String(item),
      }));
    return [];
  }
  function renderDetailInput(name, field, value, required) {
    const label = document.createElement("label");
    label.className = `detail-field detail-field--${detailFieldWidth(field)}`;
    label.textContent = field.title || pretty(name);
    if (field.description) label.title = field.description;
    const enumOptions = detailEnumOptions(field);
    if (enumOptions.length) {
      const select = document.createElement("select");
      select.dataset.detailField = name;
      if (!required) {
        const blank = document.createElement("option");
        blank.value = "";
        blank.textContent = "None";
        select.append(blank);
      }
      enumOptions.forEach((item) => {
        const option = document.createElement("option");
        option.value = String(item.value);
        option.textContent = item.label || String(item.value);
        select.append(option);
      });
      select.value = value ?? "";
      label.append(select);
      return label;
    }
    if (detailFieldType(field) === "boolean") {
      label.className = `check detail-field detail-field--${detailFieldWidth(field)}`;
      const input = document.createElement("input");
      input.type = "checkbox";
      input.dataset.detailField = name;
      input.checked = !!value;
      label.prepend(input);
      return label;
    }
    const fieldType = detailFieldType(field);
    const input =
      fieldType === "object" ||
      fieldType === "array" ||
      fieldType === "long_text" ||
      fieldType === "textarea" ||
      field.format === "textarea"
        ? document.createElement("textarea")
        : document.createElement("input");
    input.dataset.detailField = name;
    if (input.tagName === "INPUT") input.type = detailInputType(field);
    if (fieldType === "integer") input.step = "1";
    input.value =
      fieldType === "object" || fieldType === "array"
        ? JSON.stringify(value ?? (fieldType === "array" ? [] : {}), null, 2)
        : (value ?? "");
    label.append(input);
    return label;
  }
  function showAccountDetailTab(container, id) {
    container
      .querySelectorAll("[data-account-detail-tab]")
      .forEach((button) =>
        button.classList.toggle(
          "active",
          button.dataset.accountDetailTab === id,
        ),
      );
    container
      .querySelectorAll("[data-account-detail-panel]")
      .forEach((panel) => {
        panel.hidden = panel.dataset.accountDetailPanel !== id;
      });
  }
  function showAccountFixedTab(id) {
    document
      .querySelectorAll("[data-account-fixed-tab]")
      .forEach((button) =>
        button.classList.toggle(
          "active",
          button.dataset.accountFixedTab === id,
        ),
      );
    document.querySelectorAll("[data-account-fixed-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.accountFixedPanel !== id;
    });
  }
  function renderSchemaDetailFields(containerId, schema, detail = {}) {
    const container = $(containerId);
    if (!container) return;
    const fields = schemaFields(schema);
    container.innerHTML = "";
    if (!fields.length) {
      const label = document.createElement("label");
      label.className = "full";
      label.textContent = "Additional data JSON";
      const textarea = document.createElement("textarea");
      textarea.dataset.detailRaw = "true";
      textarea.value = JSON.stringify(detail || {}, null, 2);
      label.append(textarea);
      container.append(label);
      syncRequiredMarkers(container);
      return;
    }
    const required = new Set(
      Array.isArray(schema.required) ? schema.required : [],
    );
    const tabs = schemaTabs(schema, fields);
    const detailLayout = document.createElement("div");
    detailLayout.className = "account-detail-layout";
    const fieldPane = document.createElement("div");
    fieldPane.className = "account-detail-fields";
    const tabBar = document.createElement("div");
    tabBar.className = "account-detail-tabs";
    tabBar.setAttribute("role", "tablist");
    if (tabs.length > 1) {
      tabs.forEach((tab, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `account-detail-tab${index ? "" : " active"}`;
        button.dataset.accountDetailTab = tab.id;
        button.textContent = tab.label;
        button.addEventListener("click", () =>
          showAccountDetailTab(container, tab.id),
        );
        tabBar.append(button);
      });
    }
    const byName = Object.fromEntries(fields);
    tabs.forEach((tab, index) => {
      const panel = document.createElement("div");
      panel.className = "account-detail-panel";
      panel.dataset.accountDetailPanel = tab.id;
      panel.hidden = index > 0;
      tab.fields.forEach((name) =>
        panel.append(
          renderDetailInput(
            name,
            byName[name],
            valueForDetailField(detail, byName[name], name),
            required.has(name),
          ),
        ),
      );
      fieldPane.append(panel);
    });
    if (tabs.length > 1) detailLayout.append(tabBar);
    detailLayout.append(fieldPane);
    container.append(detailLayout);
    syncRequiredMarkers(container);
  }
  function renderAccountDetailFields(detail = {}) {
    renderSchemaDetailFields(
      "account-detail-fields",
      selectedAccountFamilySchema(),
      detail,
    );
  }
  function collectSchemaDetail(containerId, schema) {
    const container = $(containerId);
    const raw = container?.querySelector("[data-detail-raw]");
    if (raw) {
      try {
        return JSON.parse(raw.value || "{}");
      } catch {
        throw new Error("Additional data JSON must be valid JSON");
      }
    }
    const properties = schema?.properties || {};
    const detail = {};
    container?.querySelectorAll("[data-detail-field]").forEach((input) => {
      const name = input.dataset.detailField;
      const field = properties[name] || {};
      const fieldType = detailFieldType(field);
      if (input.type === "checkbox") detail[name] = input.checked;
      else if (fieldType === "number")
        detail[name] = input.value === "" ? null : Number(input.value);
      else if (fieldType === "integer")
        detail[name] = input.value === "" ? null : parseInt(input.value, 10);
      else if (fieldType === "object" || fieldType === "array") {
        try {
          detail[name] = JSON.parse(input.value || null);
        } catch {
          throw new Error(`${field.title || pretty(name)} must be valid JSON`);
        }
      } else detail[name] = input.value;
    });
    return detail;
  }
  function collectAccountDetail() {
    return collectSchemaDetail(
      "account-detail-fields",
      selectedAccountFamilySchema(),
    );
  }
  function openAccountEditor(account = {}) {
    const family = selectedAccountScopeCode || account.scope_code || "gl";
    $("account-form").hidden = false;
    $("account-form").reset();
    showAccountFixedTab("identification");
    $("account-id").value = account.account_id || "";
    $("account-form-family").value = family;
    $("account-form-family").disabled = true;
    $("account-division").value = account.owner_division_id || "";
    $("account-code").value = account.account_code || "";
    $("account-name").value = account.account_name || "";
    $("account-legal-entity").value = account.legal_entity_id || "";
    $("account-requires-subledger").checked = !!account.requires_subledger;
    $("account-subledger-family").value =
      account.required_subledger_account_type_id || "";
    fillAccountTypes();
    $("account-type").value = account.gl_account_type_id || "";
    $("account-division").closest("label").hidden = family === "gl";
    $("account-division").required = family !== "gl";
    $("account-legal-entity").closest("label").hidden = family === "gl";
    $("account-requires-subledger").closest("label").hidden = family !== "gl";
    $("account-subledger-family").closest("label").hidden = family !== "gl";
    updateAccountLegalEntityRequirement();
    renderAccountDetailFields(account.additional_data || {});
    loadEntityDocuments("account").catch((e) => alert(e.message));
  }
  function addPanelCloseButtons() {
    [
      "organisation-form",
      "org-copy-panel",
      "org-delete-panel",
      "division-form",
      "fiscal-editor-panel",
      "fiscal-period-panel",
      "country-form",
      "currency-form",
      "tax-type-form",
      "ledger-family-form",
      "financial-format-form",
      "transaction-group-form",
      "workflow-form",
      "role-form",
      "account-form",
      "accounting-object-form",
      "accounting-dimension-form",
      "accounting-object-type-form",
      "accounting-dimension-type-form",
      "legal-entity-form",
      "journal-form",
    ].forEach((id) => {
      const panel = $(id);
      if (!panel || panel.querySelector(":scope > .panel-close")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "panel-close";
      button.textContent = "x";
      button.setAttribute("aria-label", "Close panel");
      button.addEventListener("click", () => {
        panel.hidden = true;
      });
      panel.prepend(button);
    });
  }
  function renderDashboard() {
    const org = currentOrg();
    const summary = state.dashboardSummary;
    const pending = state.orgId && !loadedSlices.dashboard;
    const metric = (key, fallback = "-") =>
      summary ? summary[key] : pending ? "..." : fallback;
    const cards = [
      ["Organisations", boot.organisations.length],
      ["Divisions", metric("divisions")],
      ["Legal Entities", metric("legal_entities")],
      ["GL Accounts", metric("gl_accounts")],
      ["Subledgers", metric("subledgers")],
      ["Periods", metric("periods")],
      ["Journals", metric("journals")],
    ];
    $("metrics").innerHTML = cards
      .map(
        ([k, v]) =>
          `<article class="metric"><span>${k}</span><strong>${v}</strong></article>`,
      )
      .join("");
    $("org-summary").innerHTML = org
      ? `<p><b>${org.organisation_name}</b></p><p>Code: ${org.organisation_code}</p><p>Base currency: ${org.base_currency_code}</p><p>Status: ${pretty(org.workflow_status)}</p>`
      : "";
  }
  function resetOrgOpenAIFields() {
    $("org-openai-model").value = "gpt-4.1-mini";
    $("org-openai-key").value = "";
    $("org-openai-clear").checked = false;
    $("org-openai-status").textContent = "No API key saved.";
  }
  function showOrganisationTab(tab) {
    document.querySelectorAll("[data-organisation-tab]").forEach((button) => {
      const active = button.dataset.organisationTab === tab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    document.querySelectorAll("[data-organisation-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.organisationPanel !== tab;
    });
  }
  function installOrganisationTabs() {
    const form = $("organisation-form");
    if (!form || form.dataset.tabsReady) return;
    const tabs = document.createElement("div");
    tabs.className = "tabs organisation-tabs";
    tabs.setAttribute("role", "tablist");
    const panels = {
      definition: document.createElement("div"),
      ai: document.createElement("div"),
    };
    Object.entries(panels).forEach(([name, panel]) => {
      panel.id = `organisation-${name}-panel`;
      panel.className = "organisation-tab-panel";
      panel.dataset.organisationPanel = name;
      panel.hidden = name !== "definition";
    });
    [
      ["definition", "Organisation Definition"],
      ["ai", "AI / OpenAI"],
    ].forEach(([name, label], index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `tab${index ? "" : " active"}`;
      button.dataset.organisationTab = name;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", panels[name].id);
      button.setAttribute("aria-selected", index ? "false" : "true");
      button.textContent = label;
      button.addEventListener("click", () => showOrganisationTab(name));
      tabs.append(button);
    });
    ["org-code", "org-name", "org-currency", "org-template"].forEach((id) =>
      panels.definition.append($(id).closest("label")),
    );
    const iconEditor = document.createElement("section");
    iconEditor.className = "organisation-icon-editor";
    const iconMarkupLabel = document.createElement("label");
    iconMarkupLabel.textContent = "SVG icon markup";
    const iconMarkup = document.createElement("textarea");
    iconMarkup.id = "org-icon-svg";
    iconMarkup.rows = 5;
    iconMarkup.placeholder = '<svg viewBox="0 0 24 24">...</svg>';
    iconMarkup.addEventListener("input", renderOrganisationIconPreview);
    iconMarkupLabel.append(iconMarkup);
    const uploadLabel = document.createElement("label");
    uploadLabel.textContent = "Upload SVG file";
    const upload = document.createElement("input");
    upload.type = "file";
    upload.accept = ".svg,image/svg+xml";
    upload.addEventListener("change", async () => {
      const file = upload.files?.[0];
      if (!file) return;
      if (file.size > 32768) {
        $("org-icon-status").textContent = "SVG icon must be 32 KB or smaller.";
        upload.value = "";
        return;
      }
      try {
        iconMarkup.value = await file.text();
        renderOrganisationIconPreview();
      } catch (error) {
        $("org-icon-status").textContent =
          error.message || "Could not read SVG file.";
      }
    });
    uploadLabel.append(upload);
    const iconActions = document.createElement("div");
    iconActions.className = "actions";
    const clearIcon = document.createElement("button");
    clearIcon.type = "button";
    clearIcon.className = "secondary";
    clearIcon.textContent = "Remove icon";
    clearIcon.addEventListener("click", () => {
      iconMarkup.value = "";
      upload.value = "";
      renderOrganisationIconPreview();
    });
    iconActions.append(clearIcon);
    const iconPreview = document.createElement("div");
    iconPreview.id = "org-icon-preview";
    iconPreview.className = "organisation-icon-preview";
    iconPreview.setAttribute("role", "img");
    iconPreview.setAttribute("aria-label", "Organisation icon preview");
    const iconStatus = document.createElement("p");
    iconStatus.id = "org-icon-status";
    iconStatus.className = "muted";
    iconStatus.setAttribute("aria-live", "polite");
    iconEditor.append(
      iconMarkupLabel,
      uploadLabel,
      iconActions,
      iconPreview,
      iconStatus,
    );
    panels.definition.append(iconEditor);
    panels.ai.append(form.querySelector(".setup-section"));
    const heading = form.querySelector("h2");
    heading.insertAdjacentElement("afterend", tabs);
    tabs.insertAdjacentElement("afterend", panels.definition);
    panels.definition.insertAdjacentElement("afterend", panels.ai);
    form.addEventListener(
      "invalid",
      (event) => {
        if (panels.definition.contains(event.target))
          showOrganisationTab("definition");
        else if (panels.ai.contains(event.target)) showOrganisationTab("ai");
      },
      true,
    );
    form.dataset.tabsReady = "true";
  }
  function renderOrganisationIconPreview() {
    const preview = $("org-icon-preview");
    if (!preview) return;
    preview.replaceChildren();
    const value = $("org-icon-svg")?.value || "";
    if (!value.trim()) {
      preview.append(
        organisationIconElement(null, "organisation-icon-preview-mark"),
      );
      $("org-icon-status").textContent = "No custom icon selected.";
      return;
    }
    const svg = sanitizedOrganisationSvg(value);
    if (!svg) {
      $("org-icon-status").textContent =
        "SVG preview unavailable. Use supported SVG shapes and attributes.";
      return;
    }
    const icon = organisationIconElement(svg, "organisation-icon-preview-mark");
    preview.append(icon);
    $("org-icon-status").textContent = "SVG preview ready.";
  }
  async function loadOrgOpenAISetting(orgId) {
    resetOrgOpenAIFields();
    if (!orgId) return;
    try {
      const setting = await api(
        `setup/openai?organisation_id=${encodeURIComponent(orgId)}`,
      );
      $("org-openai-model").value = setting.model || "gpt-4.1-mini";
      $("org-openai-status").textContent = setting.has_openai_api_key
        ? "OpenAI API key saved."
        : "No API key saved.";
    } catch (error) {
      $("org-openai-status").textContent = error.message;
    }
  }
  async function saveOrgOpenAISetting(orgId) {
    if (!orgId) return;
    const apiKey = $("org-openai-key").value;
    const clear = $("org-openai-clear").checked;
    const model = $("org-openai-model").value || "gpt-4.1-mini";
    await api("setup/openai", {
      method: "POST",
      body: JSON.stringify({
        organisation_id: orgId,
        model,
        openai_api_key: apiKey,
        clear_openai_api_key: clear,
      }),
    });
    $("org-openai-key").value = "";
    $("org-openai-clear").checked = false;
    await loadOrgOpenAISetting(orgId);
  }
  function renderOrganisations() {
    const canManage = state.navigation?.is_administrator === true;
    $("add-org").hidden = !canManage;
    if (!canManage) {
      $("organisation-form").hidden = true;
      $("org-copy-panel").hidden = true;
      $("org-delete-panel").hidden = true;
    }
    const rows = boot.organisations.filter((row) =>
      rowMatches(row, searchTerm("organisation-search")),
    );
    table(
      $("organisation-list"),
      [
        ["Code", (r) => r.organisation_code],
        ["Name", (r) => r.organisation_name],
        ["Currency", (r) => r.base_currency_code],
        ["Template", (r) => (r.is_template ? "Yes" : "No")],
      ],
      rows,
      (r) => {
        if (!canManage) return;
        $("organisation-form").hidden = false;
        showOrganisationTab("definition");
        $("org-id").value = r.organisation_id;
        $("org-code").value = r.organisation_code;
        $("org-name").value = r.organisation_name;
        $("org-currency").value = r.base_currency_code;
        $("org-template").checked = r.is_template;
        $("org-icon-svg").value = r.organisation_icon_svg || "";
        renderOrganisationIconPreview();
        const source =
          boot.organisations.find(
            (o) => o.is_template && o.organisation_id !== r.organisation_id,
          ) ||
          boot.organisations.find(
            (o) => o.organisation_id !== r.organisation_id,
          );
        $("org-copy-panel").hidden = true;
        $("org-delete-panel").hidden = true;
        $("org-copy-source").value = source?.organisation_id || "";
        $("org-copy-target").value = r.organisation_id;
        $("org-delete-target").value = r.organisation_id;
        loadOrgOpenAISetting(r.organisation_id);
      },
    );
  }
  function renderDivisions() {
    const rows = state.divisions.filter((row) =>
      rowMatches(row, searchTerm("division-search")),
    );
    table(
      $("division-list"),
      [
        [
          "Code",
          (r) => `${"  ".repeat(Number(r.depth) || 0)}${r.division_code}`,
        ],
        ["Name", (r) => r.division_name],
        ["Status", (r) => pretty(r.workflow_status)],
      ],
      rows,
      (r) => {
        $("division-form").hidden = false;
        $("division-id").value = r.division_id;
        $("division-parent").value = r.parent_division_id || "";
        $("division-code").value = r.division_code;
        $("division-name").value = r.division_name;
        $("division-status").value = r.workflow_status || "approved";
      },
    );
  }
  function renderFiscal() {
    const target = $("fiscal-year-list");
    const term = searchTerm("fiscal-search");
    const matchingPeriodYearIds = new Set(
      state.periods
        .filter((period) => rowMatches(period, term))
        .map((period) => period.fiscal_year_id),
    );
    const years = state.years.filter(
      (year) =>
        rowMatches(year, term) ||
        matchingPeriodYearIds.has(year.fiscal_year_id),
    );
    if (!years.length) {
      target.innerHTML =
        '<p class="empty">No fiscal years match the search.</p>';
      return;
    }
    const el = document.createElement("table");
    el.className = "fiscal-table";
    el.innerHTML =
      "<thead><tr><th></th><th>Fiscal Year</th><th>Start</th><th>End</th><th>Status</th></tr></thead>";
    const body = document.createElement("tbody");
    years.forEach((year) => {
      const row = document.createElement("tr");
      row.className = "click-row fiscal-year-row";
      const expanded = expandedFiscalYears.has(year.fiscal_year_id);
      row.innerHTML = `<td><button type="button" class="mini-toggle" aria-label="${expanded ? "Collapse" : "Expand"} ${year.fiscal_year_code}">${expanded ? "v" : ">"}</button></td><td>${year.fiscal_year_code}</td><td>${dateOnly(year.start_date)}</td><td>${dateOnly(year.end_date)}</td><td>${pretty(year.status)}</td>`;
      row.querySelector("button").addEventListener("click", (event) => {
        event.stopPropagation();
        if (expanded) expandedFiscalYears.delete(year.fiscal_year_id);
        else expandedFiscalYears.add(year.fiscal_year_id);
        renderFiscal();
      });
      row.addEventListener("click", () => selectFiscalYear(year));
      body.append(row);
      if (expanded) {
        const periodRow = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 5;
        cell.className = "period-cell";
        renderPeriodGrid(cell, year);
        periodRow.append(cell);
        body.append(periodRow);
      }
    });
    el.append(body);
    target.innerHTML = "";
    target.append(el);
  }
  function renderCountries() {
    const rows = (state.countries || []).filter((row) =>
      rowMatches(row, searchTerm("country-search")),
    );
    table(
      $("country-list"),
      [
        ["Alpha-2", (r) => r.country_code],
        ["Alpha-3", (r) => r.alpha3_code || ""],
        ["Numeric", (r) => r.numeric_code || ""],
        ["Name", (r) => r.country_name],
        ["Seeded", (r) => (r.is_seeded ? "Yes" : "No")],
      ],
      rows,
      (r) => {
        $("country-form").hidden = false;
        $("country-code").value = r.country_code;
        $("country-alpha3").value = r.alpha3_code || "";
        $("country-numeric").value = r.numeric_code || "";
        $("country-name").value = r.country_name;
        $("country-official").value = r.official_name || r.country_name;
        $("country-region").value = r.region || "";
        $("country-subregion").value = r.subregion || "";
        $("country-currency").value = r.default_currency_code || "";
        $("country-calling-code").value = r.calling_code || "";
        $("country-postal-required").checked = !!r.postal_code_required;
        $("country-admin-label").value = r.administrative_level_label || "";
      },
    );
  }
  function renderCurrencies() {
    const rows = (state.currencies || []).filter((row) =>
      rowMatches(row, searchTerm("currency-search")),
    );
    table(
      $("currency-list"),
      [
        ["Code", (r) => r.currency_code],
        ["Name", (r) => r.currency_name],
        ["Decimals", (r) => r.decimal_places],
        ["Seeded", (r) => (r.is_seeded ? "Yes" : "No")],
      ],
      rows,
      (r) => {
        $("currency-form").hidden = false;
        $("currency-code").value = r.currency_code;
        $("currency-name").value = r.currency_name;
        $("currency-decimals").value = r.decimal_places;
      },
    );
  }
  function ratesForTaxType(taxTypeId) {
    return (state.taxRates || [])
      .filter((rate) => rate.tax_type_id === taxTypeId)
      .sort((a, b) =>
        dateOnly(b.valid_from).localeCompare(dateOnly(a.valid_from)),
      );
  }
  function taxDirectionLabel(direction) {
    return (
      {
        output: "Output VAT",
        input: "Input VAT",
        none: "No VAT return amount",
      }[direction] || "No VAT return amount"
    );
  }
  function renderTaxTypes() {
    const term = searchTerm("tax-type-search");
    const rows = (state.taxTypes || []).filter((row) => rowMatches(row, term));
    const target = $("tax-type-list");
    if (!rows.length) {
      target.innerHTML = '<p class="empty">No tax types match the search.</p>';
      return;
    }
    const el = document.createElement("table");
    el.className = "tax-type-table";
    el.innerHTML =
      "<thead><tr><th>Code</th><th>Description</th><th>Direction</th><th>Current Rate</th><th>Active</th></tr></thead>";
    const body = document.createElement("tbody");
    rows.forEach((type) => {
      const row = document.createElement("tr");
      row.className = "click-row";
      const current = ratesForTaxType(type.tax_type_id).find(
        (rate) =>
          rate.is_active !== false &&
          dateOnly(rate.valid_from) <= today() &&
          (!rate.valid_to || dateOnly(rate.valid_to) >= today()),
      );
      row.innerHTML = `<td>${type.tax_type_code}</td><td>${type.tax_type_description}</td><td>${taxDirectionLabel(type.tax_direction)}</td><td>${current ? `${Number(current.tax_rate).toFixed(2)}%` : ""}</td><td>${type.is_active ? "Yes" : "No"}</td>`;
      row.addEventListener("click", () => openTaxTypeEditor(type));
      body.append(row);
    });
    el.append(body);
    target.innerHTML = "";
    target.append(el);
  }
  function renderTaxRateLines(rates = []) {
    const target = $("tax-rate-lines");
    target.innerHTML =
      '<div class="tax-rate-line-grid"><div class="tax-rate-line tax-rate-line-head"><span>Rate %</span><span>Valid From</span><span>Valid To</span><span>Active</span><span></span></div></div>';
    rates.forEach((rate) => addTaxRateLine(rate));
  }
  function addTaxRateLine(rate = {}) {
    const grid = $("tax-rate-lines").querySelector(".tax-rate-line-grid");
    const row = document.createElement("div");
    row.className = "tax-rate-line";
    row.dataset.taxRateId = rate.tax_rate_id || "";
    row.innerHTML =
      '<input class="tax-rate-value" type="number" step="0.0001" min="0" required><input class="tax-rate-from" type="date" required><input class="tax-rate-to" type="date"><label class="check"><input class="tax-rate-active" type="checkbox" checked> Active</label><button type="button" class="secondary danger">Delete</button>';
    grid.append(row);
    row.querySelector(".tax-rate-value").value = rate.tax_rate ?? 0;
    row.querySelector(".tax-rate-from").value =
      dateOnly(rate.valid_from) || today();
    row.querySelector(".tax-rate-to").value = dateOnly(rate.valid_to);
    row.querySelector(".tax-rate-active").checked = rate.is_active !== false;
    row.querySelector("button").addEventListener("click", async () => {
      const id = row.dataset.taxRateId;
      if (id) {
        if (!window.confirm("Delete this tax rate?")) return;
        await api("tax-types/delete-rate", {
          method: "POST",
          body: JSON.stringify({ tax_rate_id: id }),
        });
        await ensureTaxTypes(true);
        renderTaxTypes();
      }
      row.remove();
    });
  }
  function openTaxTypeEditor(type = {}) {
    $("tax-type-form").hidden = false;
    $("tax-type-form").reset();
    $("tax-type-id").value = type.tax_type_id || "";
    $("tax-type-code").value = type.tax_type_code || "";
    $("tax-type-description").value = type.tax_type_description || "";
    $("tax-type-direction").value = type.tax_direction || "none";
    $("tax-type-active").checked = type.is_active !== false;
    renderTaxRateLines(ratesForTaxType(type.tax_type_id));
  }
  function openNewTaxType() {
    openTaxTypeEditor({ is_active: true });
    renderTaxRateLines([{ tax_rate: 0, valid_from: today(), is_active: true }]);
  }
  function collectTaxRateLines() {
    return [
      ...document.querySelectorAll(".tax-rate-line:not(.tax-rate-line-head)"),
    ].map((row) => ({
      tax_rate_id: row.dataset.taxRateId || "",
      tax_rate: row.querySelector(".tax-rate-value").value,
      valid_from: row.querySelector(".tax-rate-from").value,
      valid_to: row.querySelector(".tax-rate-to").value,
      is_active: row.querySelector(".tax-rate-active").checked,
    }));
  }
  function renderLedgerFamilies() {
    const term = searchTerm("ledgerfamily-search");
    const rows = state.subledgerAccountTypes.filter((row) =>
      rowMatches(row, term),
    );
    const target = $("ledger-family-list");
    if (!rows.length) {
      target.innerHTML =
        '<p class="empty">No subledger account types match the search.</p>';
      return;
    }
    const el = document.createElement("table");
    el.className = "ledger-family-table";
    el.innerHTML =
      "<thead><tr><th>Code</th><th>Name</th><th>Description</th><th>Workflow</th><th>Modules</th><th>Legal entity</th><th>Active</th></tr></thead>";
    const body = document.createElement("tbody");
    rows.forEach((type) => {
      const row = document.createElement("tr");
      row.className = "click-row";
      row.innerHTML = `<td>${type.type_code}</td><td>${type.type_name}</td><td>${type.type_description || ""}</td><td>${workflowPathForType(type)?.path_name || ""}</td><td>${moduleNames(type)}</td><td>${type.requires_legal_entity ? "Required" : "Optional"}</td><td>${type.is_active ? "Yes" : "No"}</td>`;
      row.addEventListener("click", () => selectLedgerFamily(type));
      body.append(row);
    });
    el.append(body);
    target.innerHTML = "";
    target.append(el);
  }
  function renderModules() {
    const rows = state.modules.filter((row) =>
      rowMatches(row, searchTerm("module-search")),
    );
    table(
      $("module-list"),
      [
        ["Code", (r) => r.module_code],
        ["Name", (r) => r.module_name],
        ["Description", (r) => r.module_description || ""],
        ["Active", (r) => (r.is_active ? "Yes" : "No")],
      ],
      rows,
      openModule,
    );
  }
  function openModule(row = {}) {
    $("module-form").hidden = false;
    $("module-form").reset();
    $("module-id").value = row.module_id || "";
    $("module-code").value = row.module_code || "";
    $("module-code").readOnly = !!row.module_id;
    $("module-name").value = row.module_name || "";
    $("module-description").value = row.module_description || "";
    $("module-sort").value = row.sort_order || 0;
    $("module-active").checked = row.is_active !== false;
    $("module-icon-svg").value = row.module_icon_svg || "";
    renderModuleIconPreview();
  }
  function selectLedgerFamily(type) {
    $("ledger-family-form").hidden = false;
    showSetupTypeTab("ledger-family", "definition");
    $("ledger-family-id").value = type.subledger_account_type_id || "";
    $("ledger-family-code").value = type.type_code;
    $("ledger-family-code").readOnly = true;
    $("ledger-family-name").value = type.type_name;
    $("ledger-family-description").value = type.type_description || "";
    $("ledger-family-workflow-path").value =
      type.workflow_path_id || state.workflowPaths[0]?.workflow_path_id || "";
    $("ledger-family-legal-entity").checked = !!type.requires_legal_entity;
    $("ledger-family-schema").value = JSON.stringify(
      type.schema_json || {},
      null,
      2,
    );
    $("ledger-family-ui-schema").value = JSON.stringify(
      type.ui_schema_json || { sections: [] },
      null,
      2,
    );
    $("ledger-family-active").checked = !!type.is_active;
    fillModuleSelect("ledger-family-modules", type.module_ids);
  }
  function mappingsForLine(lineId) {
    return state.financialFormatMappings.filter(
      (mapping) => mapping.financial_statement_line_id === lineId,
    );
  }
  function renderFinancialFormats() {
    const rows = state.financialFormats.filter((row) =>
      rowMatches(row, searchTerm("financial-format-search")),
    );
    table(
      $("financial-format-list"),
      [
        ["Code", (r) => r.format_code],
        ["Name", (r) => r.format_name],
        ["Type", (r) => pretty(r.statement_type)],
        ["Active", (r) => (r.is_active ? "Yes" : "No")],
      ],
      rows,
      openFinancialFormatEditor,
    );
  }
  function openFinancialFormatEditor(format = {}) {
    selectedFinancialFormatId = format.financial_statement_format_id || "";
    $("financial-format-form").hidden = false;
    $("financial-format-form").reset();
    $("financial-format-id").value = format.financial_statement_format_id || "";
    $("financial-format-code").value = format.format_code || "";
    $("financial-format-name").value = format.format_name || "";
    $("financial-format-type").value = format.statement_type || "income";
    $("financial-format-active").checked = format.is_active !== false;
    const lines = state.financialFormatLines.filter(
      (line) =>
        line.financial_statement_format_id ===
        format.financial_statement_format_id,
    );
    renderFinancialFormatLines(
      lines.length
        ? lines
        : [
            {
              line_code: "REV",
              line_label: "Revenue",
              line_type: "account_group",
              sort_order: 100,
              is_active: true,
            },
          ],
    );
  }
  function financialLineKey(line = {}) {
    return (
      line.financial_statement_line_id ||
      `new_${Math.random().toString(16).slice(2)}`
    );
  }
  function refreshFinancialLineParents() {
    const rows = [
      ...document.querySelectorAll(".financial-line:not(.financial-line-head)"),
    ];
    const options = rows.map((row) => ({
      key: row.dataset.lineKey,
      label:
        row.querySelector(".financial-line-code").value ||
        row.querySelector(".financial-line-label").value ||
        "Line",
    }));
    rows.forEach((row) => {
      const current = row.querySelector(".financial-line-parent").value;
      row.querySelector(".financial-line-parent").innerHTML =
        '<option value="">None</option>' +
        options
          .filter((option) => option.key !== row.dataset.lineKey)
          .map(
            (option) =>
              `<option value="${option.key}">${option.label}</option>`,
          )
          .join("");
      row.querySelector(".financial-line-parent").value = current;
    });
  }
  function renderFinancialFormatLines(lines = []) {
    const target = $("financial-format-lines");
    target.innerHTML =
      '<div class="financial-line-grid"><div class="financial-line financial-line-head"><span>Order</span><span>Code</span><span>Label</span><span>Type</span><span>Parent</span><span>Formula JSON</span><span>GL Accounts</span><span></span></div></div>';
    lines.forEach((line) => addFinancialFormatLine(line));
    refreshFinancialLineParents();
  }
  function addFinancialFormatLine(line = {}) {
    const row = document.createElement("div");
    row.className = "financial-line";
    row.dataset.lineKey = financialLineKey(line);
    row.innerHTML =
      '<input class="financial-line-order" type="number" step="10"><input class="financial-line-code" required><input class="financial-line-label" required><select class="financial-line-type"><option value="header">Header</option><option value="account_group">Account Group</option><option value="formula">Formula</option></select><select class="financial-line-parent"></select><textarea class="financial-line-formula" rows="2"></textarea><select class="financial-line-accounts" multiple></select><button type="button" class="secondary">Remove</button>';
    $("financial-format-lines")
      .querySelector(".financial-line-grid")
      .append(row);
    row.querySelector(".financial-line-order").value = line.sort_order ?? 0;
    row.querySelector(".financial-line-code").value = line.line_code || "";
    row.querySelector(".financial-line-label").value = line.line_label || "";
    row.querySelector(".financial-line-type").value =
      line.line_type || "account_group";
    row.querySelector(".financial-line-formula").value = JSON.stringify(
      line.formula_json || {},
      null,
      2,
    );
    option(
      row.querySelector(".financial-line-accounts"),
      state.accounts.filter((account) => account.account_kind === "gl"),
      "account_id",
      (account) => `${account.account_code} - ${account.account_name}`,
    );
    mappingsForLine(line.financial_statement_line_id).forEach((mapping) => {
      const mapped = row.querySelector(
        `.financial-line-accounts option[value="${mapping.gl_account_id}"]`,
      );
      if (mapped) mapped.selected = true;
    });
    row
      .querySelector(".financial-line-code")
      .addEventListener("input", refreshFinancialLineParents);
    row
      .querySelector(".financial-line-label")
      .addEventListener("input", refreshFinancialLineParents);
    row.querySelector("button").addEventListener("click", () => {
      row.remove();
      refreshFinancialLineParents();
    });
    refreshFinancialLineParents();
    row.querySelector(".financial-line-parent").value =
      line.parent_line_id || "";
  }
  function collectFinancialFormatLines() {
    const rows = [
      ...document.querySelectorAll(".financial-line:not(.financial-line-head)"),
    ];
    const lineKeys = new Set(rows.map((row) => row.dataset.lineKey));
    return rows.map((row) => {
      const parent = row.querySelector(".financial-line-parent").value;
      return {
        client_key: row.dataset.lineKey,
        line_code: row.querySelector(".financial-line-code").value,
        line_label: row.querySelector(".financial-line-label").value,
        line_type: row.querySelector(".financial-line-type").value,
        parent_client_key: lineKeys.has(parent) ? parent : "",
        sort_order: row.querySelector(".financial-line-order").value,
        formula_json:
          row.querySelector(".financial-line-formula").value || "{}",
        account_ids: [
          ...row.querySelector(".financial-line-accounts").selectedOptions,
        ].map((option) => option.value),
        is_active: true,
      };
    });
  }
  function openNewFinancialFormat() {
    openFinancialFormatEditor({ statement_type: "income", is_active: true });
  }
  function renderPeriodGrid(target, year) {
    const periods = state.periods
      .filter((p) => p.fiscal_year_id === year.fiscal_year_id)
      .sort((a, b) => a.period_number - b.period_number);
    const toolbar = document.createElement("div");
    toolbar.className = "period-toolbar";
    const add = document.createElement("button");
    add.type = "button";
    add.className = "add-record-button";
    add.textContent = "+";
    add.setAttribute("aria-label", `Add period to ${year.fiscal_year_code}`);
    add.addEventListener("click", () => openNewFiscalPeriod(year));
    toolbar.append(add);
    target.innerHTML = "";
    target.append(toolbar);
    if (!periods.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "No fiscal periods defined for this year.";
      target.append(empty);
      return;
    }
    const tableEl = document.createElement("table");
    tableEl.className = "period-grid";
    tableEl.innerHTML =
      "<thead><tr><th>Number</th><th>Code</th><th>Start</th><th>End</th><th>Status</th></tr></thead>";
    const body = document.createElement("tbody");
    periods.forEach((period) => {
      const row = document.createElement("tr");
      row.className = "click-row";
      row.innerHTML = `<td>${period.period_number}</td><td>${period.period_code}</td><td>${dateOnly(period.start_date)}</td><td>${dateOnly(period.end_date)}</td><td>${pretty(period.status)}</td>`;
      row.addEventListener("click", () => selectFiscalPeriod(period));
      body.append(row);
    });
    tableEl.append(body);
    target.append(tableEl);
  }
  function nextPeriodNumber(yearId) {
    const numbers = state.periods
      .filter((p) => p.fiscal_year_id === yearId)
      .map((p) => Number(p.period_number) || 0);
    return Math.max(0, ...numbers) + 1;
  }
  function showFiscalEditor() {
    $("fiscal-editor-panel").hidden = false;
    $("fiscal-period-panel").hidden = true;
  }
  function showFiscalPeriodEditor() {
    $("fiscal-period-panel").hidden = false;
    $("fiscal-editor-panel").hidden = true;
  }
  function hideFiscalPeriodEditor() {
    $("fiscal-period-panel").hidden = true;
  }
  function selectFiscalYear(year) {
    showFiscalEditor();
    $("fiscal-year-id").value = year.fiscal_year_id;
    $("fiscal-code").value = year.fiscal_year_code;
    $("fiscal-start").value = dateOnly(year.start_date);
    $("fiscal-end").value = dateOnly(year.end_date);
    $("fiscal-status").value = year.status || "open";
    $("period-year-id").value = year.fiscal_year_id;
    hideFiscalPeriodEditor();
  }
  function selectFiscalPeriod(period) {
    const year = state.years.find(
      (y) => y.fiscal_year_id === period.fiscal_year_id,
    );
    if (year) selectFiscalYear(year);
    $("fiscal-period-id").value = period.fiscal_period_id;
    $("period-year-id").value = period.fiscal_year_id;
    $("period-number").value = period.period_number;
    $("period-start").value = dateOnly(period.start_date);
    $("period-end").value = dateOnly(period.end_date);
    $("period-status").value = period.status || "open";
    showFiscalPeriodEditor();
  }
  function resetFiscalYearForm() {
    showFiscalEditor();
    $("fiscal-form").reset();
    $("fiscal-year-id").value = "";
    $("fiscal-status").value = "open";
    $("fiscal-periods").checked = true;
    hideFiscalPeriodEditor();
  }
  function resetFiscalPeriodForm() {
    showFiscalPeriodEditor();
    $("fiscal-period-form").reset();
    $("fiscal-period-id").value = "";
    $("period-status").value = "open";
    if (!$("period-year-id").value && $("fiscal-year-id").value)
      $("period-year-id").value = $("fiscal-year-id").value;
  }
  function openNewFiscalPeriod(year) {
    expandedFiscalYears.add(year.fiscal_year_id);
    selectFiscalYear(year);
    resetFiscalPeriodForm();
    $("period-year-id").value = year.fiscal_year_id;
    $("period-number").value = nextPeriodNumber(year.fiscal_year_id);
  }
  function renderAccounts() {
    const family = selectedAccountScopeCode || "gl";
    const term = searchTerm("account-search");
    const rows = state.accounts.filter(
      (account) => account.scope_code === family && rowMatches(account, term),
    );
    $("account-grid-title").textContent = labelForFamily(family);
    const columns =
      family === "gl"
        ? [
            ["Code", (r) => r.account_code],
            ["Name", (r) => r.account_name],
            ["Type", (r) => r.account_type_name || ""],
            [
              "Requires subledger",
              (r) =>
                r.requires_subledger
                  ? `Yes ${r.required_subledger_type_name || ""}`
                  : "No",
            ],
          ]
        : [
            ["Code", (r) => r.account_code],
            ["Name", (r) => r.account_name],
            ["Legal entity", (r) => r.legal_entity_known_name || ""],
            ["Owner", (r) => r.owner_division_name],
          ];
    table($("account-list"), columns, rows, (r) => {
      openAccountEditor(r);
    });
  }
  function addLegalIdentification(row = {}) {
    const target = $("legal-entity-identifications");
    const item = document.createElement("div");
    item.className = "legal-entity-line identification-line";
    item.innerHTML =
      '<input class="identification-type" placeholder="Type"><input class="identification-number" placeholder="Number"><input class="identification-authority" placeholder="Authority"><input class="identification-country" maxlength="2" placeholder="Country"><input class="identification-from" type="date"><input class="identification-to" type="date"><label class="check"><input class="identification-active" type="checkbox" checked> Active</label><button type="button" class="secondary">Remove</button>';
    target.append(item);
    item.querySelector(".identification-type").value =
      row.identification_type || "";
    item.querySelector(".identification-number").value =
      row.identification_number || "";
    item.querySelector(".identification-authority").value =
      row.issuing_authority || "";
    item.querySelector(".identification-country").value =
      row.country_code || "";
    item.querySelector(".identification-from").value =
      dateOnly(row.valid_from) || today();
    item.querySelector(".identification-to").value = dateOnly(row.valid_to);
    item.querySelector(".identification-active").checked =
      row.is_active !== false;
    item.querySelector("button").addEventListener("click", () => item.remove());
  }
  function addLegalAddress(row = {}) {
    const target = $("legal-entity-addresses");
    const item = document.createElement("div");
    item.className = "legal-entity-line address-line";
    item.innerHTML =
      '<input class="address-type" placeholder="Type"><input class="address-line1" placeholder="Line 1"><input class="address-line2" placeholder="Line 2"><input class="address-city" placeholder="City"><input class="address-region" placeholder="Region"><input class="address-postal" placeholder="Postal code"><input class="address-country" maxlength="2" placeholder="Country"><input class="address-from" type="date"><input class="address-to" type="date"><label class="check"><input class="address-primary" type="checkbox"> Primary</label><button type="button" class="secondary">Remove</button>';
    target.append(item);
    item.querySelector(".address-type").value = row.address_type || "";
    item.querySelector(".address-line1").value = row.address_line1 || "";
    item.querySelector(".address-line2").value = row.address_line2 || "";
    item.querySelector(".address-city").value = row.city || "";
    item.querySelector(".address-region").value = row.region || "";
    item.querySelector(".address-postal").value = row.postal_code || "";
    item.querySelector(".address-country").value = row.country_code || "";
    item.querySelector(".address-from").value =
      dateOnly(row.valid_from) || today();
    item.querySelector(".address-to").value = dateOnly(row.valid_to);
    item.querySelector(".address-primary").checked = !!row.is_primary;
    item.querySelector("button").addEventListener("click", () => item.remove());
  }
  function addLegalRelationship(row = {}) {
    const target = $("legal-entity-relationships");
    const item = document.createElement("div");
    item.className = "legal-entity-line relationship-line";
    item.innerHTML =
      '<select class="relationship-entity"></select><input class="relationship-type" placeholder="Type"><input class="relationship-title" placeholder="Role title"><input class="relationship-ownership" type="number" step="0.0001" placeholder="Ownership %"><input class="relationship-from" type="date"><input class="relationship-to" type="date"><label class="check"><input class="relationship-primary" type="checkbox"> Primary</label><button type="button" class="secondary">Remove</button>';
    target.append(item);
    option(
      item.querySelector(".relationship-entity"),
      state.legalEntities.filter(
        (e) => e.legal_entity_id !== selectedLegalEntity,
      ),
      "legal_entity_id",
      (e) => `${e.known_name} - ${e.legal_name}`,
      "Select legal entity",
    );
    item.querySelector(".relationship-entity").value =
      row.to_legal_entity_id || "";
    item.querySelector(".relationship-type").value =
      row.relationship_type || "";
    item.querySelector(".relationship-title").value = row.role_title || "";
    item.querySelector(".relationship-ownership").value =
      row.ownership_percentage ?? "";
    item.querySelector(".relationship-from").value =
      dateOnly(row.valid_from) || today();
    item.querySelector(".relationship-to").value = dateOnly(row.valid_to);
    item.querySelector(".relationship-primary").checked = !!row.is_primary;
    item.querySelector("button").addEventListener("click", () => item.remove());
  }
  function renderLegalEntityChildRows(
    identifications = [],
    addresses = [],
    relationships = [],
  ) {
    $("legal-entity-identifications").innerHTML = "";
    $("legal-entity-addresses").innerHTML = "";
    $("legal-entity-relationships").innerHTML = "";
    identifications.forEach(addLegalIdentification);
    addresses.forEach(addLegalAddress);
    relationships.forEach(addLegalRelationship);
  }
  function collectLegalIdentifications() {
    return [
      ...$("legal-entity-identifications").querySelectorAll(
        ".identification-line",
      ),
    ]
      .map((row) => ({
        identification_type: row.querySelector(".identification-type").value,
        identification_number: row.querySelector(".identification-number")
          .value,
        issuing_authority: row.querySelector(".identification-authority").value,
        country_code: row.querySelector(".identification-country").value,
        valid_from: row.querySelector(".identification-from").value,
        valid_to: row.querySelector(".identification-to").value,
        is_active: row.querySelector(".identification-active").checked,
      }))
      .filter((row) => row.identification_type || row.identification_number);
  }
  function collectLegalAddresses() {
    return [...$("legal-entity-addresses").querySelectorAll(".address-line")]
      .map((row) => ({
        address_type: row.querySelector(".address-type").value,
        address_line1: row.querySelector(".address-line1").value,
        address_line2: row.querySelector(".address-line2").value,
        city: row.querySelector(".address-city").value,
        region: row.querySelector(".address-region").value,
        postal_code: row.querySelector(".address-postal").value,
        country_code: row.querySelector(".address-country").value,
        valid_from: row.querySelector(".address-from").value,
        valid_to: row.querySelector(".address-to").value,
        is_primary: row.querySelector(".address-primary").checked,
      }))
      .filter((row) => row.address_type || row.address_line1);
  }
  function collectLegalRelationships() {
    return [
      ...$("legal-entity-relationships").querySelectorAll(".relationship-line"),
    ]
      .map((row) => ({
        to_legal_entity_id: row.querySelector(".relationship-entity").value,
        relationship_type: row.querySelector(".relationship-type").value,
        role_title: row.querySelector(".relationship-title").value,
        ownership_percentage: row.querySelector(".relationship-ownership")
          .value,
        valid_from: row.querySelector(".relationship-from").value,
        valid_to: row.querySelector(".relationship-to").value,
        is_primary: row.querySelector(".relationship-primary").checked,
      }))
      .filter((row) => row.to_legal_entity_id || row.relationship_type);
  }
  function resetLegalEntityForm() {
    selectedLegalEntity = null;
    state.legalEntityDetail = null;
    $("legal-entity-form").hidden = false;
    showLegalEntityTab("details");
    $("legal-entity-form").reset();
    $("legal-entity-id").value = "";
    $("legal-entity-type").value = "company";
    $("legal-entity-status").value = "draft";
    $("legal-entity-additional").value = "{}";
    renderLegalEntityChildRows();
    renderLegalEntityAccounts([]);
    loadEntityDocuments("legalEntity").catch((e) => alert(e.message));
  }
  async function openLegalEntityEditor(entity) {
    selectedLegalEntity = entity.legal_entity_id;
    $("legal-entity-form").hidden = false;
    showLegalEntityTab("details");
    $("legal-entity-id").value = entity.legal_entity_id || "";
    $("legal-entity-type").value = entity.entity_type || "company";
    $("legal-entity-legal-name").value = entity.legal_name || "";
    $("legal-entity-known-name").value = entity.known_name || "";
    $("legal-entity-status").value = entity.workflow_status || "draft";
    $("legal-entity-effective-from").value =
      dateOnly(entity.effective_from) || today();
    $("legal-entity-effective-to").value = dateOnly(entity.effective_to);
    $("legal-entity-additional").value = JSON.stringify(
      entity.additional_data || {},
      null,
      2,
    );
    const detail = await api(
      `legal-entities/detail?legal_entity_id=${encodeURIComponent(entity.legal_entity_id)}`,
    );
    state.legalEntityDetail = detail;
    const identifications = (detail.identifications || []).map((row) => ({
      identification_type: row.identification_type,
      identification_number: row.identification_number,
      issuing_authority: row.issuing_authority,
      country_code: row.country_code,
      valid_from: dateOnly(row.valid_from),
      valid_to: dateOnly(row.valid_to),
      is_active: row.is_active,
    }));
    const addresses = (detail.addresses || []).map((row) => ({
      address_type: row.address_type,
      address_line1: row.address_line1,
      address_line2: row.address_line2,
      city: row.city,
      region: row.region,
      postal_code: row.postal_code,
      country_code: row.country_code,
      valid_from: dateOnly(row.valid_from),
      valid_to: dateOnly(row.valid_to),
      is_primary: row.is_primary,
    }));
    const relationships = (detail.relationships || [])
      .filter((row) => row.from_legal_entity_id === entity.legal_entity_id)
      .map((row) => ({
        to_legal_entity_id: row.to_legal_entity_id,
        relationship_type: row.relationship_type,
        role_title: row.role_title,
        ownership_percentage: row.ownership_percentage,
        valid_from: dateOnly(row.valid_from),
        valid_to: dateOnly(row.valid_to),
        is_primary: row.is_primary,
      }));
    renderLegalEntityChildRows(identifications, addresses, relationships);
    renderLegalEntityAccounts(detail.accounts || []);
    loadEntityDocuments("legalEntity").catch((e) => alert(e.message));
  }
  function renderLegalEntities() {
    const rows = state.legalEntities.filter((row) =>
      rowMatches(row, searchTerm("legal-entity-search")),
    );
    table(
      $("legal-entity-list"),
      [
        ["Known name", (r) => r.known_name],
        ["Legal name", (r) => r.legal_name],
        ["Type", (r) => pretty(r.entity_type)],
        ["Status", (r) => pretty(r.workflow_status)],
        ["Accounts", (r) => r.account_count || 0],
        ["Balance", (r) => Number(r.total_balance || 0).toFixed(2)],
      ],
      rows,
      (r) => {
        openLegalEntityEditor(r).catch((e) => alert(e.message));
      },
    );
  }
  function renderLegalEntityAccounts(rows = []) {
    const total = rows.reduce(
      (sum, row) => sum + (Number(row.balance) || 0),
      0,
    );
    $("legal-entity-account-total").textContent =
      `Total balance: ${total.toFixed(2)}`;
    table(
      $("legal-entity-account-list"),
      [
        ["Type", (r) => r.type_name || ""],
        ["Code", (r) => r.account_code],
        ["Name", (r) => r.account_name],
        ["Debits", (r) => Number(r.debit_total || 0).toFixed(2)],
        ["Credits", (r) => Number(r.credit_total || 0).toFixed(2)],
        ["Balance", (r) => Number(r.balance || 0).toFixed(2)],
      ],
      rows,
    );
  }
  function openAccountingSetupType(kind, row = {}) {
    const prefix =
      kind === "object"
        ? "accounting-object-type"
        : "accounting-dimension-type";
    $(`${prefix}-form`).hidden = false;
    showSetupTypeTab(prefix, "definition");
    $(`${prefix}-id`).value =
      row.accounting_object_type_id || row.accounting_dimension_type_id || "";
    $(`${prefix}-code`).value = row.type_code || "";
    $(`${prefix}-code`).readOnly = !!(
      row.accounting_object_type_id || row.accounting_dimension_type_id
    );
    $(`${prefix}-name`).value = row.type_name || "";
    $(`${prefix}-description`).value = row.type_description || "";
    $(`${prefix}-schema`).value = JSON.stringify(
      row.schema_json || { type: "object", properties: {} },
      null,
      2,
    );
    $(`${prefix}-ui-schema`).value = JSON.stringify(
      row.ui_schema_json || { sections: [] },
      null,
      2,
    );
    $(`${prefix}-active`).checked = row.is_active !== false;
    if ($(`${prefix}-workflow-path`))
      $(`${prefix}-workflow-path`).value =
        row.workflow_path_id || state.workflowPaths[0]?.workflow_path_id || "";
    fillModuleSelect(`${prefix}-modules`, row.module_ids);
  }
  function renderAccountingSetupTypes(kind) {
    const isObject = kind === "object";
    const rows = (
      isObject ? state.accountingObjectTypes : state.accountingDimensionTypes
    ).filter((row) =>
      rowMatches(
        row,
        searchTerm(
          isObject
            ? "accounting-object-type-search"
            : "accounting-dimension-type-search",
        ),
      ),
    );
    const target = $(
      isObject
        ? "accounting-object-type-list"
        : "accounting-dimension-type-list",
    );
    table(
      target,
      [
        ["Code", (r) => r.type_code],
        ["Name", (r) => r.type_name],
        ["Description", (r) => r.type_description || ""],
        ["Workflow", (r) => workflowPathForType(r)?.path_name || ""],
        ["Modules", moduleNames],
        ["Active", (r) => (r.is_active ? "Yes" : "No")],
        ["Seeded", (r) => (r.is_seeded ? "Yes" : "No")],
      ],
      rows,
      (row) => openAccountingSetupType(kind, row),
    );
  }
  function accountingMasterConfig(kind) {
    const isObject = kind === "object";
    return {
      kind,
      isObject,
      recordsKey: isObject ? "accountingObjects" : "accountingDimensions",
      typesKey: isObject ? "accountingObjectTypes" : "accountingDimensionTypes",
      endpoint: isObject ? "accounting-objects" : "accounting-dimensions",
      viewId: isObject ? "accountingobjects" : "accountingdimensions",
      title: isObject ? "Accounting Objects" : "Accounting Dimensions",
      recordId: isObject ? "accounting_object_id" : "accounting_dimension_id",
      typeId: isObject
        ? "accounting_object_type_id"
        : "accounting_dimension_type_id",
      code: isObject ? "object_code" : "dimension_code",
      name: isObject ? "object_name" : "dimension_name",
      prefix: isObject ? "accounting-object" : "accounting-dimension",
      selected: () =>
        isObject ? selectedAccountingObject : selectedAccountingDimension,
      setSelected: (value) => {
        if (isObject) selectedAccountingObject = value;
        else selectedAccountingDimension = value;
      },
      selectedType: () =>
        isObject
          ? selectedAccountingObjectTypeId
          : selectedAccountingDimensionTypeId,
      setSelectedType: (value) => {
        if (isObject) selectedAccountingObjectTypeId = value;
        else selectedAccountingDimensionTypeId = value;
      },
    };
  }
  function fillAccountingMasterTypes(kind) {
    const config = accountingMasterConfig(kind);
    option(
      $(`${config.prefix}-type`),
      state[config.typesKey].filter((type) => type.is_active !== false),
      config.typeId,
      (type) => `${type.type_code} - ${type.type_name}`,
      "Select type",
    );
  }
  function accountingObjectParentLabel(row) {
    if (!row) return "";
    const type =
      row.parent_type_name ||
      row.type_name ||
      pretty(row.parent_type_code || row.type_code || "");
    const code = row.parent_object_code || row.object_code || "";
    const name = row.parent_object_name || row.object_name || "";
    return [type, code, name].filter(Boolean).join(" - ");
  }
  function accountingObjectParentKey(row) {
    return row?.accounting_object_id || row?.parent_accounting_object_id || "";
  }
  function renderAccountingObjectParentOptions() {
    const list = $("accounting-object-parent-options");
    if (!list) return;
    list.innerHTML = "";
    accountingObjectParentOptions.forEach((row) => {
      const option = document.createElement("option");
      option.value = accountingObjectParentLabel(row);
      option.dataset.id = accountingObjectParentKey(row);
      list.append(option);
    });
  }
  async function loadAccountingObjectParentOptions(term = "", currentId = "") {
    const params = new URLSearchParams({
      organisation_id: state.orgId,
      search: term || "",
    });
    if (currentId) params.set("exclude_accounting_object_id", currentId);
    const result = await api(`accounting-objects/search?${params.toString()}`);
    accountingObjectParentOptions = result.records || [];
    renderAccountingObjectParentOptions();
  }
  function syncAccountingObjectParentSelection() {
    const input = $("accounting-object-parent-search");
    const hidden = $("accounting-object-parent");
    if (!input || !hidden) return;
    const text = input.value.trim();
    if (!text) {
      hidden.value = "";
      input.dataset.selectedLabel = "";
      return;
    }
    if (hidden.value && input.dataset.selectedLabel === text) return;
    const matches = accountingObjectParentOptions.filter(
      (row) => accountingObjectParentLabel(row) === text,
    );
    const selected = matches.length === 1 ? matches[0] : null;
    hidden.value = selected?.accounting_object_id || "";
    input.dataset.selectedLabel = selected ? text : "";
  }
  function selectedAccountingMasterSchema(kind) {
    const config = accountingMasterConfig(kind);
    const typeId =
      $(`${config.prefix}-type`)?.value ||
      $(`${config.prefix}-type-select`)?.value ||
      config.selectedType();
    return (
      state[config.typesKey].find((type) => type[config.typeId] === typeId)
        ?.schema_json || {}
    );
  }
  function renderAccountingMasterDetailFields(kind, detail = {}) {
    const config = accountingMasterConfig(kind);
    renderSchemaDetailFields(
      `${config.prefix}-detail-fields`,
      selectedAccountingMasterSchema(kind),
      detail,
    );
  }
  function collectAccountingMasterDetail(kind) {
    const config = accountingMasterConfig(kind);
    return collectSchemaDetail(
      `${config.prefix}-detail-fields`,
      selectedAccountingMasterSchema(kind),
    );
  }
  function openAccountingMasterRecord(kind, row = {}) {
    const config = accountingMasterConfig(kind);
    const id = row[config.recordId] || "";
    config.setSelected(id || null);
    $(`${config.prefix}-form`).hidden = false;
    $(`${config.prefix}-id`).value = id;
    $(`${config.prefix}-type`).value =
      row[config.typeId] || $(`${config.prefix}-type-select`).value || "";
    $(`${config.prefix}-division`).value =
      row.owner_division_id || state.divisions[0]?.division_id || "";
    if (config.isObject) {
      accountingObjectParentOptions = [];
      if (row.parent_accounting_object_id) {
        accountingObjectParentOptions = [
          {
            accounting_object_id: row.parent_accounting_object_id,
            object_code: row.parent_object_code,
            object_name: row.parent_object_name,
            type_code: row.parent_type_code,
            type_name: row.parent_type_name,
          },
        ];
        renderAccountingObjectParentOptions();
      } else renderAccountingObjectParentOptions();
      $("accounting-object-parent").value =
        row.parent_accounting_object_id || "";
      $("accounting-object-parent-search").value =
        accountingObjectParentLabel(accountingObjectParentOptions[0]) || "";
      $("accounting-object-parent-search").dataset.selectedLabel = $(
        "accounting-object-parent-search",
      ).value;
      loadAccountingObjectParentOptions("", id).catch((e) => alert(e.message));
    }
    $(`${config.prefix}-code`).value = row[config.code] || "";
    $(`${config.prefix}-name`).value = row[config.name] || "";
    $(`${config.prefix}-valid-from`).value =
      dateOnly(row.valid_from) || today();
    $(`${config.prefix}-valid-to`).value = dateOnly(row.valid_to);
    renderAccountingMasterDetailFields(kind, row.additional_data || {});
    const type = state[config.typesKey].find(
      (type) => type[config.typeId] === row[config.typeId],
    );
    renderWorkflowHeader(`${config.prefix}-workflow-header`, row, (step) =>
      config.isObject
        ? moveAccountingObjectWorkflow(row, step).catch((e) => alert(e.message))
        : null,
    );
    renderWorkflowProgress(`${config.prefix}-workflow-progress`, type, row);
    renderWorkflowHistory(`${config.prefix}-workflow-history`, row);
  }
  function renderAccountingMaster(kind) {
    const config = accountingMasterConfig(kind);
    fillAccountingMasterTypes(kind);
    const typeSelect = $(`${config.prefix}-type-select`);
    const selectedType = typeSelect.value || config.selectedType();
    option(
      typeSelect,
      state[config.typesKey].filter((type) => type.is_active !== false),
      config.typeId,
      (type) => `${type.type_code} - ${type.type_name}`,
      "Select type",
    );
    if (selectedType) typeSelect.value = selectedType;
    if (!typeSelect.value && state[config.typesKey][0])
      typeSelect.value = state[config.typesKey][0][config.typeId];
    const rows = state[config.recordsKey].filter((row) =>
      rowMatches(row, searchTerm(`${config.prefix}-search`)),
    );
    const columns = config.isObject
      ? [
          ["Code", (r) => r[config.code]],
          ["Name", (r) => r[config.name]],
          [
            "Parent",
            (r) =>
              accountingObjectParentLabel({
                parent_type_name: r.parent_type_name,
                parent_object_code: r.parent_object_code,
                parent_object_name: r.parent_object_name,
              }),
          ],
          ["Owner", (r) => r.owner_division_name],
          [
            "Status",
            (r) =>
              workflowStatusButton({
                row: r,
                kind: "accounting_object",
                onMove: (step) =>
                  moveAccountingObjectWorkflow(r, step).catch((e) =>
                    alert(e.message),
                  ),
              }),
          ],
          ["Valid from", (r) => dateOnly(r.valid_from)],
          ["Valid to", (r) => dateOnly(r.valid_to)],
        ]
      : [
          ["Code", (r) => r[config.code]],
          ["Name", (r) => r[config.name]],
          ["Type", (r) => r.type_name],
          ["Owner", (r) => r.owner_division_name],
          ["Valid from", (r) => dateOnly(r.valid_from)],
          ["Valid to", (r) => dateOnly(r.valid_to)],
        ];
    table($(`${config.prefix}-list`), columns, rows, (row) =>
      openAccountingMasterRecord(kind, row),
    );
  }
  async function loadAccountingMasterRecords(kind) {
    const config = accountingMasterConfig(kind);
    const typeId =
      $(`${config.prefix}-type-select`)?.value ||
      state[config.typesKey][0]?.[config.typeId];
    if (!typeId) {
      state[config.recordsKey] = [];
      config.setSelectedType("");
      renderAccountingMaster(kind);
      return;
    }
    config.setSelectedType(typeId);
    const records = await api(
      `${config.endpoint}/list?organisation_id=${state.orgId}&${config.typeId}=${encodeURIComponent(typeId)}`,
    );
    state[config.recordsKey] = records.records || [];
    renderAccountingMaster(kind);
    highlightDynamicMenu();
  }
  function renderJournals() {
    const rows = selectedTransactionTypeId
      ? state.journals.filter(
          (journal) =>
            journal.transaction_type_id === selectedTransactionTypeId,
        )
      : state.journals;
    $("journal-grid-title").textContent = selectedTransactionTypeId
      ? labelForTransactionType(selectedTransactionTypeId)
      : "Transactions";
    table(
      $("journal-list"),
      [
        ["Date/time", (r) => journalDateTime(r)],
        ["Number", (r) => r.journal_number || "(draft)"],
        ["Description", (r) => r.description],
        ["Status", (r) => pretty(r.workflow_status)],
        ["Debits", (r) => r.debit_total],
        ["Credits", (r) => r.credit_total],
      ],
      rows,
      async (r) => {
        const d = await api(
          `journals/detail?journal_id=${encodeURIComponent(r.journal_id)}`,
        );
        selectedJournal = r.journal_id;
        $("journal-form").hidden = false;
        $("journal-id").value = r.journal_id;
        $("journal-type").value = r.transaction_type_id || "";
        $("journal-period").value = r.fiscal_period_id;
        $("journal-division").value = r.source_division_id;
        $("journal-date").value = dateOnly(r.journal_date);
        $("journal-description").value = r.description;
        $("journal-supplier").value = r.supplier_subledger_account_id || "";
        $("journal-vat-recipient").value =
          r.vat_recipient_legal_entity_id || "";
        $("journal-supplier-invoice-number").value =
          r.supplier_invoice_number || "";
        $("journal-supplier-invoice-date").value = dateOnly(
          r.supplier_invoice_date,
        );
        renderJournalLines(d.lines);
        setJournalEditable(r.workflow_status === "draft");
        loadEntityDocuments("journal").catch((e) => alert(e.message));
      },
    );
  }
  async function renderReport() {
    if ($("view-reports").hidden) return;
    const yearId = $("report-year").value || state.years[0]?.fiscal_year_id;
    if (!yearId) {
      $("report-result").innerHTML =
        '<p class="empty">No fiscal years defined.</p>';
      return;
    }
    const division = state.divisionId || $("report-division").value;
    const params = new URLSearchParams({
      organisation_id: state.orgId,
      report: selectedReport,
    });
    if (selectedReport === "ledger") params.set("fiscal_year_id", yearId);
    if (selectedReport === "financial_statement") {
      const formatId = $("report-format").value;
      const periodFrom = $("report-period-from").value;
      const periodTo = $("report-period-to").value;
      if (!formatId) {
        $("report-result").innerHTML =
          '<p class="empty">Choose a financial statement format before running the report.</p>';
        return;
      }
      if (!periodFrom || !periodTo) {
        $("report-result").innerHTML =
          '<p class="empty">Choose a period range before running the report.</p>';
        return;
      }
      params.set("format_id", formatId);
      params.set("period_from_id", periodFrom);
      params.set("period_to_id", periodTo);
      if (
        $("report-compare-year").value &&
        $("report-compare-period-from").value &&
        $("report-compare-period-to").value
      ) {
        params.set(
          "compare_period_from_id",
          $("report-compare-period-from").value,
        );
        params.set("compare_period_to_id", $("report-compare-period-to").value);
      }
    }
    if (division) params.set("division_id", division);
    const r = await api(`reports/financial?${params.toString()}`);
    if (selectedReport === "ledger") {
      table(
        $("report-result"),
        [
          ["Account", (row) => `${row.account_code} - ${row.account_name}`],
          ["Type", (row) => row.account_type_name || row.account_type_code],
          ["Debits", (row) => Number(row.debit_total || 0).toFixed(2)],
          ["Credits", (row) => Number(row.credit_total || 0).toFixed(2)],
          ["Balance", (row) => Number(row.balance || 0).toFixed(2)],
        ],
        r.rows || [],
      );
      return;
    }
    renderFinancialStatementResult(r.rows || []);
  }
  function renderFinancialStatementResult(rows) {
    if (!rows.length) {
      $("report-result").innerHTML =
        '<p class="empty">No statement lines configured for this format.</p>';
      return;
    }
    const hasCompare = rows.some((row) => row.comparative_amount !== undefined);
    const tableEl = document.createElement("table");
    tableEl.className = "financial-statement-table";
    tableEl.innerHTML = `<thead><tr><th>Line</th><th>Current</th>${hasCompare ? "<th>Comparative</th><th>Variance</th><th>Variance %</th>" : ""}</tr></thead>`;
    const body = document.createElement("tbody");
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.className = `statement-line statement-line-${row.line_type}`;
      const amount =
        row.amount === null ? "" : Number(row.amount || 0).toFixed(2);
      const compare =
        row.comparative_amount === null || row.comparative_amount === undefined
          ? ""
          : Number(row.comparative_amount || 0).toFixed(2);
      const variance =
        row.variance === null || row.variance === undefined
          ? ""
          : Number(row.variance || 0).toFixed(2);
      const variancePercent =
        row.variance_percent === null || row.variance_percent === undefined
          ? ""
          : `${Number(row.variance_percent || 0).toFixed(2)}%`;
      tr.innerHTML = `<td style="padding-left:${10 + (Number(row.depth) || 0) * 18}px">${row.line_label}</td><td>${amount}</td>${hasCompare ? `<td>${compare}</td><td>${variance}</td><td>${variancePercent}</td>` : ""}`;
      body.append(tr);
    });
    tableEl.append(body);
    $("report-result").innerHTML = "";
    $("report-result").append(tableEl);
  }
  function setJournalEditable(editable) {
    [
      "journal-type",
      "journal-period",
      "journal-division",
      "journal-date",
      "journal-description",
      "journal-supplier",
      "journal-vat-recipient",
      "journal-supplier-invoice-number",
      "journal-supplier-invoice-date",
      "add-journal-line",
      "journal-save",
    ].forEach((id) => {
      if ($(id)) $(id).disabled = !editable;
    });
    document
      .querySelectorAll(
        ".journal-line input,.journal-line select,.journal-line button",
      )
      .forEach((control) => {
        control.disabled = !editable || control.dataset.locked === "true";
      });
  }
  function defaultJournalLinesForType(typeId) {
    const definitions = state.lineDefinitions
      .filter(
        (line) =>
          line.transaction_type_id === typeId &&
          ["required", "generated"].includes(line.occurrence),
      )
      .sort((a, b) => Number(a.line_order || 0) - Number(b.line_order || 0));
    const lines = definitions.map((definition) => ({
      transaction_line_definition_id: definition.transaction_line_definition_id,
      division_id: $("journal-division").value || "",
      gl_account_id: definition.gl_account_id || "",
      subledger_account_id: "",
      subledger_account_type_id:
        definition.subledger_requirement !== "not_used"
          ? definition.subledger_account_type_id || ""
          : "",
      description: definition.line_description || "",
      debit_credit: definition.debit_credit || "debit",
      accounting_objects: (definition.object_requirements || [])
        .filter((item) => item.accounting_object_id)
        .map((item) => ({
          accounting_object_type_id: item.accounting_object_type_id,
          accounting_object_id: item.accounting_object_id,
        })),
      accounting_dimensions: (definition.dimension_requirements || [])
        .filter((item) => item.accounting_dimension_id)
        .map((item) => ({
          accounting_dimension_type_id: item.accounting_dimension_type_id,
          accounting_dimension_id: item.accounting_dimension_id,
        })),
      debit_amount: "",
      credit_amount: "",
    }));
    while (lines.length < 2) lines.push({});
    return lines;
  }
  function renderJournalLines(lines = [{}, {}]) {
    $("journal-lines").innerHTML =
      '<div class="journal-line-grid"><div class="journal-line journal-line-head"><span>Line definition</span><span>Division</span><span>GL Account</span><span>Subledger</span><span>Description</span><span>DR/CR</span><span>Amount</span><span>Actions</span></div></div>';
    lines.forEach((line) => addJournalLine(line));
    recalculateBalancingLines();
  }
  function recalculateBalancingLines() {
    const rows = [
      ...document.querySelectorAll(".journal-line:not(.journal-line-head)"),
    ];
    const balancing = rows.filter(
      (row) =>
        journalDefinitionFor(row.querySelector(".line-definition")?.value)
          ?.amount_source === "balancing",
    );
    balancing.forEach((target) => {
      const definition = journalDefinitionFor(
        target.querySelector(".line-definition").value,
      );
      let debits = 0;
      let credits = 0;
      rows
        .filter((row) => row !== target)
        .forEach((row) => {
          const amount = Number(row.querySelector(".line-amount").value) || 0;
          if (row.querySelector(".line-drcr").value === "debit")
            debits += amount;
          else credits += amount;
        });
      target.querySelector(".line-amount").value = Math.max(
        0,
        definition.debit_credit === "debit"
          ? credits - debits
          : debits - credits,
      ).toFixed(2);
    });
  }
  const classificationValueCache = new Map();
  async function classificationValues(kind, typeId) {
    if (!typeId) return [];
    const key = `${kind}:${typeId}`;
    if (!classificationValueCache.has(key)) {
      const idField =
        kind === "object"
          ? "accounting_object_type_id"
          : "accounting_dimension_type_id";
      const endpoint =
        kind === "object" ? "accounting-objects" : "accounting-dimensions";
      classificationValueCache.set(
        key,
        api(
          `${endpoint}/list?organisation_id=${state.orgId}&${idField}=${encodeURIComponent(typeId)}`,
        ).then((result) => result.records || []),
      );
    }
    return classificationValueCache.get(key);
  }
  async function fillClassificationSelect(select, kind, typeId, selected = "") {
    const rows = await classificationValues(kind, typeId);
    const idField =
      kind === "object" ? "accounting_object_id" : "accounting_dimension_id";
    const codeField = kind === "object" ? "object_code" : "dimension_code";
    const nameField = kind === "object" ? "object_name" : "dimension_name";
    option(
      select,
      rows,
      idField,
      (row) => `${row[codeField]} - ${row[nameField]}`,
      "Select value",
    );
    select.value = selected || "";
  }
  function journalDefinitionFor(id) {
    return state.lineDefinitions.find(
      (item) => item.transaction_line_definition_id === id,
    );
  }
  function renderJournalClassifications(row, definition, line = {}) {
    const target = row.querySelector(".journal-line-classifications");
    target.innerHTML = "";
    if (!definition) return;
    const render = (kind, requirements, captured, typeIdField, valueIdField) =>
      (requirements || []).forEach((requirement) => {
        const selected =
          (captured || []).find(
            (item) => item[typeIdField] === requirement[typeIdField],
          )?.[valueIdField] ||
          requirement[valueIdField] ||
          "";
        const wrapper = document.createElement("label");
        wrapper.className = "journal-classification";
        wrapper.innerHTML = `<span>${requirement.type_name}${requirement.requirement === "mandatory" ? " *" : ""} <small>${pretty(requirement.value_behaviour)}</small></span><select data-classification-kind="${kind}" data-type-id="${requirement[typeIdField]}"></select>`;
        target.append(wrapper);
        const select = wrapper.querySelector("select");
        fillClassificationSelect(
          select,
          kind,
          requirement[typeIdField],
          selected,
        ).catch((error) => alert(error.message));
        if (requirement.value_behaviour === "fixed") {
          select.dataset.locked = "true";
          select.disabled = true;
        }
      });
    render(
      "object",
      definition.object_requirements,
      line.accounting_objects,
      "accounting_object_type_id",
      "accounting_object_id",
    );
    render(
      "dimension",
      definition.dimension_requirements,
      line.accounting_dimensions,
      "accounting_dimension_type_id",
      "accounting_dimension_id",
    );
  }
  function applyJournalDefinition(row, definition, line = {}) {
    row.dataset.subledgerType =
      definition?.subledger_requirement !== "not_used"
        ? definition?.subledger_account_type_id || ""
        : "";
    row.querySelector(".line-gl").value =
      definition?.gl_account_id || line.gl_account_id || "";
    row.querySelector(".line-gl").dataset.locked = definition
      ? "true"
      : "false";
    row.querySelector(".line-gl").disabled = !!definition;
    row.querySelector(".line-drcr").value =
      definition?.debit_credit || line.debit_credit || "debit";
    row.querySelector(".line-drcr").dataset.locked = definition
      ? "true"
      : "false";
    row.querySelector(".line-drcr").disabled = !!definition;
    row.querySelector(".line-amount").dataset.locked =
      definition?.amount_source === "balancing" ? "true" : "false";
    row.querySelector(".line-amount").dataset.locked =
      definition?.amount_source === "balancing" ? "true" : "false";
    row.querySelector(".line-amount").disabled =
      definition?.amount_source === "balancing";
    row.querySelector(".line-description").value =
      line.description || definition?.line_description || "";
    syncJournalLineSubledgerOptions(row);
    row.querySelector(".line-sub").value =
      line.subledger_account_id ||
      (definition?.subledger_type_code === "vendor"
        ? $("journal-supplier")?.value
        : "") ||
      "";
    renderJournalClassifications(row, definition, line);
  }
  function addJournalLine(line = {}) {
    const row = document.createElement("div");
    row.className = "journal-line";
    row.dataset.subledgerType = line.subledger_account_type_id || "";
    row.innerHTML =
      '<select class="line-definition"></select><select class="line-division"></select><select class="line-gl"></select><select class="line-sub"></select><input class="line-description" placeholder="Description"><select class="line-drcr"><option value="debit">DR</option><option value="credit">CR</option></select><input class="line-amount" type="number" min="0" step="0.01" placeholder="Amount"><button type="button" class="secondary">Remove</button><div class="journal-line-classifications"></div>';
    let grid = $("journal-lines").querySelector(".journal-line-grid");
    if (!grid) {
      $("journal-lines").innerHTML =
        '<div class="journal-line-grid"><div class="journal-line journal-line-head"><span>Line definition</span><span>Division</span><span>GL Account</span><span>Subledger</span><span>Description</span><span>DR/CR</span><span>Amount</span><span>Actions</span></div></div>';
      grid = $("journal-lines").querySelector(".journal-line-grid");
    }
    grid.append(row);
    const definitions = state.lineDefinitions.filter(
      (item) => item.transaction_type_id === $("journal-type").value,
    );
    option(
      row.querySelector(".line-definition"),
      definitions,
      "transaction_line_definition_id",
      (item) => item.line_description || item.line_code,
      "Additional line",
    );
    row.querySelector(".line-definition").value =
      line.transaction_line_definition_id || "";
    option(
      row.querySelector(".line-division"),
      state.divisions,
      "division_id",
      (d) => d.division_name,
    );
    fillAccountSelects();
    row.querySelector(".line-division").value =
      line.division_id || $("journal-division").value || "";
    applyJournalDefinition(
      row,
      journalDefinitionFor(line.transaction_line_definition_id),
      line,
    );
    row.querySelector(".line-definition").addEventListener("change", () => {
      applyJournalDefinition(
        row,
        journalDefinitionFor(row.querySelector(".line-definition").value),
        {},
      );
      recalculateBalancingLines();
    });
    row
      .querySelector(".line-gl")
      .addEventListener("change", () => syncJournalLineSubledgerOptions(row));
    const debit = Number(line.debit_amount) || 0;
    const credit = Number(line.credit_amount) || 0;
    row.querySelector(".line-drcr").value =
      debit > 0
        ? "debit"
        : credit > 0
          ? "credit"
          : line.debit_credit || "debit";
    row.querySelector(".line-amount").value = debit || credit || "";
    const definition = journalDefinitionFor(
      line.transaction_line_definition_id,
    );
    row.querySelector(".line-amount").disabled =
      definition?.amount_source === "balancing";
    row
      .querySelector(".line-amount")
      .addEventListener("input", recalculateBalancingLines);
    row
      .querySelector(".line-drcr")
      .addEventListener("change", recalculateBalancingLines);
    row.querySelector("button").addEventListener("click", () => {
      row.remove();
      recalculateBalancingLines();
    });
  }
  function renderTransactionGroups() {
    const term = searchTerm("transactiongroup-search");
    const groups = state.transactionGroups.filter((row) =>
      rowMatches(row, term),
    );
    table(
      $("transaction-group-list"),
      [
        ["Code", (r) => r.group_code],
        ["Name", (r) => r.group_name],
        ["Sort", (r) => r.sort_order],
        ["Active", (r) => (r.is_active ? "Yes" : "No")],
      ],
      groups,
      selectTransactionGroup,
    );
  }
  function renderTransactionTypes() {
    const term = searchTerm("transactiontype-search");
    const types = state.transactionTypes.filter((row) => rowMatches(row, term));
    table(
      $("transaction-reference"),
      [
        ["Code", (r) => r.type_code],
        ["Name", (r) => r.type_name],
        ["Group", (r) => r.group_name],
        ["Modules", moduleNames],
        ["Financial", (r) => (r.is_financial ? "Yes" : "No")],
        [
          "Lines",
          (r) =>
            state.lineDefinitions.filter(
              (line) => line.transaction_type_id === r.transaction_type_id,
            ).length,
        ],
        ["Additional", (r) => (r.allow_additional_lines ? "Yes" : "No")],
      ],
      types,
      (row) => selectTransactionType(row).catch((e) => alert(e.message)),
    );
  }
  function selectWorkflowPath(path) {
    $("workflow-form").hidden = false;
    $("workflow-path-id").value = path.workflow_path_id || "";
    $("workflow-path-name").value = path.path_name || "";
    $("workflow-path-active").checked = path.is_active !== false;
    $("workflow-path-meta").textContent = path.is_seeded ? "Seeded" : "Custom";
    const steps = workflowStepsForPath(path.workflow_path_id);
    renderWorkflowStepLines(
      steps.length
        ? steps
        : [
            {
              step_code: "draft",
              step_label: "Draft",
              colour: "#475467",
              sort_order: 10,
            },
          ],
    );
    renderWorkflowNextLines(
      state.workflowNext.filter(
        (row) => row.workflow_path_id === path.workflow_path_id,
      ),
    );
    syncWorkflowInitialOptions(path.initial_step_code);
  }
  function newWorkflowPath() {
    $("workflow-form").hidden = false;
    $("workflow-form").reset();
    $("workflow-path-id").value = "";
    $("workflow-path-meta").textContent = "New";
    $("workflow-path-active").checked = true;
    renderWorkflowStepLines([
      {
        step_code: "draft",
        step_label: "Draft",
        colour: "#475467",
        sort_order: 10,
      },
    ]);
    renderWorkflowNextLines([]);
    syncWorkflowInitialOptions("draft");
  }
  function renderWorkflows() {
    const term = searchTerm("workflow-search");
    const paths = state.workflowPaths.filter((row) => rowMatches(row, term));
    table(
      $("workflow-list"),
      [
        ["Name", (r) => r.path_name],
        [
          "Initial step",
          (r) =>
            workflowStepPreviewNode(
              workflowStepsForPath(r.workflow_path_id).find(
                (step) => step.step_code === r.initial_step_code,
              ) || {
                step_code: r.initial_step_code,
                step_label: pretty(r.initial_step_code),
              },
            ),
        ],
        ["Steps", (r) => workflowStepsForPath(r.workflow_path_id).length],
        [
          "Next",
          (r) =>
            state.workflowNext.filter(
              (next) => next.workflow_path_id === r.workflow_path_id,
            ).length,
        ],
        ["Active", (r) => (r.is_active ? "Yes" : "No")],
      ],
      paths,
      selectWorkflowPath,
    );
  }
  function syncWorkflowInitialOptions(selected = "") {
    const select = $("workflow-initial-step");
    if (!select) return;
    const steps = [
      ...document.querySelectorAll(
        ".workflow-step-line:not(.workflow-step-line-head)",
      ),
    ].map((row) => ({
      step_code: row.querySelector(".workflow-step-code").value,
      step_label: row.querySelector(".workflow-step-label").value,
    }));
    option(
      select,
      steps.filter((step) => step.step_code && step.step_label),
      "step_code",
      (step) => step.step_label,
      "Select initial step",
    );
    select.value = selected || steps[0]?.step_code || "";
    document
      .querySelectorAll(".workflow-next-current,.workflow-next-next")
      .forEach((nextSelect) => {
        const value = nextSelect.value;
        option(
          nextSelect,
          steps.filter((step) => step.step_code && step.step_label),
          "step_code",
          (step) => step.step_label,
          "Select step",
        );
        nextSelect.value = value;
      });
  }
  function renderWorkflowStepLines(lines = []) {
    $("workflow-step-lines").innerHTML =
      '<div class="workflow-step-line-grid"><div class="workflow-step-line workflow-step-line-head"><span>Preview</span><span>Code</span><span>Label</span><span>Colour</span><span>Sort</span><span></span></div></div>';
    lines.forEach((line) => addWorkflowStepLine(line));
  }
  function workflowStepPreviewNode(step) {
    const preview = document.createElement("span");
    preview.className = "workflow-step-preview";
    preview.style.setProperty("--workflow-colour", step.colour || "#667085");
    preview.append(workflowDot(step.colour));
    const label = document.createElement("span");
    label.textContent = step.step_label || pretty(step.step_code);
    preview.append(label);
    return preview;
  }
  function updateWorkflowStepPreview(row) {
    const preview = row.querySelector(".workflow-step-preview-cell");
    if (!preview) return;
    preview.innerHTML = "";
    preview.append(
      workflowStepPreviewNode({
        step_code: row.querySelector(".workflow-step-code")?.value,
        step_label: row.querySelector(".workflow-step-label")?.value,
        colour: row.querySelector(".workflow-step-colour")?.value,
      }),
    );
  }
  function addWorkflowStepLine(line = {}) {
    const grid = $("workflow-step-lines").querySelector(
      ".workflow-step-line-grid",
    );
    const row = document.createElement("div");
    row.className = "workflow-step-line";
    row.innerHTML =
      '<div class="workflow-step-preview-cell"></div><input class="workflow-step-code" required><input class="workflow-step-label" required><input class="workflow-step-colour" type="color" aria-label="Step colour"><input class="workflow-step-sort" type="number"><button type="button" class="secondary compact-remove" aria-label="Remove workflow step" title="Remove">x</button>';
    grid.append(row);
    row.querySelector(".workflow-step-code").value = line.step_code || "";
    row.querySelector(".workflow-step-label").value =
      line.step_label || line.step_name || "";
    row.querySelector(".workflow-step-colour").value =
      line.colour || line.color || "#667085";
    row.querySelector(".workflow-step-sort").value = line.sort_order || "";
    updateWorkflowStepPreview(row);
    row.querySelectorAll("input").forEach((input) =>
      input.addEventListener("input", () => {
        updateWorkflowStepPreview(row);
        syncWorkflowInitialOptions($("workflow-initial-step").value);
      }),
    );
    row.querySelector("button").addEventListener("click", () => {
      row.remove();
      syncWorkflowInitialOptions($("workflow-initial-step").value);
    });
  }
  function renderWorkflowNextLines(lines = []) {
    $("workflow-next-lines").innerHTML =
      '<div class="workflow-next-line-grid"><div class="workflow-next-line workflow-next-line-head"><span>Current step</span><span></span><span>Allowed next step</span><span></span></div></div>';
    lines.forEach((line) => addWorkflowNextLine(line));
  }
  function addWorkflowNextLine(line = {}) {
    const grid = $("workflow-next-lines").querySelector(
      ".workflow-next-line-grid",
    );
    const row = document.createElement("div");
    row.className = "workflow-next-line";
    row.innerHTML =
      '<select class="workflow-next-current"></select><span class="workflow-next-arrow" aria-hidden="true"></span><select class="workflow-next-next"></select><button type="button" class="secondary compact-remove" aria-label="Remove next step" title="Remove">x</button>';
    grid.append(row);
    syncWorkflowInitialOptions($("workflow-initial-step")?.value);
    row.querySelector(".workflow-next-current").value =
      line.current_step_code || "";
    row.querySelector(".workflow-next-next").value = line.next_step_code || "";
    row.querySelector("button").addEventListener("click", () => row.remove());
  }
  function collectWorkflowSteps() {
    return [
      ...document.querySelectorAll(
        ".workflow-step-line:not(.workflow-step-line-head)",
      ),
    ].map((row) => ({
      step_code: row.querySelector(".workflow-step-code").value,
      step_label: row.querySelector(".workflow-step-label").value,
      colour: row.querySelector(".workflow-step-colour").value,
      sort_order: row.querySelector(".workflow-step-sort").value,
    }));
  }
  function collectWorkflowNext() {
    return [
      ...document.querySelectorAll(
        ".workflow-next-line:not(.workflow-next-line-head)",
      ),
    ].map((row) => ({
      current_step_code: row.querySelector(".workflow-next-current").value,
      next_step_code: row.querySelector(".workflow-next-next").value,
    }));
  }
  function resourceLabel(permission) {
    if (permission.resource_kind === "gl_account") return "GL Accounts";
    if (permission.resource_kind === "legal_entity") return "Legal Entities";
    if (permission.resource_kind === "subledger_account")
      return permission.subledger_account_type_name || permission.resource_code;
    if (permission.resource_kind === "accounting_object")
      return permission.accounting_object_type_name || permission.resource_code;
    if (permission.resource_kind === "accounting_dimension")
      return (
        permission.accounting_dimension_type_name || permission.resource_code
      );
    return (
      [
        permission.transaction_group_name,
        permission.transaction_type_name || permission.transaction_type_code,
      ]
        .filter(Boolean)
        .join(": ") || permission.resource_code
    );
  }
  function renderRoles() {
    const term = searchTerm("permission-search");
    const matchingRoleIds = new Set([
      ...state.rolePermissions
        .filter(
          (row) =>
            rowMatches(row, term) ||
            resourceLabel(row).toLowerCase().includes(term),
        )
        .map((row) => row.role_id),
      ...state.roleUsers
        .filter((row) => rowMatches(row, term))
        .map((row) => row.role_id),
    ]);
    const roles = state.roles.filter(
      (row) => rowMatches(row, term) || matchingRoleIds.has(row.role_id),
    );
    const masterKinds = new Set([
      "gl_account",
      "legal_entity",
      "subledger_account",
      "accounting_object",
      "accounting_dimension",
    ]);
    table(
      $("role-list"),
      [
        ["Name", (r) => r.role_name],
        ["Description", (r) => r.role_description || ""],
        ["Setup administrator", (r) => (r.is_admin ? "Yes" : "No")],
        [
          "Users",
          (r) => state.roleUsers.filter((u) => u.role_id === r.role_id).length,
        ],
        [
          "Master permissions",
          (r) =>
            state.rolePermissions.filter(
              (p) =>
                p.role_id === r.role_id && masterKinds.has(p.resource_kind),
            ).length,
        ],
        [
          "Transaction permissions",
          (r) =>
            state.rolePermissions.filter(
              (p) =>
                p.role_id === r.role_id && p.resource_kind === "transaction",
            ).length,
        ],
        ["Active", (r) => (r.is_active ? "Yes" : "No")],
      ],
      roles,
      (role) => selectRole(role).catch((e) => alert(e.message)),
    );
  }
  function renderSetup() {
    renderTransactionGroups();
    renderTransactionTypes();
    renderWorkflows();
    renderRoles();
  }
  function selectTransactionGroup(group) {
    $("transaction-group-form").hidden = false;
    $("transaction-type-form").hidden = true;
    $("transaction-group-id").value = group.transaction_group_id;
    $("transaction-group-code").value = group.group_code;
    $("transaction-group-name").value = group.group_name;
    $("transaction-group-sort").value = group.sort_order || 0;
    $("transaction-group-active").checked = !!group.is_active;
  }
  function openNewTransactionGroup() {
    $("transaction-group-form").hidden = false;
    $("transaction-group-form").reset();
    $("transaction-group-id").value = "";
    $("transaction-group-sort").value = 0;
    $("transaction-group-active").checked = true;
  }
  async function selectTransactionType(type) {
    setTransactionTypeEditorOpen(true);
    $("transaction-group-form").hidden = true;
    showSetupTypeTab("transaction-type", "definition");
    await loadAccountsForFamily("gl");
    $("transaction-type-id").value = type.transaction_type_id;
    $("transaction-type-group").value = type.transaction_group_id;
    $("transaction-type-code").value = type.type_code;
    $("transaction-type-name").value = type.type_name;
    $("transaction-type-description").value = type.type_description || "";
    $("transaction-type-sort").value = type.sort_order || 0;
    $("transaction-type-financial").checked = type.is_financial !== false;
    $("transaction-type-additional-lines").checked =
      !!type.allow_additional_lines;
    $("transaction-type-active").checked = !!type.is_active;
    fillModuleSelect("transaction-type-modules", type.module_ids);
    renderTransactionTypeLines(
      state.lineDefinitions.filter(
        (line) => line.transaction_type_id === type.transaction_type_id,
      ),
    );
    updateTransactionTypeEditorTitle(type.type_name);
    toggleTransactionLineEditor();
  }
  async function openNewTransactionType() {
    setTransactionTypeEditorOpen(true);
    $("transaction-group-form").hidden = true;
    showSetupTypeTab("transaction-type", "definition");
    await loadAccountsForFamily("gl");
    $("transaction-type-form").reset();
    $("transaction-type-id").value = "";
    $("transaction-type-group").value =
      state.transactionGroups[0]?.transaction_group_id || "";
    $("transaction-type-sort").value = 0;
    $("transaction-type-financial").checked = true;
    $("transaction-type-additional-lines").checked = true;
    $("transaction-type-active").checked = true;
    fillModuleSelect("transaction-type-modules");
    renderTransactionTypeLines([{}, {}]);
    updateTransactionTypeEditorTitle();
    toggleTransactionLineEditor();
  }
  function toggleTransactionLineEditor() {
    const financial = $("transaction-type-financial").checked;
    const linesTab = $("transaction-type-form").querySelector(
      '[data-setup-type-tab="transaction-type"][data-tab="lines"]',
    );
    if (linesTab) linesTab.hidden = !financial;
    if (!financial && linesTab?.classList.contains("active"))
      showSetupTypeTab("transaction-type", "definition");
    $("transaction-line-editor").hidden = !financial;
    if (
      financial &&
      document.querySelectorAll(".transaction-type-line").length === 0
    )
      renderTransactionTypeLines([{}, {}]);
    if (!financial) $("transaction-type-lines").innerHTML = "";
  }
  function renderTransactionTypeLines(lines = []) {
    $("transaction-type-lines").innerHTML =
      '<div class="transaction-type-line-grid"></div>';
    lines.forEach((line) => addTransactionTypeLine(line, false));
  }
  function transactionLineSectionIcon(kind) {
    const paths = {
      posting: '<path d="M4 7h16M7 4v6M17 4v6M6 14h4v6H6zM14 14h4v6h-4z"/>',
      subledger: '<path d="M5 5h14v5H5zM5 14h14v5H5zM8 7.5h.01M8 16.5h.01"/>',
      object:
        '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="16" r="3"/><path d="m10.5 10.5 3 3M16 5v5M13.5 7.5h5"/>',
      dimension: '<path d="m12 3 8 5-8 5-8-5zM4 12l8 5 8-5M4 16l8 5 8-5"/>',
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[kind] || paths.posting}</svg>`;
  }
  function setExpandedTransactionTypeLine(activeRow) {
    document
      .querySelectorAll("#transaction-type-lines .transaction-type-line")
      .forEach((row) => {
        const expanded = row === activeRow;
        row.classList.toggle("is-expanded", expanded);
        row
          .querySelector(".transaction-line-summary")
          ?.setAttribute("aria-expanded", String(expanded));
        const details = row.querySelector(".transaction-type-line-details");
        if (details) details.hidden = !expanded;
      });
  }
  function selectedOptionText(select, fallback = "Not selected") {
    const option = select?.selectedOptions?.[0];
    return option?.value ? option.textContent : fallback;
  }
  function updateTransactionLineSummary(row) {
    const name =
      row.querySelector(".tx-line-description")?.value.trim() ||
      row.querySelector(".tx-line-code")?.value.trim() ||
      "Untitled line";
    const gl = selectedOptionText(
      row.querySelector(".tx-line-gl"),
      "GL not selected",
    );
    const badge =
      row.querySelector(".tx-line-drcr")?.value === "credit" ? "CR" : "DR";
    const analysis = [...row.querySelectorAll(".tx-classification-type")]
      .map((select) => selectedOptionText(select, ""))
      .filter(Boolean);
    row.querySelector(".transaction-line-summary-name").textContent = name;
    row.querySelector(".transaction-line-summary-gl").textContent = gl;
    row.querySelector(".transaction-line-summary-analysis").textContent =
      analysis.length ? analysis.join(" · ") : "No analysis requirements";
    row.querySelector(".transaction-line-summary-badge").textContent = badge;
  }
  function addLineClassificationRequirement(row, kind, requirement = {}) {
    const target = row.querySelector(
      kind === "object"
        ? ".tx-line-object-requirements"
        : ".tx-line-dimension-requirements",
    );
    const item = document.createElement("div");
    item.className = "tx-line-classification-requirement";
    item.innerHTML =
      '<select class="tx-classification-type" aria-label="Classification type"></select><select class="tx-classification-requirement" aria-label="Requirement"><option value="optional">Optional</option><option value="mandatory">Mandatory</option></select><select class="tx-classification-behaviour" aria-label="Value behaviour"><option value="captured">Captured on transaction</option><option value="defaulted">Defaulted, may change</option><option value="fixed">Fixed by transaction type</option></select><select class="tx-classification-value" aria-label="Default or fixed value"></select><button type="button" class="secondary tx-classification-remove" aria-label="Remove requirement">Remove</button>';
    target.append(item);
    item.querySelector(".tx-classification-type").required = true;
    const types =
      kind === "object"
        ? state.accountingObjectTypes
        : state.accountingDimensionTypes;
    const typeIdField =
      kind === "object"
        ? "accounting_object_type_id"
        : "accounting_dimension_type_id";
    const valueIdField =
      kind === "object" ? "accounting_object_id" : "accounting_dimension_id";
    option(
      item.querySelector(".tx-classification-type"),
      types.filter((type) => type.is_active !== false),
      typeIdField,
      (type) => type.type_name,
      "Select type",
    );
    item.querySelector(".tx-classification-type").value =
      requirement[typeIdField] || "";
    item.querySelector(".tx-classification-requirement").value =
      requirement.requirement || "optional";
    item.querySelector(".tx-classification-behaviour").value =
      requirement.value_behaviour || "captured";
    const refresh = () => {
      const captured =
        item.querySelector(".tx-classification-behaviour").value === "captured";
      const select = item.querySelector(".tx-classification-value");
      select.disabled = captured;
      select.required = !captured;
      if (!captured)
        fillClassificationSelect(
          select,
          kind,
          item.querySelector(".tx-classification-type").value,
          select.value || requirement[valueIdField] || "",
        ).catch((error) => alert(error.message));
      else
        select.innerHTML = '<option value="">Captured on transaction</option>';
      updateTransactionLineSummary(row);
    };
    item
      .querySelector(".tx-classification-type")
      .addEventListener("change", refresh);
    item
      .querySelector(".tx-classification-behaviour")
      .addEventListener("change", refresh);
    item
      .querySelector(".tx-classification-requirement")
      .addEventListener("change", () => updateTransactionLineSummary(row));
    item.querySelector("button").addEventListener("click", () => {
      item.remove();
      updateTransactionLineSummary(row);
    });
    refresh();
  }
  function addTransactionTypeLine(line = {}, expanded = true) {
    const row = document.createElement("div");
    row.className = "transaction-type-line";
    row.innerHTML = `<button type="button" class="transaction-line-summary" aria-expanded="false"><span class="transaction-line-summary-badge">DR</span><span class="transaction-line-summary-copy"><strong class="transaction-line-summary-name">Untitled line</strong><span class="transaction-line-summary-gl">GL not selected</span></span><span class="transaction-line-summary-analysis">No analysis requirements</span><span class="transaction-line-summary-chevron" aria-hidden="true">⌄</span></button><div class="transaction-type-line-details" hidden><section class="tx-line-section tx-line-posting"><div class="tx-line-section-heading"><span class="tx-line-section-icon">${transactionLineSectionIcon("posting")}</span><div><strong>Posting</strong><small>Line identity, amount and general ledger account</small></div><button type="button" class="secondary tx-line-remove">Remove line</button></div><div class="transaction-type-line-main"><label><span>Line code</span><input class="tx-line-code" placeholder="e.g. electricity_consumption"></label><label><span>Line name</span><input class="tx-line-description" placeholder="e.g. Electricity consumption"></label><label><span>Occurrence</span><select class="tx-line-occurrence"><option value="required">Required</option><option value="optional">Optional</option><option value="repeatable">Repeatable</option><option value="generated">Generated</option></select></label><label><span>Amount source</span><select class="tx-line-amount-source"><option value="manual">Manual amount</option><option value="balancing">Balancing amount</option></select></label><label><span>Debit / Credit</span><select class="tx-line-drcr"><option value="debit">Debit (DR)</option><option value="credit">Credit (CR)</option></select></label><label class="tx-line-gl-field"><span>General ledger account</span><select class="tx-line-gl"></select></label></div></section><section class="tx-line-section tx-line-subledger-section"><div class="tx-line-section-heading"><span class="tx-line-section-icon">${transactionLineSectionIcon("subledger")}</span><div><strong>Sub-ledger</strong><small>At most one sub-ledger type may be linked to this line</small></div></div><div class="tx-line-subledger-fields"><label><span>Requirement</span><select class="tx-line-subledger-requirement"><option value="not_used">Not used</option><option value="optional">Optional</option><option value="mandatory">Mandatory</option></select></label><label><span>Sub-ledger type</span><select class="tx-line-subledger"></select></label></div></section><div class="tx-line-classifications"><section class="tx-line-section"><div class="tx-line-section-heading"><span class="tx-line-section-icon">${transactionLineSectionIcon("object")}</span><div><strong>Accounting objects</strong><small>Business references configured for this organisation</small></div><button type="button" class="secondary tx-add-object">+ Add object type</button></div><div class="tx-classification-columns" aria-hidden="true"><span>Type</span><span>Requirement</span><span>Value behaviour</span><span>Default / fixed value</span><span></span></div><div class="tx-line-object-requirements"></div></section><section class="tx-line-section"><div class="tx-line-section-heading"><span class="tx-line-section-icon">${transactionLineSectionIcon("dimension")}</span><div><strong>Accounting dimensions</strong><small>Analytical classifications configured for this organisation</small></div><button type="button" class="secondary tx-add-dimension">+ Add dimension type</button></div><div class="tx-classification-columns" aria-hidden="true"><span>Type</span><span>Requirement</span><span>Value behaviour</span><span>Default / fixed value</span><span></span></div><div class="tx-line-dimension-requirements"></div></section></div></div>`;
    let grid = $("transaction-type-lines").querySelector(
      ".transaction-type-line-grid",
    );
    if (!grid) {
      renderTransactionTypeLines();
      grid = $("transaction-type-lines").querySelector(
        ".transaction-type-line-grid",
      );
    }
    grid.append(row);
    const glAccounts = state.accounts.filter(
      (account) =>
        account.account_kind === "gl" && account.workflow_status !== "deleted",
    );
    const subledgerTypes = state.subledgerAccountTypes.filter(
      (type) => type.is_active !== false,
    );
    option(
      row.querySelector(".tx-line-gl"),
      glAccounts,
      "account_id",
      (account) => `${account.account_code} - ${account.account_name}`,
      "Select GL account",
    );
    option(
      row.querySelector(".tx-line-subledger"),
      subledgerTypes,
      "subledger_account_type_id",
      (type) => type.type_name,
      "Select subledger account type",
    );
    row.querySelector(".tx-line-code").value = line.line_code || "";
    row.querySelector(".tx-line-drcr").value = line.debit_credit || "debit";
    row.querySelector(".tx-line-gl").value =
      line.gl_account_id || line.default_gl_account_id || "";
    row.querySelector(".tx-line-occurrence").value =
      line.occurrence || "required";
    row.querySelector(".tx-line-amount-source").value =
      line.amount_source || "manual";
    row.querySelector(".tx-line-subledger-requirement").value =
      line.subledger_requirement || "not_used";
    row.querySelector(".tx-line-subledger").value =
      line.subledger_account_type_id || "";
    row.querySelector(".tx-line-description").value =
      line.line_description || "";
    row.querySelector(".tx-line-gl").required = true;
    const syncSubledger = () => {
      const used =
        row.querySelector(".tx-line-subledger-requirement").value !==
        "not_used";
      const select = row.querySelector(".tx-line-subledger");
      select.closest("label").hidden = !used;
      select.required = used;
      if (!used) select.value = "";
      updateTransactionLineSummary(row);
    };
    const syncAmountSource = () => {
      const occurrence = row.querySelector(".tx-line-occurrence");
      const amount = row.querySelector(".tx-line-amount-source");
      if (amount.value === "balancing") occurrence.value = "generated";
      else if (occurrence.value === "generated" && amount.value !== "balancing")
        occurrence.value = "required";
    };
    row
      .querySelector(".tx-line-subledger-requirement")
      .addEventListener("change", syncSubledger);
    row
      .querySelector(".tx-line-amount-source")
      .addEventListener("change", syncAmountSource);
    row.querySelector(".tx-line-occurrence").addEventListener("change", () => {
      if (
        row.querySelector(".tx-line-occurrence").value !== "generated" &&
        row.querySelector(".tx-line-amount-source").value === "balancing"
      )
        row.querySelector(".tx-line-amount-source").value = "manual";
    });
    row.querySelector(".tx-line-remove").addEventListener("click", () => {
      const next = row.nextElementSibling || row.previousElementSibling;
      row.remove();
      if (next) setExpandedTransactionTypeLine(next);
    });
    row
      .querySelector(".tx-add-object")
      .addEventListener("click", () =>
        addLineClassificationRequirement(row, "object"),
      );
    row
      .querySelector(".tx-add-dimension")
      .addEventListener("click", () =>
        addLineClassificationRequirement(row, "dimension"),
      );
    row
      .querySelector(".transaction-line-summary")
      .addEventListener("click", () => setExpandedTransactionTypeLine(row));
    row
      .querySelectorAll(
        ".tx-line-code,.tx-line-description,.tx-line-drcr,.tx-line-gl",
      )
      .forEach((control) =>
        control.addEventListener("input", () =>
          updateTransactionLineSummary(row),
        ),
      );
    (line.object_requirements || []).forEach((requirement) =>
      addLineClassificationRequirement(row, "object", requirement),
    );
    (line.dimension_requirements || []).forEach((requirement) =>
      addLineClassificationRequirement(row, "dimension", requirement),
    );
    syncSubledger();
    updateTransactionLineSummary(row);
    if (expanded) setExpandedTransactionTypeLine(row);
  }
  async function selectRole(role) {
    const moduleData = await api(
      `permissions/role-modules?organisation_id=${state.orgId}&role_id=${role.role_id}`,
    );
    $("role-form").hidden = false;
    $("role-id").value = role.role_id;
    $("role-name").value = role.role_name;
    $("role-description").value = role.role_description || "";
    $("role-admin").checked = !!role.is_admin;
    $("role-active").checked = !!role.is_active;
    fillModuleSelect("role-modules", moduleData.module_ids || []);
    syncRoleModuleRequirement();
    renderMasterPermissionTree(
      state.rolePermissions.filter((p) => p.role_id === role.role_id),
    );
    renderPermissionLines(
      "transaction",
      state.rolePermissions.filter(
        (p) => p.role_id === role.role_id && p.resource_kind === "transaction",
      ),
    );
    renderRoleUserLines(
      state.roleUsers.filter((u) => u.role_id === role.role_id),
    );
    showRoleTab("users");
  }
  function openNewRole() {
    $("role-form").hidden = false;
    $("role-form").reset();
    $("role-id").value = "";
    $("role-active").checked = true;
    fillModuleSelect("role-modules");
    syncRoleModuleRequirement();
    renderMasterPermissionTree([]);
    renderPermissionLines("transaction", []);
    renderRoleUserLines([]);
    showRoleTab("users");
  }
  function syncRoleModuleRequirement() {
    $("role-modules").required = !$("role-admin").checked;
  }
  function showRoleTab(tab) {
    ["users", "modules", "master", "transaction"].forEach((name) => {
      $(`role-tab-${name}`).hidden = name !== tab;
      document
        .querySelectorAll("[data-role-tab]")
        .forEach((button) =>
          button.classList.toggle("active", button.dataset.roleTab === tab),
        );
    });
  }
  function renderMasterPermissionTree(lines = []) {
    const target = $("master-permission-lines");
    if (!target) return;
    target.innerHTML = "";
    target.className = "master-permission-tree";
    const masterKinds = new Set([
      "gl_account",
      "legal_entity",
      "subledger_account",
      "accounting_object",
      "accounting_dimension",
    ]);
    const permissions = lines.filter((line) =>
      masterKinds.has(line.resource_kind),
    );
    const findPermission = (kind, resourceCode, divisionId) =>
      permissions.find(
        (line) =>
          line.resource_kind === kind &&
          (line.resource_code === resourceCode || line.resource_code === "*") &&
          (line.division_id || "") === (divisionId || ""),
      );
    const makeLeaf = (kind, resourceCode, label, divisionId) => {
      const existing = findPermission(kind, resourceCode, divisionId);
      const leaf = document.createElement("label");
      leaf.className = "master-permission-leaf";
      leaf.dataset.resourceKind = kind;
      leaf.dataset.resourceCode = resourceCode;
      leaf.dataset.divisionId = divisionId || "";
      leaf.innerHTML =
        '<input type="checkbox" class="master-permission-check"><span></span><select class="master-permission-access" aria-label="Access level"><option value="view">View</option><option value="manage">Manage</option></select>';
      leaf.querySelector("span").textContent = label;
      leaf.querySelector("input").checked = !!existing;
      leaf.querySelector("select").value =
        existing?.workflow_status === "view" ? "view" : "manage";
      return leaf;
    };
    const syncGroup = (node) => {
      const group = node.querySelector(
        ":scope > .master-permission-heading .master-permission-group-check",
      );
      if (!group) return;
      const leaves = [
        ...node.querySelectorAll(
          ".master-permission-leaf .master-permission-check",
        ),
      ];
      group.checked =
        leaves.length > 0 && leaves.every((input) => input.checked);
      group.indeterminate =
        leaves.some((input) => input.checked) && !group.checked;
    };
    const syncAllGroups = () =>
      [...target.querySelectorAll(".master-permission-node")]
        .reverse()
        .forEach(syncGroup);
    const makeGroup = (label, level = 1) => {
      const node = document.createElement("div");
      node.className = `master-permission-node master-permission-level-${level}`;
      const heading = document.createElement("label");
      heading.className = "master-permission-heading";
      heading.innerHTML =
        '<input type="checkbox" class="master-permission-group-check"><span></span>';
      heading.querySelector("span").textContent = label;
      node.append(heading);
      heading.querySelector("input").addEventListener("change", (event) => {
        node
          .querySelectorAll(".master-permission-leaf .master-permission-check")
          .forEach((input) => {
            input.checked = event.target.checked;
          });
        syncAllGroups();
      });
      return node;
    };
    const addTypeGroup = (parent, label, kind, types, idKey, divisionId) => {
      const group = makeGroup(label, 2);
      const children = document.createElement("div");
      children.className = "master-permission-children";
      types
        .filter((type) => type.is_active !== false)
        .forEach((type) =>
          children.append(
            makeLeaf(
              kind,
              type[idKey],
              `${type.type_code} - ${type.type_name}`,
              divisionId,
            ),
          ),
        );
      group.append(children);
      parent.append(group);
    };
    const organisation = makeGroup("Organisation", 0);
    const organisationChildren = document.createElement("div");
    organisationChildren.className = "master-permission-children";
    organisationChildren.append(
      makeLeaf("gl_account", "*", "GL Accounts", null),
    );
    organisationChildren.append(
      makeLeaf("legal_entity", "*", "Legal Entities", null),
    );
    organisation.append(organisationChildren);
    target.append(organisation);
    const appendDivision = (division, parent) => {
      const node = makeGroup(
        `${division.division_code} - ${division.division_name}`,
        1,
      );
      const children = document.createElement("div");
      children.className = "master-permission-children";
      addTypeGroup(
        children,
        "Sub-Ledgers",
        "subledger_account",
        state.subledgerAccountTypes,
        "subledger_account_type_id",
        division.division_id,
      );
      addTypeGroup(
        children,
        "Accounting Objects",
        "accounting_object",
        state.accountingObjectTypes,
        "accounting_object_type_id",
        division.division_id,
      );
      addTypeGroup(
        children,
        "Accounting Dimensions",
        "accounting_dimension",
        state.accountingDimensionTypes,
        "accounting_dimension_type_id",
        division.division_id,
      );
      state.divisions
        .filter(
          (candidate) => candidate.parent_division_id === division.division_id,
        )
        .forEach((child) => appendDivision(child, children));
      node.append(children);
      parent.append(node);
    };
    state.divisions
      .filter((division) => !division.parent_division_id)
      .forEach((division) => appendDivision(division, organisationChildren));
    target
      .querySelectorAll(".master-permission-check")
      .forEach((input) => input.addEventListener("change", syncAllGroups));
    syncAllGroups();
  }
  function collectMasterPermissions() {
    return [
      ...$("master-permission-lines").querySelectorAll(
        ".master-permission-leaf",
      ),
    ]
      .filter((leaf) => leaf.querySelector(".master-permission-check").checked)
      .map((leaf) => ({
        division_id: leaf.dataset.divisionId || null,
        resource_kind: leaf.dataset.resourceKind,
        resource_code: leaf.dataset.resourceCode,
        workflow_status:
          leaf.querySelector(".master-permission-access").value === "view"
            ? "view"
            : "*",
      }));
  }
  function workflowPermissionOptionsFor(kind, resourceCode) {
    if (kind === "transaction")
      return transactionWorkflowOptions.map((value) => ({
        value,
        label:
          value === "*"
            ? "All workflow statuses"
            : value === "view"
              ? "View"
              : pretty(value),
      }));
    if (resourceCode === "*")
      return [
        { value: "view", label: "View" },
        { value: "*", label: "All workflow statuses" },
      ];
    const types =
      kind === "master" ? state.masterTypes : state.accountingObjectTypes;
    const idKey =
      kind === "master" ? "master_data_type_id" : "accounting_object_type_id";
    const type = types.find((row) => row[idKey] === resourceCode);
    const steps = workflowStepsForPath(type?.workflow_path_id).map((step) => ({
      value: step.step_code,
      label: step.step_label,
    }));
    return [{ value: "view", label: "View" }, ...steps];
  }
  function selectedPermissionResources(row) {
    const checks = row.querySelector(".permission-resource-checks");
    if (checks) {
      const values = [
        ...checks.querySelectorAll('input[type="checkbox"]:checked'),
      ].map((input) => input.value);
      return values.includes("*") ? ["*"] : values;
    }
    return [row.querySelector(".permission-resource")?.value || ""].filter(
      Boolean,
    );
  }
  function fillWorkflowPermissionSelect(row, kind, selected = "") {
    const resource = selectedPermissionResources(row)[0] || "";
    const options = workflowPermissionOptionsFor(kind, resource);
    const select = row.querySelector(".permission-workflow");
    select.innerHTML = options
      .map(
        (option) => `<option value="${option.value}">${option.label}</option>`,
      )
      .join("");
    select.value =
      selected && options.some((option) => option.value === selected)
        ? selected
        : options[0]?.value || "view";
  }
  function fillPermissionResourceCheckboxes(row, kind, selected = []) {
    const target = row.querySelector(".permission-resource-checks");
    if (!target) return;
    const wanted = new Set(selected.filter(Boolean));
    const resources =
      kind === "master"
        ? [
            { value: "*", label: "All master data types" },
            ...state.masterTypes.map((type) => ({
              value: type.master_data_type_id,
              label: `${type.type_code} - ${type.type_name}`,
            })),
          ]
        : [];
    target.innerHTML = resources
      .map(
        (resource) =>
          `<label class="check module-check"><input type="checkbox" value="${resource.value}" ${wanted.has(resource.value) ? "checked" : ""}> ${resource.label}</label>`,
      )
      .join("");
    target.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.addEventListener("change", () => {
        if (input.value === "*" && input.checked) {
          target.querySelectorAll('input[type="checkbox"]').forEach((other) => {
            if (other !== input) other.checked = false;
          });
        } else if (input.checked) {
          const all = target.querySelector('input[value="*"]');
          if (all) all.checked = false;
        }
        fillWorkflowPermissionSelect(
          row,
          kind,
          row.querySelector(".permission-workflow").value,
        );
      });
    });
  }
  function groupedPermissionLines(kind, lines = []) {
    if (kind !== "master") return lines;
    const groups = new Map();
    lines.forEach((line) => {
      const key = [line.division_id || "", line.workflow_status || ""].join(
        "|",
      );
      if (!groups.has(key)) groups.set(key, { ...line, resource_codes: [] });
      groups
        .get(key)
        .resource_codes.push(
          line.resource_code || line.master_data_type_id || "",
        );
    });
    return [...groups.values()];
  }
  function renderPermissionLines(kind, lines = []) {
    const target = $(
      kind === "master"
        ? "master-permission-lines"
        : kind === "accounting-object"
          ? "accounting-object-permission-lines"
          : "transaction-permission-lines",
    );
    if (!target) return;
    target.innerHTML = `<div class="permission-line-grid"><div class="permission-line permission-line-head"><span>Division</span><span>${kind === "master" ? "Master Data Types" : kind === "accounting-object" ? "Accounting Object Type" : "Transaction Type"}</span><span>Workflow</span><span>Actions</span></div></div>`;
    groupedPermissionLines(kind, lines).forEach((line) =>
      addPermissionLine(kind, line),
    );
  }
  function addPermissionLine(kind, line = {}) {
    const target = $(
      kind === "master"
        ? "master-permission-lines"
        : kind === "accounting-object"
          ? "accounting-object-permission-lines"
          : "transaction-permission-lines",
    );
    let grid = target.querySelector(".permission-line-grid");
    if (!grid) {
      renderPermissionLines(kind, []);
      grid = target.querySelector(".permission-line-grid");
    }
    const row = document.createElement("div");
    row.className = "permission-line";
    row.innerHTML =
      kind === "master"
        ? `<select class="permission-division"></select><div class="permission-resource-checks module-checklist"></div><select class="permission-workflow"></select><button type="button" class="secondary">Remove</button>`
        : `<select class="permission-division"></select><select class="permission-resource"></select><select class="permission-workflow"></select><button type="button" class="secondary">Remove</button>`;
    grid.append(row);
    const divisionLabel = (d) =>
      `${"  ".repeat(Number(d.depth) || 0)}${d.division_code} - ${d.division_name}`;
    option(
      row.querySelector(".permission-division"),
      state.divisions,
      "division_id",
      divisionLabel,
      "Select division",
    );
    if (kind === "master") {
      fillPermissionResourceCheckboxes(
        row,
        kind,
        line.resource_codes || [
          line.resource_code || line.master_data_type_id || "",
        ],
      );
    } else if (kind === "accounting-object") {
      option(
        row.querySelector(".permission-resource"),
        state.accountingObjectTypes.filter((type) => type.is_active !== false),
        "accounting_object_type_id",
        (type) => `${type.type_code} - ${type.type_name}`,
        "Select accounting object type",
      );
      row.querySelector(".permission-resource").value =
        line.resource_code || line.accounting_object_type_id || "";
    } else {
      option(
        row.querySelector(".permission-resource"),
        state.transactionTypes.filter((t) => t.is_active !== false),
        "transaction_type_id",
        (t) => `${t.group_name}: ${t.type_name}`,
        "Select transaction type",
      );
      prependOption(
        row.querySelector(".permission-resource"),
        "*",
        "All transaction types",
      );
      row.querySelector(".permission-resource").value =
        line.resource_code || line.transaction_type_id || "";
    }
    row.querySelector(".permission-division").value = line.division_id || "";
    fillWorkflowPermissionSelect(row, kind, line.workflow_status || "");
    row
      .querySelector(".permission-resource")
      ?.addEventListener("change", () =>
        fillWorkflowPermissionSelect(
          row,
          kind,
          row.querySelector(".permission-workflow").value,
        ),
      );
    row.querySelector("button").addEventListener("click", () => row.remove());
  }
  function renderRoleUserLines(lines = []) {
    $("role-user-lines").innerHTML =
      '<div class="role-user-line-grid"><div class="role-user-line role-user-line-head"><span>Email</span><span>Valid From</span><span>Valid To</span><span>Actions</span></div></div>';
    lines.forEach((line) => addRoleUserLine(line));
  }
  function addRoleUserLine(line = {}) {
    let grid = $("role-user-lines").querySelector(".role-user-line-grid");
    if (!grid) {
      renderRoleUserLines([]);
      grid = $("role-user-lines").querySelector(".role-user-line-grid");
    }
    const row = document.createElement("div");
    row.className = "role-user-line";
    row.innerHTML =
      '<input class="role-user-email" type="email" placeholder="user@example.com"><input class="role-user-from" type="date"><input class="role-user-to" type="date"><button type="button" class="secondary">Remove</button>';
    grid.append(row);
    row.querySelector(".role-user-email").value = line.email || "";
    row.querySelector(".role-user-from").value =
      dateOnly(line.valid_from) || today();
    row.querySelector(".role-user-to").value = dateOnly(line.valid_to);
    row.querySelector("button").addEventListener("click", () => row.remove());
  }
  function resetOrgLoadedState() {
    loadedSlices = {
      menu: false,
      dashboard: false,
      divisions: false,
      fiscal: false,
      countries: false,
      currencies: false,
      taxTypes: false,
      accountTypes: false,
      masterTypes: false,
      accountingObjectTypes: false,
      accountingDimensionTypes: false,
      legalEntities: false,
      financialFormats: false,
      transactions: false,
      permissions: false,
    };
    state.navigation = {
      roles: [],
      modules: [],
      permissions: [],
      is_administrator: false,
    };
    state.modules = [];
    state.currencies = [];
    state.countries = [];
    state.taxTypes = [];
    state.taxRates = [];
    state.divisions = [];
    state.years = [];
    state.periods = [];
    state.masterTypes = [];
    state.masterRecords = [];
    state.accountingObjectTypes = [];
    state.accountingDimensionTypes = [];
    state.accountingObjects = [];
    state.accountingDimensions = [];
    state.legalEntities = [];
    state.legalEntityDetail = null;
    state.journals = [];
    state.financialFormats = [];
    state.financialFormatLines = [];
    state.financialFormatMappings = [];
    state.transactionGroups = [];
    state.transactionTypes = [];
    state.lineDefinitions = [];
    state.workflowPaths = [];
    state.workflowSteps = [];
    state.workflowNext = [];
    state.subledgerAccountTypes = [];
    state.glAccountTypes = [];
    state.accounts = [];
    state.roles = [];
    state.rolePermissions = [];
    state.roleUsers = [];
    state.dashboardSummary = null;
    syncSetupAccess();
    loadedAccountFamilies = new Set();
  }
  async function loadDashboardData(force = false) {
    if (!state.orgId || (loadedSlices.dashboard && !force)) return;
    const orgId = state.orgId;
    loadedSlices.dashboard = false;
    state.dashboardSummary = null;
    renderDashboard();
    const summary = await api(`dashboard/summary?organisation_id=${orgId}`);
    if (state.orgId !== orgId) return;
    state.dashboardSummary = summary;
    loadedSlices.dashboard = true;
    renderDashboard();
  }
  function invalidateDashboard() {
    loadedSlices.dashboard = false;
    state.dashboardSummary = null;
    if (!$("view-dashboard").hidden)
      loadDashboardData().catch((e) => alert(e.message));
  }
  async function loadMenuData(force = false) {
    if (!state.orgId || (loadedSlices.menu && !force)) return;
    const [menu, objectTypes, dimensionTypes, navigation] = await Promise.all([
      api(`setup/menu?organisation_id=${state.orgId}`),
      api(`accounting-objects/types?organisation_id=${state.orgId}`),
      api(`accounting-dimensions/types?organisation_id=${state.orgId}`),
      api(`navigation/menu?organisation_id=${state.orgId}`),
    ]);
    state.subledgerAccountTypes = menu.subledger_account_types || [];
    state.modules = menu.modules || [];
    state.transactionGroups = menu.transaction_groups || [];
    state.transactionTypes = menu.transaction_types || [];
    state.workflowPaths = menu.workflow_paths || [];
    state.workflowSteps = menu.workflow_steps || [];
    state.workflowNext = menu.workflow_next || [];
    state.accountingObjectTypes = objectTypes.types || [];
    state.accountingDimensionTypes = dimensionTypes.types || [];
    state.navigation = navigation;
    loadedSlices.menu = true;
    loadedSlices.accountingObjectTypes = true;
    loadedSlices.accountingDimensionTypes = true;
    buildDynamicMenu();
    buildAlternativeMenus();
    fillSelects();
    [
      "ledger-family-workflow-path",
      "master-workflow-path",
      "accounting-object-type-workflow-path",
      "accounting-dimension-type-workflow-path",
    ].forEach((id) => fillWorkflowPathSelect(id));
    [
      "ledger-family-modules",
      "accounting-object-type-modules",
      "accounting-dimension-type-modules",
      "transaction-type-modules",
    ].forEach((id) => fillModuleSelect(id));
  }
  async function ensureDivisions(force = false) {
    if (!state.orgId || (loadedSlices.divisions && !force)) return;
    const divs = await api(`divisions/list?organisation_id=${state.orgId}`);
    state.divisions = divs.divisions || [];
    loadedSlices.divisions = true;
    fillDivisionSelects();
  }
  async function ensureFiscal(force = false) {
    if (!state.orgId || (loadedSlices.fiscal && !force)) return;
    const fiscal = await api(`fiscal/list?organisation_id=${state.orgId}`);
    state.years = fiscal.fiscal_years || [];
    state.periods = fiscal.fiscal_periods || [];
    loadedSlices.fiscal = true;
    fillSelects();
    patchDynamicSelects();
  }
  async function ensureCountries(force = false) {
    if (!state.orgId || (loadedSlices.countries && !force)) return;
    const countries = await api(
      `countries/list?organisation_id=${state.orgId}`,
    );
    state.countries = countries.countries || [];
    loadedSlices.countries = true;
  }
  async function ensureCurrencies(force = false) {
    if (!state.orgId || (loadedSlices.currencies && !force)) return;
    const currencies = await api(
      `currencies/list?organisation_id=${state.orgId}`,
    );
    state.currencies = currencies.currencies || [];
    loadedSlices.currencies = true;
    fillSelects();
  }
  async function ensureTaxTypes(force = false) {
    if (!state.orgId || (loadedSlices.taxTypes && !force)) return;
    const taxes = await api(`tax-types/list?organisation_id=${state.orgId}`);
    state.taxTypes = taxes.tax_types || [];
    state.taxRates = taxes.tax_rates || [];
    loadedSlices.taxTypes = true;
  }
  async function ensureAccountTypes(force = false) {
    if (!state.orgId || (loadedSlices.accountTypes && !force)) return;
    const types = await api(
      `gl-account-types/list?organisation_id=${state.orgId}`,
    );
    state.glAccountTypes = types.gl_account_types || [];
    loadedSlices.accountTypes = true;
    fillSelects();
    fillAccountTypes();
  }
  async function ensureAccountingObjectTypes(force = false) {
    if (!state.orgId || (loadedSlices.accountingObjectTypes && !force)) return;
    const types = await api(
      `accounting-objects/types?organisation_id=${state.orgId}`,
    );
    state.accountingObjectTypes = types.types || [];
    loadedSlices.accountingObjectTypes = true;
  }
  async function ensureAccountingDimensionTypes(force = false) {
    if (!state.orgId || (loadedSlices.accountingDimensionTypes && !force))
      return;
    const types = await api(
      `accounting-dimensions/types?organisation_id=${state.orgId}`,
    );
    state.accountingDimensionTypes = types.types || [];
    loadedSlices.accountingDimensionTypes = true;
  }
  async function ensureLegalEntities(force = false) {
    if (!state.orgId || (loadedSlices.legalEntities && !force)) return;
    const entities = await api(
      `legal-entities/list?organisation_id=${state.orgId}`,
    );
    state.legalEntities = entities.legal_entities || [];
    loadedSlices.legalEntities = true;
    fillLegalEntitySelects();
  }
  async function ensureFinancialFormats(force = false) {
    if (!state.orgId || (loadedSlices.financialFormats && !force)) return;
    const data = await api(
      `financial-formats/list?organisation_id=${state.orgId}`,
    );
    state.financialFormats = data.formats || [];
    state.financialFormatLines = data.lines || [];
    state.financialFormatMappings = data.mappings || [];
    loadedSlices.financialFormats = true;
    fillReportFormatSelect();
  }
  async function ensureTransactionSetup(force = false) {
    if (!state.orgId || (loadedSlices.transactions && !force)) return;
    const tx = await api(`setup/reference?organisation_id=${state.orgId}`);
    state.transactionGroups = tx.transaction_groups || [];
    state.transactionTypes = tx.transaction_types || [];
    state.lineDefinitions = tx.line_definitions || [];
    loadedSlices.transactions = true;
    loadedSlices.menu = true;
    buildDynamicMenu();
    fillSelects();
    patchDynamicSelects();
  }
  async function ensurePermissions(force = false) {
    if (!state.orgId || (loadedSlices.permissions && !force)) return;
    await Promise.all([ensureDivisions(), loadMenuData()]);
    const permissions = await api(
      `permissions/list?organisation_id=${state.orgId}`,
    );
    state.roles = permissions.roles || [];
    state.rolePermissions = permissions.role_permissions || [];
    state.roleUsers = permissions.role_users || [];
    loadedSlices.permissions = true;
  }
  async function ensureViewData(view) {
    if (!state.orgId) return;
    if (view === "modules") {
      await loadMenuData();
      renderModules();
    } else if (view === "divisions") {
      await ensureDivisions();
      renderDivisions();
    } else if (view === "fiscal") {
      await ensureFiscal();
      renderFiscal();
    } else if (view === "countries") {
      await ensureCountries();
      renderCountries();
    } else if (view === "currencies") {
      await ensureCurrencies();
      renderCurrencies();
    } else if (view === "taxtypes") {
      await ensureTaxTypes();
      renderTaxTypes();
    } else if (view === "ledgerfamilies") {
      await loadMenuData();
      renderLedgerFamilies();
    } else if (view === "accountingobjecttypes") {
      await Promise.all([loadMenuData(), ensureAccountingObjectTypes()]);
      renderAccountingSetupTypes("object");
    } else if (view === "accountingdimensiontypes") {
      await Promise.all([loadMenuData(), ensureAccountingDimensionTypes()]);
      renderAccountingSetupTypes("dimension");
    } else if (view === "accountingobjects") {
      await Promise.all([ensureAccountingObjectTypes(), ensureDivisions()]);
      renderAccountingMaster("object");
      await loadAccountingMasterRecords("object");
    } else if (view === "accountingdimensions") {
      await Promise.all([ensureAccountingDimensionTypes(), ensureDivisions()]);
      renderAccountingMaster("dimension");
      await loadAccountingMasterRecords("dimension");
    } else if (view === "financialformats") {
      await Promise.all([
        ensureFinancialFormats(),
        loadAccountsForFamily("gl"),
      ]);
      renderFinancialFormats();
    } else if (view === "transactiongroups") {
      await ensureTransactionSetup();
      renderTransactionGroups();
    } else if (view === "transactiontypes") {
      await Promise.all([
        ensureTransactionSetup(),
        ensureAccountingObjectTypes(),
        ensureAccountingDimensionTypes(),
      ]);
      renderTransactionTypes();
    } else if (view === "workflows") {
      await loadMenuData();
      renderWorkflows();
    } else if (view === "permissions") {
      await ensurePermissions();
      renderRoles();
    } else if (view === "legalentities") {
      await ensureLegalEntities();
      renderLegalEntities();
    } else if (view === "reports") {
      await Promise.all([
        ensureFiscal(),
        ensureDivisions(),
        ensureFinancialFormats(),
      ]);
    }
  }
  async function loadOrgData() {
    resetOrgLoadedState();
    if (!state.orgId) return;
    await Promise.all([loadMenuData(true), ensureDivisions(true)]);
    resolveDivisionContext();
    fillDivisionSelects();
    renderWorkspaceContext();
    renderDashboard();
    renderOrganisations();
  }
  async function loadAccountsForFamily(familyCode) {
    if (!familyCode || loadedAccountFamilies.has(familyCode)) return;
    if (familyCode === "gl") {
      await ensureAccountTypes();
      const result = await api(
        `gl-accounts/list?organisation_id=${state.orgId}`,
      );
      const accounts = (result.gl_accounts || []).map((account) => ({
        ...account,
        account_kind: "gl",
        account_id: account.gl_account_id,
        scope_code: "gl",
        account_type_name: account.type_name,
      }));
      state.accounts = state.accounts
        .filter((account) => account.scope_code !== "gl")
        .concat(accounts);
    } else {
      const type = state.subledgerAccountTypes.find(
        (item) => item.type_code === familyCode,
      );
      if (!type) return;
      const result = await api(
        `subledger-accounts/list?organisation_id=${state.orgId}&subledger_account_type_id=${type.subledger_account_type_id}`,
      );
      const accounts = (result.subledger_accounts || []).map((account) => ({
        ...account,
        account_kind: "subledger",
        account_id: account.subledger_account_id,
        scope_code: familyCode,
        account_type_name: account.type_name,
      }));
      state.accounts = state.accounts
        .filter((account) => account.scope_code !== familyCode)
        .concat(accounts);
    }
    loadedAccountFamilies.add(familyCode);
  }
  async function loadAllAccounts() {
    const scopes = [
      { type_code: "gl" },
      ...(state.subledgerAccountTypes.length
        ? state.subledgerAccountTypes
        : boot.subledger_account_types),
    ].filter((type) => type.is_active !== false);
    const missing = scopes.filter(
      (scope) => !loadedAccountFamilies.has(scope.type_code),
    );
    if (!missing.length) return;
    await Promise.all(
      missing.map((scope) => loadAccountsForFamily(scope.type_code)),
    );
  }
  async function loadJournalsForTransactionType(typeId) {
    if (!typeId) {
      state.journals = [];
      return;
    }
    const r = await api(
      `journals/list?organisation_id=${currentOrganisationId()}&transaction_type_id=${encodeURIComponent(typeId)}`,
    );
    state.journals = r.journals || [];
  }
  function renderAll() {
    renderDashboard();
    renderOrganisations();
    renderDivisions();
    renderFiscal();
    renderCountries();
    renderCurrencies();
    renderTaxTypes();
    renderLedgerFamilies();
    renderFinancialFormats();
    renderAccounts();
    renderLegalEntities();
    renderJournals();
    renderTransactionGroups();
    renderTransactionTypes();
    renderRoles();
  }
  function resetScreenState() {
    selectedMasterRecord = null;
    selectedJournal = null;
    selectedLegalEntity = null;
    selectedFinancialFormatId = "";
    expandedFiscalYears = new Set();
    expandedLedgerFamilies = new Set();
    expandedTransactionGroups = new Set();
    loadedAccountFamilies = new Set();
    [
      "organisation-form",
      "org-copy-panel",
      "org-delete-panel",
      "division-form",
      "country-form",
      "currency-form",
      "tax-type-form",
      "ledger-family-form",
      "financial-format-form",
      "transaction-group-form",
      "transaction-type-form",
      "role-form",
      "account-form",
      "legal-entity-form",
      "journal-form",
      "fiscal-editor-panel",
      "fiscal-period-panel",
    ].forEach((id) => {
      if ($(id)) $(id).hidden = true;
    });
    [
      "account-form",
      "accounting-object-form",
      "accounting-dimension-form",
      "legal-entity-form",
      "journal-form",
      "fiscal-form",
      "fiscal-period-form",
      "financial-format-form",
    ].forEach((id) => $(id)?.reset());
    $("account-id").value = "";
    if ($("accounting-object-id")) $("accounting-object-id").value = "";
    if ($("accounting-dimension-id")) $("accounting-dimension-id").value = "";
    $("journal-id").value = "";
    $("fiscal-year-id").value = "";
    $("fiscal-period-id").value = "";
    if ($("org-copy-result")) $("org-copy-result").hidden = true;
    if ($("org-delete-result")) $("org-delete-result").hidden = true;
    renderJournalLines();
    $("journal-date").value = today();
  }
  async function load() {
    alert("");
    boot = await api("setup/bootstrap");
    state.orgId = resolveCurrentOrgId();
    storeCurrentOrg();
    fillSelects();
    if (state.orgId) await loadOrgData();
    else {
      resetOrgLoadedState();
      buildDynamicMenu();
      buildAlternativeMenus();
      fillDivisionSelects();
      renderAll();
    }
    renderWorkspaceContext();
    const requestedView =
      new URLSearchParams(location.search).get("view") || "dashboard";
    const viewExists = !!$(`view-${requestedView}`);
    await openView(viewExists ? requestedView : "dashboard");
    syncContextUrl();
    if (state.orgId && boot.context_storage_available)
      await saveWorkspaceContext();
  }
  [
    ["organisation-search", renderOrganisations],
    ["division-search", renderDivisions],
    ["fiscal-search", renderFiscal],
    ["country-search", renderCountries],
    ["currency-search", renderCurrencies],
    ["tax-type-search", renderTaxTypes],
    ["ledgerfamily-search", renderLedgerFamilies],
    ["financial-format-search", renderFinancialFormats],
    ["account-search", renderAccounts],
    ["accounting-object-search", () => renderAccountingMaster("object")],
    ["accounting-dimension-search", () => renderAccountingMaster("dimension")],
    ["legal-entity-search", renderLegalEntities],
    ["transactiongroup-search", renderTransactionGroups],
    ["transactiontype-search", renderTransactionTypes],
    ["permission-search", renderRoles],
  ].forEach(([id, render]) => $(id)?.addEventListener("input", render));
  $("run-report").addEventListener("click", () =>
    renderReport().catch((e) => alert(e.message)),
  );
  $("report-format").addEventListener("change", () => {
    selectedFinancialFormatId = $("report-format").value;
    renderReport().catch((e) => alert(e.message));
  });
  $("report-year").addEventListener("change", () => {
    fillReportPeriodRange(
      "report-year",
      "report-period-from",
      "report-period-to",
    );
    renderReport().catch((e) => alert(e.message));
  });
  $("report-period-from").addEventListener("change", () =>
    renderReport().catch((e) => alert(e.message)),
  );
  $("report-period-to").addEventListener("change", () =>
    renderReport().catch((e) => alert(e.message)),
  );
  $("report-compare-year").addEventListener("change", () => {
    fillReportPeriodRange(
      "report-compare-year",
      "report-compare-period-from",
      "report-compare-period-to",
    );
    renderReport().catch((e) => alert(e.message));
  });
  $("report-compare-period-from").addEventListener("change", () =>
    renderReport().catch((e) => alert(e.message)),
  );
  $("report-compare-period-to").addEventListener("change", () =>
    renderReport().catch((e) => alert(e.message)),
  );
  $("report-division").addEventListener("change", () =>
    renderReport().catch((e) => alert(e.message)),
  );
  $("alert-close").addEventListener("click", () => alert(""));
  $("refresh").addEventListener("click", () =>
    load().catch((e) => alert(e.message)),
  );
  async function initialiseTemplateOrganisation() {
    if (
      !window.confirm(
        "Create or reset the TEMPLATE organisation with seeded defaults? Existing TEMPLATE data will be deleted and recreated.",
      )
    )
      return;
    const r = await api("setup/init-template", {
      method: "POST",
      body: JSON.stringify({}),
    });
    state.orgId = r.organisation?.organisation_id || state.orgId;
    storeCurrentOrg();
    await load();
    await ensureTaxTypes(true);
    applyMenuMode("setup");
    show("organisations");
    $("init-template-result").hidden = false;
    $("init-template-result").textContent =
      "Template organisation initialised. Security Administrator access has been assigned to your user.";
  }
  async function initialiseSchema() {
    if (!window.confirm("Initialise or repair the ERP database schema now?"))
      return;
    recalculateBalancingLines();
    await api("setup/schema", {
      method: "POST",
      body: JSON.stringify({ access_organisation_id: state.orgId }),
    });
    await load();
    applyMenuMode("setup");
    alert("ERP schema initialised.");
  }
  $("reset-erp").addEventListener("click", async () => {
    if (
      !window.confirm(
        "Reset this tenant ERP data? This deletes every ERP organisation, account, legal entity, transaction, document, workflow, module, role, permission, and setup row. It will not reseed defaults. This cannot be undone.",
      )
    )
      return;
    try {
      const r = await api("setup/reset", {
        method: "POST",
        body: JSON.stringify({ access_organisation_id: state.orgId }),
      });
      state.orgId = null;
      await load();
      alert(`ERP reset complete. ${r.deleted} records removed.`);
    } catch (e) {
      alert(e.message);
    }
  });
  $("organisation-select").addEventListener("change", (e) =>
    switchWorkspaceOrganisation(e.target.value).catch((error) =>
      alert(error.message),
    ),
  );
  $("organisation-more").addEventListener("click", (event) => {
    event.stopPropagation();
    closeDivisionPicker();
    const menu = $("organisation-more-menu");
    menu.hidden = !menu.hidden;
    $("organisation-more").setAttribute(
      "aria-expanded",
      menu.hidden ? "false" : "true",
    );
    if (!menu.hidden) {
      $("organisation-tab-search").focus();
      renderOrganisationOverflow();
    }
  });
  $("organisation-more-menu").addEventListener("click", (event) =>
    event.stopPropagation(),
  );
  $("organisation-tab-search").addEventListener(
    "input",
    renderOrganisationOverflow,
  );
  $("division-picker-button").addEventListener("click", (event) => {
    event.stopPropagation();
    closeOrganisationMenu();
    const menu = $("division-picker-menu");
    menu.hidden = !menu.hidden;
    $("division-picker-button").setAttribute(
      "aria-expanded",
      menu.hidden ? "false" : "true",
    );
    if (!menu.hidden) {
      renderDivisionTree();
    }
  });
  $("division-picker-menu").addEventListener("click", (event) =>
    event.stopPropagation(),
  );
  $("division-picker-close").addEventListener("click", closeDivisionPicker);
  $("include-child-divisions").addEventListener("change", async (event) => {
    if (!confirmContextChange()) {
      event.target.checked = state.includeChildren;
      return;
    }
    try {
      state.includeChildren = event.target.checked;
      resetScreenState();
      resetOrgLoadedState();
      await loadMenuData(true);
      await ensureDivisions(true);
      renderWorkspaceContext();
      await saveWorkspaceContext();
      syncContextUrl({ push: true });
      show("dashboard");
      loadDashboardData().catch((error) => alert(error.message));
    } catch (error) {
      alert(error.message);
    }
  });
  document.addEventListener("click", () => {
    closeOrganisationMenu();
    closeDivisionPicker();
  });
  document.addEventListener("input", (event) => {
    const form = event.target.closest?.("form");
    if (form && event.isTrusted) dirtyForms.add(form);
  });
  document.addEventListener("change", (event) => {
    const form = event.target.closest?.("form");
    if (form && event.isTrusted) dirtyForms.add(form);
  });
  document.addEventListener(
    "submit",
    (event) => dirtyForms.delete(event.target),
    true,
  );
  window.addEventListener("beforeunload", (event) => {
    if (hasDirtyForm()) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  window.addEventListener("popstate", () => location.reload());
  function openNewOrganisation() {
    $("organisation-form").hidden = false;
    showOrganisationTab("definition");
    $("org-copy-panel").hidden = true;
    $("org-delete-panel").hidden = true;
    $("organisation-form").reset();
    $("org-id").value = "";
    $("org-icon-svg").value = "";
    renderOrganisationIconPreview();
    resetOrgOpenAIFields();
    const template = boot.organisations.find((o) => o.is_template);
    $("org-copy-source").value = template?.organisation_id || "";
    $("org-copy-target").value = "";
    $("org-delete-target").value = "";
  }
  $("add-org").addEventListener("click", openNewOrganisation);
  $("new-org").addEventListener("click", openNewOrganisation);
  async function saveOrganisationForm() {
    const r = await api("organisations/save", {
      method: "POST",
      body: JSON.stringify({
        organisation_id: $("org-id").value,
        access_organisation_id: state.orgId,
        organisation_code: $("org-code").value,
        organisation_name: $("org-name").value,
        base_currency_code: $("org-currency").value,
        is_template: $("org-template").checked,
        organisation_icon_svg: $("org-icon-svg").value.trim() || null,
      }),
    });
    if (r.organisation?.organisation_id)
      $("org-id").value = r.organisation.organisation_id;
    if (r.organisation?.organisation_id)
      await saveOrgOpenAISetting(r.organisation.organisation_id);
    return r.organisation;
  }
  $("organisation-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const org = await saveOrganisationForm();
      if (org?.organisation_id) {
        state.orgId = org.organisation_id;
        storeCurrentOrg();
      }
      $("organisation-form").hidden = true;
      await load();
      show("organisations");
    } catch (error) {
      alert(error.message);
    }
  });
  function selectedOrganisationId() {
    return $("org-id").value || state.orgId || "";
  }
  function openOrgCopyPanel() {
    const targetId = selectedOrganisationId();
    const template =
      boot.organisations.find(
        (o) => o.is_template && o.organisation_id !== targetId,
      ) || boot.organisations.find((o) => o.organisation_id !== targetId);
    $("org-copy-panel").hidden = false;
    $("org-delete-panel").hidden = true;
    $("org-copy-result").hidden = true;
    $("org-copy-source").value = template?.organisation_id || "";
    $("org-copy-target").value = targetId;
  }
  function ensureDeleteTransactionsOption() {
    if (document.getElementById("delete-transactions")) return;
    const fiscalOption = document
      .getElementById("delete-fiscal-years")
      ?.closest("label");
    if (!fiscalOption) return;
    const label = document.createElement("label");
    label.className = "check";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "delete-transactions";
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(" Transactions and journals"));
    fiscalOption.insertAdjacentElement("afterend", label);
  }
  function ensureDeleteModulesOption() {
    if (document.getElementById("delete-modules")) return;
    const options = $("org-delete-panel")?.querySelector(".copy-options");
    if (!options) return;
    const label = document.createElement("label");
    label.className = "check";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "delete-modules";
    label.append(
      checkbox,
      document.createTextNode(" Modules (also removes module links)"),
    );
    options.append(label);
  }
  function openOrgDeletePanel() {
    const targetId = selectedOrganisationId();
    ensureDeleteTransactionsOption();
    ensureDeleteModulesOption();
    $("org-delete-panel").hidden = false;
    $("org-copy-panel").hidden = true;
    $("org-delete-result").hidden = true;
    $("org-delete-target").value = targetId;
  }
  $("open-org-copy").addEventListener("click", openOrgCopyPanel);
  $("open-org-delete").addEventListener("click", openOrgDeletePanel);
  $("run-org-copy").addEventListener("click", async () => {
    const sourceId = $("org-copy-source").value;
    const targetId = $("org-copy-target").value;
    if (!sourceId || !targetId)
      return alert("Select both source and target organisations");
    if (sourceId === targetId)
      return alert("Source and target organisations must be different");
    if (
      !window.confirm(
        "Copy the selected setup data into the target organisation? Existing matching setup rows may be updated.",
      )
    )
      return;
    const options = {
      divisions: $("copy-divisions").checked,
      countries: $("copy-countries").checked,
      currencies: $("copy-currencies").checked,
      tax_types: $("copy-tax-types").checked,
      fiscal_years: $("copy-fiscal-years").checked,
      subledger_account_types: $("copy-subledger-account-types").checked,
      gl_account_types: $("copy-gl-account-types").checked,
      chart_of_accounts: $("copy-chart").checked,
      financial_statement_formats: $("copy-financial-formats").checked,
      transaction_groups: $("copy-transaction-groups").checked,
      transaction_types: $("copy-transaction-types").checked,
      line_definitions: $("copy-line-definitions").checked,
      workflow_paths: $("copy-workflow-paths")?.checked !== false,
      accounting_types: $("copy-accounting-types").checked,
      permissions: $("copy-permissions").checked,
    };
    try {
      const r = await api("organisations/copy-organisation-setup", {
        method: "POST",
        body: JSON.stringify({
          source_organisation_id: sourceId,
          target_organisation_id: targetId,
          options,
        }),
      });
      state.orgId = targetId;
      storeCurrentOrg();
      resetScreenState();
      await load();
      show("organisations");
      $("org-copy-panel").hidden = false;
      const detail = Object.entries(r.detail || {})
        .map(([name, count]) => `${pretty(name)}: ${count}`)
        .join(" | ");
      $("org-copy-result").hidden = false;
      $("org-copy-result").textContent =
        `Copy complete. ${r.copied} records inserted or updated.${detail ? ` ${detail}` : ""}`;
    } catch (error) {
      alert(error.message);
    }
  });
  $("run-org-delete").addEventListener("click", async () => {
    const orgId = $("org-delete-target").value;
    if (!orgId) return alert("Select an organisation first");
    ensureDeleteTransactionsOption();
    ensureDeleteModulesOption();
    const options = {
      divisions: $("delete-divisions").checked,
      countries: $("delete-countries").checked,
      currencies: $("delete-currencies").checked,
      tax_types: $("delete-tax-types").checked,
      fiscal_years: $("delete-fiscal-years").checked,
      transactions: $("delete-transactions").checked,
      subledger_account_types: $("delete-subledger-account-types").checked,
      gl_account_types: $("delete-gl-account-types").checked,
      chart_of_accounts: $("delete-chart").checked,
      financial_statement_formats: $("delete-financial-formats").checked,
      transaction_groups: $("delete-transaction-groups").checked,
      transaction_types: $("delete-transaction-types").checked,
      line_definitions: $("delete-line-definitions").checked,
      accounting_types: $("delete-accounting-types").checked,
      permissions: $("delete-permissions").checked,
      modules: $("delete-modules").checked,
    };
    if (!Object.values(options).some(Boolean))
      return alert("Select at least one data option to delete");
    const org = boot.organisations.find((o) => o.organisation_id === orgId);
    const name = org
      ? `${org.organisation_code} - ${org.organisation_name}`
      : "the selected organisation";
    const deletesTransactions =
      options.transactions ||
      options.fiscal_years ||
      options.divisions ||
      options.chart_of_accounts;
    const transactionWarning = deletesTransactions
      ? " Captured transactions/journals will also be deleted."
      : "";
    const moduleWarning = options.modules
      ? " Module links from roles and setup object types will also be removed; those linked records will remain."
      : "";
    if (
      !window.confirm(
        `Delete the selected data from ${name}?${transactionWarning}${moduleWarning} This cannot be undone.`,
      )
    )
      return;
    try {
      const r = await api("organisations/delete-data", {
        method: "POST",
        body: JSON.stringify({ organisation_id: orgId, options }),
      });
      state.orgId = orgId;
      storeCurrentOrg();
      resetScreenState();
      await load();
      show("organisations");
      $("org-delete-panel").hidden = false;
      const detail = Object.entries(r.detail || {})
        .map(([name, count]) => `${pretty(name)}: ${count}`)
        .join(" | ");
      $("org-delete-result").hidden = false;
      $("org-delete-result").textContent =
        `Delete complete. ${r.deleted} records removed.${detail ? ` ${detail}` : ""}`;
    } catch (error) {
      alert(error.message);
    }
  });
  function openNewDivision() {
    $("division-form").hidden = false;
    $("division-form").reset();
    $("division-id").value = "";
    $("division-status").value = "approved";
  }
  $("add-division").addEventListener("click", openNewDivision);
  $("new-division").addEventListener("click", openNewDivision);
  $("division-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    await api("divisions/save", {
      method: "POST",
      body: JSON.stringify({
        division_id: $("division-id").value,
        organisation_id: state.orgId,
        parent_division_id: $("division-parent").value,
        division_code: $("division-code").value,
        division_name: $("division-name").value,
        workflow_status: $("division-status").value,
      }),
    });
    $("division-form").hidden = true;
    await ensureDivisions(true);
    renderDivisions();
    invalidateDashboard();
  });
  $("add-fiscal-year").addEventListener("click", resetFiscalYearForm);
  $("new-fiscal-year").addEventListener("click", resetFiscalYearForm);
  $("new-fiscal-period").addEventListener("click", resetFiscalPeriodForm);
  $("fiscal-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const r = await api("fiscal/save-year", {
      method: "POST",
      body: JSON.stringify({
        fiscal_year_id: $("fiscal-year-id").value,
        organisation_id: state.orgId,
        fiscal_year_code: $("fiscal-code").value,
        start_date: $("fiscal-start").value,
        end_date: $("fiscal-end").value,
        status: $("fiscal-status").value,
        create_periods: $("fiscal-periods").checked,
      }),
    });
    if (r.fiscal_year?.fiscal_year_id) {
      expandedFiscalYears.add(r.fiscal_year.fiscal_year_id);
      $("period-year-id").value = r.fiscal_year.fiscal_year_id;
    }
    $("fiscal-editor-panel").hidden = true;
    await ensureFiscal(true);
    renderFiscal();
    invalidateDashboard();
  });
  $("fiscal-period-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const yearId = $("period-year-id").value || $("fiscal-year-id").value;
    if (!yearId) return alert("Select or save a fiscal year first");
    await api("fiscal/save-period", {
      method: "POST",
      body: JSON.stringify({
        fiscal_period_id: $("fiscal-period-id").value,
        organisation_id: state.orgId,
        fiscal_year_id: yearId,
        period_number: $("period-number").value,
        start_date: $("period-start").value,
        end_date: $("period-end").value,
        status: $("period-status").value,
      }),
    });
    expandedFiscalYears.add(yearId);
    $("fiscal-period-panel").hidden = true;
    await ensureFiscal(true);
    renderFiscal();
    invalidateDashboard();
  });
  $("account-form-family").addEventListener("change", () => {
    let detail = {};
    try {
      detail = collectAccountDetail();
    } catch {}
    fillAccountTypes();
    updateAccountLegalEntityRequirement();
    renderAccountDetailFields(detail);
  });
  document
    .querySelectorAll("[data-account-fixed-tab]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        showAccountFixedTab(button.dataset.accountFixedTab),
      ),
    );
  $("add-account").addEventListener("click", () => openAccountEditor());
  $("new-account").addEventListener("click", () => openAccountEditor());
  $("intake-account-document").addEventListener("click", () =>
    openDocumentIntake("gl_account"),
  );
  $("close-intake").addEventListener("click", closeDocumentIntake);
  $("analyse-intake").addEventListener("click", async () => {
    const targetKind = $("intake-target-kind").value;
    const input = $("intake-file");
    const file = input.files && input.files[0];
    if (targetKind !== "legal_entity")
      return alert("Only legal entity intake is implemented in this step.");
    if (!file) return alert("Choose a source document first.");
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("Document must be 10MB or smaller");
      $("intake-status").textContent = "Analysing document...";
      $("intake-review").hidden = true;
      const dataUrl = await readFileDataUrl(file);
      const result = await api("intake/analyse", {
        method: "POST",
        body: JSON.stringify({
          organisation_id: state.orgId,
          target_kind: targetKind,
          file_name: file.name,
          data_url: dataUrl,
        }),
      });
      populateIntakeReview(result.intake);
    } catch (error) {
      $("intake-status").textContent = "";
      alert(error.message);
    }
  });
  [
    "intake-entity-type",
    "intake-legal-name",
    "intake-known-name",
    "intake-effective-from",
    "intake-effective-to",
  ].forEach((id) => $(id).addEventListener("input", syncIntakeFieldsFromJson));
  $("intake-review").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      syncIntakeFieldsFromJson();
      const draft = JSON.parse($("intake-json").value || "{}");
      if (!draft.legal_entity?.legal_name || !draft.legal_entity?.known_name)
        throw new Error("Legal name and known name are required");
      $("intake-status").textContent = "Creating legal entity...";
      const saved = await api("intake/confirm", {
        method: "POST",
        body: JSON.stringify({
          intake_id: $("intake-id").value,
          extracted_json: JSON.stringify(draft),
        }),
      });
      selectedLegalEntity =
        saved.legal_entity?.legal_entity_id || selectedLegalEntity;
      closeDocumentIntake();
      await ensureLegalEntities(true);
      renderLegalEntities();
      fillLegalEntitySelects();
      if (saved.legal_entity) await openLegalEntityEditor(saved.legal_entity);
    } catch (error) {
      alert(error.message);
    }
  });
  $("upload-account-document").addEventListener("click", () =>
    $("account-document-file").click(),
  );
  $("account-document-file").addEventListener("change", () =>
    uploadEntityDocument("account"),
  );
  $("account-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const family = selectedAccountScopeCode || $("account-form-family").value;
    $("account-form-family").value = family;
    let additionalData;
    try {
      additionalData = collectAccountDetail();
    } catch (error) {
      alert(error.message);
      return;
    }
    const type = state.subledgerAccountTypes.find(
      (item) => item.type_code === family,
    );
    const endpoint =
      family === "gl" ? "gl-accounts/save" : "subledger-accounts/save";
    const payload =
      family === "gl"
        ? {
            gl_account_id: $("account-id").value,
            organisation_id: state.orgId,
            account_code: $("account-code").value,
            account_name: $("account-name").value,
            gl_account_type_id: $("account-type").value,
            requires_subledger: $("account-requires-subledger").checked,
            required_subledger_account_type_id: $("account-subledger-family")
              .value,
            additional_data: JSON.stringify(additionalData),
          }
        : {
            subledger_account_id: $("account-id").value,
            organisation_id: state.orgId,
            owner_division_id: $("account-division").value,
            subledger_account_type_id: type?.subledger_account_type_id,
            legal_entity_id: $("account-legal-entity").value,
            account_code: $("account-code").value,
            account_name: $("account-name").value,
            additional_data: JSON.stringify(additionalData),
          };
    const saved = await api(endpoint, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    $("account-id").value =
      (family === "gl"
        ? saved.gl_account?.gl_account_id
        : saved.subledger_account?.subledger_account_id) ||
      $("account-id").value;
    loadedAccountFamilies.delete(family);
    await loadAccountsForFamily(family);
    renderAccounts();
    fillAccountSelects();
    await loadEntityDocuments("account");
    $("account-form").hidden = true;
    invalidateDashboard();
  });
  function resetAccountingMasterForm(kind) {
    const config = accountingMasterConfig(kind);
    $(`${config.prefix}-form`).reset();
    $(`${config.prefix}-id`).value = "";
    $(`${config.prefix}-type`).value =
      $(`${config.prefix}-type-select`).value ||
      state[config.typesKey][0]?.[config.typeId] ||
      "";
    $(`${config.prefix}-division`).value =
      state.divisions[0]?.division_id || "";
    if (config.isObject) {
      accountingObjectParentOptions = [];
      renderAccountingObjectParentOptions();
      $("accounting-object-parent").value = "";
      $("accounting-object-parent-search").value = "";
      $("accounting-object-parent-search").dataset.selectedLabel = "";
      loadAccountingObjectParentOptions("", "").catch((e) => alert(e.message));
    }
    $(`${config.prefix}-valid-from`).value = today();
    $(`${config.prefix}-valid-to`).value = "";
    renderAccountingMasterDetailFields(kind, {});
    renderWorkflowHeader(`${config.prefix}-workflow-header`, null);
    renderWorkflowProgress(`${config.prefix}-workflow-progress`, null, null);
    renderWorkflowHistory(`${config.prefix}-workflow-history`, null);
    config.setSelected(null);
  }
  ["object", "dimension"].forEach((kind) => {
    const config = accountingMasterConfig(kind);
    $(`${config.prefix}-type-select`)?.addEventListener("change", () =>
      loadAccountingMasterRecords(kind).catch((e) => alert(e.message)),
    );
    $(`${config.prefix}-type`)?.addEventListener("change", () =>
      renderAccountingMasterDetailFields(kind, {}),
    );
    $(`add-${config.prefix}`)?.addEventListener("click", () => {
      $(`${config.prefix}-form`).hidden = false;
      resetAccountingMasterForm(kind);
    });
    $(`new-${config.prefix}`)?.addEventListener("click", () =>
      resetAccountingMasterForm(kind),
    );
    $(`${config.prefix}-form`)?.addEventListener("submit", async (e) => {
      e.preventDefault();
      let additionalData;
      try {
        additionalData = collectAccountingMasterDetail(kind);
      } catch (error) {
        alert(error.message);
        return;
      }
      const body = {
        organisation_id: state.orgId,
        owner_division_id: $(`${config.prefix}-division`).value,
        valid_from: $(`${config.prefix}-valid-from`).value,
        valid_to: $(`${config.prefix}-valid-to`).value,
        additional_data: JSON.stringify(additionalData),
      };
      if (config.isObject) {
        syncAccountingObjectParentSelection();
        if (
          $("accounting-object-parent-search").value.trim() &&
          !$("accounting-object-parent").value
        )
          return alert(
            "Choose a parent object from the search results, or clear the parent object field.",
          );
        body.parent_accounting_object_id = $("accounting-object-parent").value;
      }
      body[config.recordId] = $(`${config.prefix}-id`).value;
      body[config.typeId] = $(`${config.prefix}-type`).value;
      body[config.code] = $(`${config.prefix}-code`).value;
      body[config.name] = $(`${config.prefix}-name`).value;
      const saved = await api(`${config.endpoint}/save`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      config.setSelected(saved.record?.[config.recordId] || config.selected());
      $(`${config.prefix}-id`).value = config.selected() || "";
      $(`${config.prefix}-type-select`).value = body[config.typeId];
      await loadAccountingMasterRecords(kind);
      alert(
        `${config.isObject ? "Accounting object" : "Accounting dimension"} saved.`,
      );
    });
  });
  let accountingObjectParentSearchTimer = null;
  $("accounting-object-parent-search")?.addEventListener("input", () => {
    clearTimeout(accountingObjectParentSearchTimer);
    syncAccountingObjectParentSelection();
    const term = $("accounting-object-parent-search").value.trim();
    const currentId = $("accounting-object-id").value;
    accountingObjectParentSearchTimer = setTimeout(() => {
      loadAccountingObjectParentOptions(term, currentId)
        .then(syncAccountingObjectParentSelection)
        .catch((e) => alert(e.message));
    }, 180);
  });
  $("accounting-object-parent-search")?.addEventListener(
    "change",
    syncAccountingObjectParentSelection,
  );
  $("add-legal-entity").addEventListener("click", resetLegalEntityForm);
  $("new-legal-entity").addEventListener("click", resetLegalEntityForm);
  $("intake-legal-entity-document").addEventListener("click", () =>
    openDocumentIntake("legal_entity"),
  );
  $("upload-legal-entity-document").addEventListener("click", () =>
    $("legal-entity-document-file").click(),
  );
  $("legal-entity-document-file").addEventListener("change", () =>
    uploadEntityDocument("legalEntity"),
  );
  $("add-legal-identification").addEventListener("click", () =>
    addLegalIdentification(),
  );
  $("add-legal-address").addEventListener("click", () => addLegalAddress());
  $("add-legal-relationship").addEventListener("click", () =>
    addLegalRelationship(),
  );
  $("legal-entity-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    let additionalData;
    let identifications;
    let addresses;
    let relationships;
    try {
      additionalData = JSON.parse($("legal-entity-additional").value || "{}");
      identifications = collectLegalIdentifications();
      addresses = collectLegalAddresses();
      relationships = collectLegalRelationships();
    } catch (error) {
      alert(error.message);
      return;
    }
    const saved = await api("legal-entities/save", {
      method: "POST",
      body: JSON.stringify({
        legal_entity_id: $("legal-entity-id").value,
        organisation_id: state.orgId,
        entity_type: $("legal-entity-type").value,
        legal_name: $("legal-entity-legal-name").value,
        known_name: $("legal-entity-known-name").value,
        workflow_status: $("legal-entity-status").value,
        effective_from: $("legal-entity-effective-from").value,
        effective_to: $("legal-entity-effective-to").value,
        additional_data: JSON.stringify(additionalData),
        identifications: JSON.stringify(identifications),
        addresses: JSON.stringify(addresses),
        relationships: JSON.stringify(relationships),
      }),
    });
    selectedLegalEntity =
      saved.legal_entity?.legal_entity_id || selectedLegalEntity;
    $("legal-entity-id").value = selectedLegalEntity || "";
    await ensureLegalEntities(true);
    renderLegalEntities();
    fillLegalEntitySelects();
    await loadEntityDocuments("legalEntity");
  });
  $("journal-date").value = today();
  option($("journal-period"), [], null, null);
  $("add-journal-line").addEventListener("click", () => addJournalLine());
  function openNewJournal() {
    $("journal-form").hidden = false;
    $("journal-form").reset();
    $("journal-id").value = "";
    selectedJournal = null;
    $("journal-type").value = selectedTransactionTypeId || "";
    $("journal-date").value = today();
    syncJournalPeriodToDate();
    renderJournalLines(defaultJournalLinesForType($("journal-type").value));
    setJournalEditable(true);
    loadEntityDocuments("journal").catch((e) => alert(e.message));
  }
  $("add-journal").addEventListener("click", openNewJournal);
  $("new-journal").addEventListener("click", openNewJournal);
  $("journal-date").addEventListener("change", syncJournalPeriodToDate);
  $("journal-type").addEventListener("change", () => {
    if (!$("journal-id").value)
      renderJournalLines(defaultJournalLinesForType($("journal-type").value));
  });
  $("intake-journal-document").addEventListener("click", () =>
    openDocumentIntake("journal"),
  );
  $("upload-journal-document").addEventListener("click", () =>
    $("journal-document-file").click(),
  );
  $("journal-document-file").addEventListener("change", () =>
    uploadEntityDocument("journal"),
  );
  $("journal-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const saveButton = $("journal-save");
    saveButton.disabled = true;
    try {
      const organisationId = currentOrganisationId();
      const transactionTypeId = $("journal-type").value;
      const fiscalPeriodId = $("journal-period").value;
      const sourceDivisionId = $("journal-division").value;
      const missing = [
        [organisationId, "organisation"],
        [transactionTypeId, "transaction type"],
        [fiscalPeriodId, "fiscal period"],
        [sourceDivisionId, "source division"],
      ]
        .filter(([value]) => !value)
        .map(([, label]) => label);
      if (missing.length)
        throw new Error(`Choose ${missing.join(", ")} before saving`);
      const lines = [
        ...document.querySelectorAll(".journal-line:not(.journal-line-head)"),
      ].map((row) => {
        const side = row.querySelector(".line-drcr").value;
        const amount = row.querySelector(".line-amount").value;
        return {
          transaction_line_definition_id:
            row.querySelector(".line-definition").value,
          division_id: row.querySelector(".line-division").value,
          gl_account_id: row.querySelector(".line-gl").value,
          subledger_account_id: row.querySelector(".line-sub").value,
          description: row.querySelector(".line-description").value,
          debit_amount: side === "debit" ? amount : "",
          credit_amount: side === "credit" ? amount : "",
          currency_code: currentOrg()?.base_currency_code || "ZAR",
          accounting_objects: [
            ...row.querySelectorAll('[data-classification-kind="object"]'),
          ]
            .filter((select) => select.value)
            .map((select) => ({
              accounting_object_type_id: select.dataset.typeId,
              accounting_object_id: select.value,
            })),
          accounting_dimensions: [
            ...row.querySelectorAll('[data-classification-kind="dimension"]'),
          ]
            .filter((select) => select.value)
            .map((select) => ({
              accounting_dimension_type_id: select.dataset.typeId,
              accounting_dimension_id: select.value,
            })),
        };
      });
      if (lines.some((line) => !line.gl_account_id))
        throw new Error("Choose a GL account for every journal line");
      const invalidLineIndex = lines.findIndex((line) => {
        const debit = Number(line.debit_amount) || 0;
        const credit = Number(line.credit_amount) || 0;
        return (debit > 0 && credit > 0) || (debit <= 0 && credit <= 0);
      });
      if (invalidLineIndex >= 0)
        throw new Error(
          `Line ${invalidLineIndex + 1} needs either a debit or a credit amount`,
        );
      const saved = await api("journals/save", {
        method: "POST",
        body: JSON.stringify({
          journal_id: $("journal-id").value,
          organisation_id: organisationId,
          transaction_type_id: transactionTypeId,
          fiscal_period_id: fiscalPeriodId,
          source_division_id: sourceDivisionId,
          supplier_subledger_account_id: $("journal-supplier").value,
          vat_recipient_legal_entity_id: $("journal-vat-recipient").value,
          supplier_invoice_number: $("journal-supplier-invoice-number").value,
          supplier_invoice_date: $("journal-supplier-invoice-date").value,
          journal_date: $("journal-date").value,
          description: $("journal-description").value,
          currency_code: currentOrg()?.base_currency_code || "ZAR",
          lines,
        }),
      });
      const debitTotal = lines.reduce(
        (sum, line) => sum + (Number(line.debit_amount) || 0),
        0,
      );
      const creditTotal = lines.reduce(
        (sum, line) => sum + (Number(line.credit_amount) || 0),
        0,
      );
      selectedJournal = saved.journal?.journal_id || selectedJournal;
      $("journal-id").value = selectedJournal || "";
      state.orgId = organisationId;
      await loadJournalsForTransactionType(
        transactionTypeId || selectedTransactionTypeId,
      );
      if (
        saved.journal &&
        !state.journals.some(
          (journal) => journal.journal_id === saved.journal.journal_id,
        )
      ) {
        state.journals = [
          {
            ...saved.journal,
            transaction_type_name: labelForTransactionType(transactionTypeId),
            debit_total: debitTotal.toFixed(2),
            credit_total: creditTotal.toFixed(2),
          },
          ...state.journals,
        ];
      }
      $("journal-form").hidden = true;
      renderJournals();
      invalidateDashboard();
      alert("Draft saved.");
    } catch (error) {
      alert(error.message);
    } finally {
      saveButton.disabled = false;
    }
  });
  document.querySelectorAll("[data-journal-action]").forEach((b) =>
    b.addEventListener("click", async () => {
      try {
        if (!$("journal-id").value)
          return alert("Select or save a journal first");
        await api("journals/workflow", {
          method: "POST",
          body: JSON.stringify({
            journal_id: $("journal-id").value,
            action: b.dataset.journalAction,
          }),
        });
        await loadJournalsForTransactionType(
          $("journal-type").value || selectedTransactionTypeId,
        );
        renderJournals();
        invalidateDashboard();
        alert(`${pretty(b.dataset.journalAction)} complete.`);
      } catch (error) {
        alert(error.message);
      }
    }),
  );
  $("currency-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    await api("currencies/save", {
      method: "POST",
      body: JSON.stringify({
        organisation_id: state.orgId,
        currency_code: $("currency-code").value,
        currency_name: $("currency-name").value,
        decimal_places: $("currency-decimals").value,
      }),
    });
    $("currency-form").hidden = true;
    await ensureCurrencies(true);
    renderCurrencies();
  });
  function openNewCurrency() {
    $("currency-form").hidden = false;
    $("currency-form").reset();
    $("currency-decimals").value = 2;
  }
  function openNewCountry() {
    $("country-form").hidden = false;
    $("country-form").reset();
    $("country-currency").value = "";
  }
  function openNewLedgerFamily() {
    $("ledger-family-form").hidden = false;
    showSetupTypeTab("ledger-family", "definition");
    $("ledger-family-form").reset();
    $("ledger-family-id").value = "";
    $("ledger-family-code").readOnly = false;
    $("ledger-family-workflow-path").value =
      state.workflowPaths[0]?.workflow_path_id || "";
    $("ledger-family-legal-entity").checked = false;
    $("ledger-family-schema").value = "{}";
    $("ledger-family-ui-schema").value = '{"sections":[]}';
    $("ledger-family-active").checked = true;
    fillModuleSelect("ledger-family-modules");
  }
  $("add-currency").addEventListener("click", openNewCurrency);
  $("new-currency").addEventListener("click", openNewCurrency);
  $("add-module").addEventListener("click", () =>
    openModule({ is_active: true }),
  );
  $("new-module").addEventListener("click", () =>
    openModule({ is_active: true }),
  );
  $("module-search").addEventListener("input", renderModules);
  $("module-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    await api("modules/save", {
      method: "POST",
      body: JSON.stringify({
        module_id: $("module-id").value,
        organisation_id: state.orgId,
        module_code: $("module-code").value,
        module_name: $("module-name").value,
        module_description: $("module-description").value,
        module_icon_svg: $("module-icon-svg").value,
        sort_order: $("module-sort").value,
        is_active: $("module-active").checked,
      }),
    });
    $("module-form").hidden = true;
    await loadMenuData(true);
    renderModules();
  });
  $("add-tax-type").addEventListener("click", openNewTaxType);
  $("new-tax-type").addEventListener("click", openNewTaxType);
  $("add-tax-rate").addEventListener("click", () => addTaxRateLine());
  $("tax-type-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    await api("tax-types/save", {
      method: "POST",
      body: JSON.stringify({
        tax_type_id: $("tax-type-id").value,
        organisation_id: state.orgId,
        tax_type_code: $("tax-type-code").value,
        tax_type_description: $("tax-type-description").value,
        tax_direction: $("tax-type-direction").value,
        is_active: $("tax-type-active").checked,
        rates: collectTaxRateLines(),
      }),
    });
    $("tax-type-form").hidden = true;
    await ensureTaxTypes(true);
    renderTaxTypes();
  });
  $("add-country").addEventListener("click", openNewCountry);
  $("new-country").addEventListener("click", openNewCountry);
  $("country-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    await api("countries/save", {
      method: "POST",
      body: JSON.stringify({
        organisation_id: state.orgId,
        country_code: $("country-code").value,
        alpha3_code: $("country-alpha3").value,
        numeric_code: $("country-numeric").value,
        country_name: $("country-name").value,
        official_name: $("country-official").value,
        region: $("country-region").value,
        subregion: $("country-subregion").value,
        default_currency_code: $("country-currency").value,
        calling_code: $("country-calling-code").value,
        postal_code_required: $("country-postal-required").checked,
        administrative_level_label: $("country-admin-label").value,
      }),
    });
    $("country-form").hidden = true;
    await ensureCountries(true);
    renderCountries();
  });
  $("add-ledger-family").addEventListener("click", openNewLedgerFamily);
  $("new-ledger-family").addEventListener("click", openNewLedgerFamily);
  $("ledger-family-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const saveButton =
      e.submitter || e.currentTarget.querySelector('button[type="submit"]');
    if (saveButton) saveButton.disabled = true;
    try {
      await api("subledger-account-types/save", {
        method: "POST",
        body: JSON.stringify({
          subledger_account_type_id: $("ledger-family-id").value,
          organisation_id: state.orgId,
          type_code: $("ledger-family-code").value,
          type_name: $("ledger-family-name").value,
          type_description: $("ledger-family-description").value,
          workflow_path_id: $("ledger-family-workflow-path").value,
          module_ids: selectedModuleIds("ledger-family-modules"),
          requires_legal_entity: $("ledger-family-legal-entity").checked,
          schema_json: $("ledger-family-schema").value,
          ui_schema_json: $("ledger-family-ui-schema").value,
          is_active: $("ledger-family-active").checked,
        }),
      });
      $("ledger-family-form").hidden = true;
      await loadMenuData(true);
      renderLedgerFamilies();
    } catch (error) {
      alert(error.message);
    } finally {
      if (saveButton) saveButton.disabled = false;
    }
  });
  $("add-accounting-object-type").addEventListener("click", () =>
    openAccountingSetupType("object"),
  );
  $("new-accounting-object-type").addEventListener("click", () =>
    openAccountingSetupType("object"),
  );
  $("accounting-object-type-search").addEventListener("input", () =>
    renderAccountingSetupTypes("object"),
  );
  $("accounting-object-type-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    await api("accounting-objects/save-type", {
      method: "POST",
      body: JSON.stringify({
        accounting_object_type_id: $("accounting-object-type-id").value,
        organisation_id: state.orgId,
        type_code: $("accounting-object-type-code").value,
        type_name: $("accounting-object-type-name").value,
        type_description: $("accounting-object-type-description").value,
        workflow_path_id: $("accounting-object-type-workflow-path").value,
        module_ids: selectedModuleIds("accounting-object-type-modules"),
        schema_json: $("accounting-object-type-schema").value,
        ui_schema_json: $("accounting-object-type-ui-schema").value,
        is_active: $("accounting-object-type-active").checked,
      }),
    });
    $("accounting-object-type-form").hidden = true;
    await ensureAccountingObjectTypes(true);
    renderAccountingSetupTypes("object");
  });
  $("add-accounting-dimension-type").addEventListener("click", () =>
    openAccountingSetupType("dimension"),
  );
  $("new-accounting-dimension-type").addEventListener("click", () =>
    openAccountingSetupType("dimension"),
  );
  $("accounting-dimension-type-search").addEventListener("input", () =>
    renderAccountingSetupTypes("dimension"),
  );
  $("accounting-dimension-type-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    await api("accounting-dimensions/save-type", {
      method: "POST",
      body: JSON.stringify({
        accounting_dimension_type_id: $("accounting-dimension-type-id").value,
        organisation_id: state.orgId,
        type_code: $("accounting-dimension-type-code").value,
        type_name: $("accounting-dimension-type-name").value,
        type_description: $("accounting-dimension-type-description").value,
        workflow_path_id: $("accounting-dimension-type-workflow-path").value,
        module_ids: selectedModuleIds("accounting-dimension-type-modules"),
        schema_json: $("accounting-dimension-type-schema").value,
        ui_schema_json: $("accounting-dimension-type-ui-schema").value,
        is_active: $("accounting-dimension-type-active").checked,
      }),
    });
    $("accounting-dimension-type-form").hidden = true;
    await ensureAccountingDimensionTypes(true);
    renderAccountingSetupTypes("dimension");
  });
  $("add-financial-format").addEventListener("click", openNewFinancialFormat);
  $("new-financial-format").addEventListener("click", openNewFinancialFormat);
  $("add-financial-line").addEventListener("click", () =>
    addFinancialFormatLine({
      sort_order:
        (document.querySelectorAll(".financial-line:not(.financial-line-head)")
          .length +
          1) *
        100,
      line_type: "account_group",
      is_active: true,
    }),
  );
  $("financial-format-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    await api("financial-formats/save", {
      method: "POST",
      body: JSON.stringify({
        financial_statement_format_id: $("financial-format-id").value,
        organisation_id: state.orgId,
        format_code: $("financial-format-code").value,
        format_name: $("financial-format-name").value,
        statement_type: $("financial-format-type").value,
        is_active: $("financial-format-active").checked,
        lines: collectFinancialFormatLines(),
      }),
    });
    $("financial-format-form").hidden = true;
    await ensureFinancialFormats(true);
    renderFinancialFormats();
  });
  $("delete-financial-format").addEventListener("click", async () => {
    const id = $("financial-format-id").value;
    if (!id) return alert("Select a financial statement format first");
    if (!window.confirm("Delete this financial statement format?")) return;
    await api("financial-formats/delete", {
      method: "POST",
      body: JSON.stringify({ financial_statement_format_id: id }),
    });
    $("financial-format-form").hidden = true;
    await ensureFinancialFormats(true);
    renderFinancialFormats();
  });
  $("add-transaction-group").addEventListener("click", openNewTransactionGroup);
  $("new-transaction-group").addEventListener("click", openNewTransactionGroup);
  $("transaction-group-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    await api("transaction-groups/save", {
      method: "POST",
      body: JSON.stringify({
        transaction_group_id: $("transaction-group-id").value,
        organisation_id: state.orgId,
        group_code: $("transaction-group-code").value,
        group_name: $("transaction-group-name").value,
        sort_order: $("transaction-group-sort").value,
        is_active: $("transaction-group-active").checked,
      }),
    });
    $("transaction-group-form").hidden = true;
    await ensureTransactionSetup(true);
    renderTransactionGroups();
  });
  $("add-transaction-type").addEventListener("click", () =>
    openNewTransactionType().catch((e) => alert(e.message)),
  );
  $("new-transaction-type").addEventListener("click", () =>
    openNewTransactionType().catch((e) => alert(e.message)),
  );
  $("add-transaction-line").addEventListener("click", () =>
    addTransactionTypeLine(),
  );
  $("transaction-type-financial").addEventListener(
    "change",
    toggleTransactionLineEditor,
  );
  $("transaction-type-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const financial = $("transaction-type-financial").checked;
    const moduleIds = selectedModuleIds("transaction-type-modules");
    if (!moduleIds.length) {
      showSetupTypeTab("transaction-type", "scope");
      return alert("Select at least one applicable module");
    }
    const lines = financial
      ? [...document.querySelectorAll(".transaction-type-line")].map((row) => ({
          line_code: row.querySelector(".tx-line-code").value,
          debit_credit: row.querySelector(".tx-line-drcr").value,
          gl_account_id: row.querySelector(".tx-line-gl").value,
          occurrence: row.querySelector(".tx-line-occurrence").value,
          amount_source: row.querySelector(".tx-line-amount-source").value,
          subledger_requirement: row.querySelector(
            ".tx-line-subledger-requirement",
          ).value,
          subledger_account_type_id:
            row.querySelector(".tx-line-subledger").value,
          line_description: row.querySelector(".tx-line-description").value,
          object_requirements: [
            ...row.querySelectorAll(
              ".tx-line-object-requirements .tx-line-classification-requirement",
            ),
          ].map((item) => ({
            type_id: item.querySelector(".tx-classification-type").value,
            requirement: item.querySelector(".tx-classification-requirement")
              .value,
            value_behaviour: item.querySelector(".tx-classification-behaviour")
              .value,
            accounting_object_id: item.querySelector(".tx-classification-value")
              .value,
          })),
          dimension_requirements: [
            ...row.querySelectorAll(
              ".tx-line-dimension-requirements .tx-line-classification-requirement",
            ),
          ].map((item) => ({
            type_id: item.querySelector(".tx-classification-type").value,
            requirement: item.querySelector(".tx-classification-requirement")
              .value,
            value_behaviour: item.querySelector(".tx-classification-behaviour")
              .value,
            accounting_dimension_id: item.querySelector(
              ".tx-classification-value",
            ).value,
          })),
        }))
      : [];
    if (financial && lines.length < 2)
      return alert(
        "Financial transaction types require at least two transaction lines",
      );
    await api("transaction-types/save", {
      method: "POST",
      body: JSON.stringify({
        transaction_type_id: $("transaction-type-id").value,
        organisation_id: state.orgId,
        transaction_group_id: $("transaction-type-group").value,
        type_code: $("transaction-type-code").value,
        type_name: $("transaction-type-name").value,
        type_description: $("transaction-type-description").value,
        module_ids: moduleIds,
        is_financial: financial,
        allow_additional_lines: $("transaction-type-additional-lines").checked,
        sort_order: $("transaction-type-sort").value,
        is_active: $("transaction-type-active").checked,
        lines,
      }),
    });
    setTransactionTypeEditorOpen(false);
    await ensureTransactionSetup(true);
    renderTransactionTypes();
  });
  $("add-role").addEventListener("click", openNewRole);
  $("new-role").addEventListener("click", openNewRole);
  $("add-master-permission").hidden = true;
  $("add-transaction-permission").addEventListener("click", () =>
    addPermissionLine("transaction"),
  );
  $("add-role-user").addEventListener("click", () => addRoleUserLine());
  $("role-admin").addEventListener("change", syncRoleModuleRequirement);
  document
    .querySelectorAll("[data-role-tab]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        showRoleTab(button.dataset.roleTab),
      ),
    );
  $("role-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const master_permissions = collectMasterPermissions();
    const transaction_permissions = [
      ...$("transaction-permission-lines").querySelectorAll(
        ".permission-line:not(.permission-line-head)",
      ),
    ].map((row) => ({
      division_id: row.querySelector(".permission-division").value,
      transaction_type_id: row.querySelector(".permission-resource").value,
      workflow_status: row.querySelector(".permission-workflow").value,
    }));
    const role_users = [
      ...$("role-user-lines").querySelectorAll(
        ".role-user-line:not(.role-user-line-head)",
      ),
    ].map((row) => ({
      email: row.querySelector(".role-user-email").value,
      valid_from: row.querySelector(".role-user-from").value,
      valid_to: row.querySelector(".role-user-to").value,
    }));
    const moduleIds = selectedModuleIds("role-modules");
    if (!$("role-admin").checked && !moduleIds.length) {
      showRoleTab("modules");
      alert("At least one module is required for a non-administrator role");
      return;
    }
    await api("permissions/save", {
      method: "POST",
      body: JSON.stringify({
        organisation_id: state.orgId,
        role_id: $("role-id").value,
        role_name: $("role-name").value,
        role_description: $("role-description").value,
        is_admin: $("role-admin").checked,
        is_active: $("role-active").checked,
        module_ids: moduleIds,
        master_permissions,
        transaction_permissions,
        role_users,
      }),
    });
    $("role-form").hidden = true;
    await ensurePermissions(true);
    renderRoles();
  });
  function patchDynamicSelects() {
    option(
      $("journal-type"),
      state.transactionTypes,
      "transaction_type_id",
      (t) => `${t.group_name}: ${t.type_name}`,
      "Manual / none",
    );
    option(
      $("journal-supplier"),
      state.accounts.filter(
        (account) =>
          account.account_kind === "subledger" &&
          state.subledgerAccountTypes.find(
            (type) =>
              type.subledger_account_type_id ===
              account.subledger_account_type_id,
          )?.type_code === "vendor",
      ),
      "account_id",
      (account) => `${account.account_code} - ${account.account_name}`,
      "Select supplier",
    );
    option(
      $("journal-vat-recipient"),
      state.legalEntities,
      "legal_entity_id",
      (entity) => `${entity.known_name} - ${entity.legal_name}`,
      "Select VAT recipient",
    );
    const selectedPeriod = $("journal-period")?.value || "";
    option(
      $("journal-period"),
      state.periods,
      "fiscal_period_id",
      (p) => `${p.period_code} (${p.status})`,
    );
    if (selectedPeriod) $("journal-period").value = selectedPeriod;
    if (!$("journal-period").value) syncJournalPeriodToDate();
  }
  const originalRenderAll = renderAll;
  renderAll = function () {
    originalRenderAll();
    patchDynamicSelects();
  };
  function installJournalClassificationHeader() {
    const target = $("journal-form")?.querySelector(".journal-header-right");
    if (!target || $("journal-supplier")) return;
    const fields = document.createElement("div");
    fields.className = "journal-supplier-fields";
    fields.innerHTML =
      '<label><span>Supplier</span><select id="journal-supplier"></select></label><label><span>VAT recipient</span><select id="journal-vat-recipient"></select></label><label><span>Supplier invoice number</span><input id="journal-supplier-invoice-number"></label><label><span>Supplier invoice date</span><input id="journal-supplier-invoice-date" type="date"></label>';
    target.append(fields);
  }
  function renameLineDefinitionControls() {
    const editor = $("transaction-line-editor");
    if (editor) editor.querySelector("h2").textContent = "Line Definitions";
  }
  installJournalClassificationHeader();
  renameLineDefinitionControls();
  $("journal-supplier").addEventListener("change", () =>
    document
      .querySelectorAll(".journal-line:not(.journal-line-head)")
      .forEach((row) => {
        const definition = journalDefinitionFor(
          row.querySelector(".line-definition")?.value,
        );
        if (definition?.subledger_type_code === "vendor")
          row.querySelector(".line-sub").value = $("journal-supplier").value;
      }),
  );
  installModuleField("ledger-family-form", "ledger-family-modules");
  installModuleField(
    "accounting-object-type-form",
    "accounting-object-type-modules",
  );
  installModuleField(
    "accounting-dimension-type-form",
    "accounting-dimension-type-modules",
  );
  installModuleField("transaction-type-form", "transaction-type-modules");
  installModuleField("role-form", "role-modules");
  installModuleIconEditor();
  installWorkflowUi();
  installSetupTypeEditors();
  installTransactionTypeEditorUi();
  installOrganisationTabs();
  $("role-admin").closest("label").lastChild.textContent =
    " Setup administrator";
  document.querySelectorAll("[data-menu-mode]").forEach((tab) => {
    tab.addEventListener("click", () => applyMenuMode(tab.dataset.menuMode));
    tab.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        applyMenuMode(tab.dataset.menuMode);
      }
    });
  });
  setupLegalEntityTabs();
  addPanelCloseButtons();
  syncRequiredMarkers();
  initSidebarResize();
  initSidebarCollapse();
  load().catch((e) => alert(e.message));
})();
