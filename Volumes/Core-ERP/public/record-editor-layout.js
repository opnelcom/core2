(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.erpRecordEditorLayout = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function defaultLayout(type) {
    return type?.ui_schema_json?.default_editor_layout === "stacked" ? "stacked" : "tabs";
  }
  function installDefaultControl(anchor, prefix) {
    const label = document.createElement("label");
    label.append(document.createTextNode("Default editor layout"));
    const select = document.createElement("select");
    select.id = `${prefix}-default-editor-layout`;
    for (const [value, text] of [["tabs", "Tabs"], ["stacked", "Stacked"]]) {
      const option = document.createElement("option");
      option.value = value; option.textContent = text; select.append(option);
    }
    label.append(select); anchor.closest("label").after(label);
  }
  function collectUiSchema(form, layout) {
    return JSON.stringify({ ...JSON.parse(form.dataset.legacyUiSchema || "{}"), default_editor_layout: layout });
  }
  function install({ form, prefix, selectTab }) {
    const schema = document.getElementById(`${prefix}-detail-fields`);
    const bar = form.querySelector(".account-editor-tabs");
    const navigation = bar.closest(".record-tab-navigation") || bar;
    const footer = form.querySelector(".account-editor-actions");
    const body = document.createElement("div");
    body.className = "record-editor-body";
    const toolbar = document.createElement("div");
    toolbar.className = "record-editor-layout-switch";
    toolbar.setAttribute("role", "group"); toolbar.setAttribute("aria-label", "Editor layout");
    toolbar.innerHTML = '<button type="button" data-editor-layout="tabs" aria-label="Tabbed view" title="Tabbed view"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 8h18v13H3zM3 8V3h6v5M9 3h6v5M15 3h6v5"/><path d="M3 3h6v5H3z" fill="currentColor"/></svg></button><button type="button" data-editor-layout="stacked" aria-label="Stacked view" title="Stacked view"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5"/></svg></button>';
    form.insertBefore(toolbar, navigation); form.insertBefore(body, footer);
    body.append(navigation);
    form.classList.add("record-layout-editor");
    let mode = "tabs", type, active = prefix === "account" ? "identification" : "general";
    let pending, loading = false, sectionSequence = 0;
    const sections = new Map();
    const idFor = button => button.dataset.accountFixedTab || button.dataset.recordTab || `schema:${button.dataset.accountDetailTab}`;
    function panelFor(id) {
      if (id === "schema:additional") return schema;
      const attribute = id.startsWith("schema:") ? "data-account-detail-panel" : prefix === "account" ? "data-account-fixed-panel" : "data-record-panel";
      const value = id.startsWith("schema:") ? id.slice(7) : id;
      return [...form.querySelectorAll(`[${attribute}]`)].find(panel => panel.getAttribute(attribute) === value);
    }
    function refresh() {
      const buttons = [...bar.querySelectorAll("button")];
      for (const [id, section] of sections) {
        if (!buttons.some(button => idFor(button) === id) || !section.panel.isConnected) {
          // A regenerated schema owns its new fields; remove only the old wrapper.
          if (section.panel.isConnected) section.wrapper.before(section.panel);
          section.wrapper.remove(); sections.delete(id);
        }
      }
      let schemaPlaced = false, bodyIndex = 1;
      const place = node => {
        if (body.children[bodyIndex] !== node) body.insertBefore(node, body.children[bodyIndex] || null);
        bodyIndex++;
      };
      for (const button of buttons) {
        const id = idFor(button), panel = panelFor(id);
        if (!panel) continue;
        let section = sections.get(id);
        if (!section) {
          const wrapper = document.createElement("section"); wrapper.className = "record-editor-section";
          const heading = document.createElement("h3"); heading.className = "record-editor-section-heading";
          const toggle = document.createElement("button"); toggle.type = "button";
          toggle.className = "record-editor-section-toggle";
          const panelId = panel.id || `${prefix}-section-${++sectionSequence}`;
          panel.id = panelId; toggle.setAttribute("aria-controls", panelId);
          heading.append(toggle); panel.before(wrapper); wrapper.append(heading, panel);
          section = { wrapper, panel, heading, toggle, collapsed: false }; sections.set(id, section);
          toggle.addEventListener("click", () => { section.collapsed = !section.collapsed; refresh(); });
        }
        section.toggle.textContent = `${section.collapsed ? "▸" : "▾"} ${button.textContent.trim()}`;
        section.toggle.setAttribute("aria-expanded", String(!section.collapsed));
        section.heading.hidden = mode !== "stacked";
        const unavailable = button.hidden || panel.dataset.showifHidden === "true";
        section.wrapper.hidden = unavailable || (mode === "tabs" && id !== active);
        panel.hidden = unavailable || (mode === "stacked" ? section.collapsed : id !== active);
        if (id.startsWith("schema:") && panel !== schema) {
          if (!schemaPlaced) { place(schema); schemaPlaced = true; }
        } else place(section.wrapper);
      }
      schema.hidden = mode === "tabs" ? !active.startsWith("schema:") : false;
      // The raw JSON fallback uses the schema container itself as its section.
      if (sections.has("schema:additional")) {
        const section = sections.get("schema:additional");
        schema.hidden = section.wrapper.hidden || (mode === "stacked" && section.collapsed);
      }
      navigation.hidden = mode === "stacked";
      form.dataset.editorLayout = mode;
      toolbar.hidden = !type;
      toolbar.querySelectorAll("button").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.editorLayout === mode)));
      form.querySelectorAll(":scope > .account-core-fields").forEach(node => { if (!node.children.length) node.remove(); });
    }
    function loadStacked() {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => {
        if (form.hidden || mode !== "stacked") return;
        loading = true;
        // Existing handlers retain ownership of permissions and asynchronous content.
        for (const button of bar.querySelectorAll("button")) {
          const id = idFor(button);
          if (!button.hidden && ["resources", "documents", "versions", "comments"].includes(id)) selectTab(id);
        }
        loading = false; refresh();
      });
    }
    function setMode(value) {
      mode = value === "stacked" && type ? "stacked" : "tabs";
      if (mode === "stacked") { sections.forEach(section => { section.collapsed = false; }); loadStacked(); }
      else selectTab(active);
      refresh(); body.scrollTop = 0;
    }
    function sizeToViewport() {
      if (form.hidden) return;
      form.style.setProperty("--record-editor-top", `${Math.max(0, form.getBoundingClientRect().top)}px`);
    }
    window.addEventListener("resize", sizeToViewport);
    toolbar.addEventListener("click", event => {
      const button = event.target.closest("[data-editor-layout]");
      if (button) setMode(button.dataset.editorLayout);
    });
    form.addEventListener("invalid", event => {
      for (const [id, section] of sections) if (section.panel.contains(event.target)) {
        section.collapsed = false; active = id; refresh();
      }
    }, true);
    return {
      refresh,
      bind(value) { type = value; },
      reset() { active = prefix === "account" ? "identification" : "general"; sections.forEach(section => { section.collapsed = false; }); setMode(defaultLayout(type)); sizeToViewport(); },
      selected(id) {
        if (!loading) active = id;
        if (mode === "stacked") {
          const section = sections.get(id); if (section && !loading) section.collapsed = false;
        }
        refresh();
      },
    };
  }
  return { defaultLayout, installDefaultControl, collectUiSchema, install };
});
