"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { validateEditorLayout, seedEditorLayouts } = require("../api/_shared/erp/editor-layout");
const { defaultLayout, collectUiSchema } = require("../public/record-editor-layout");
const defaults = require("../seeds/template-defaults.json");

test("editor layout accepts only Tabs/Stacked and retains existing UI configuration", () => {
  assert.equal(defaultLayout({}), "stacked");
  assert.equal(defaultLayout(), "stacked");
  assert.equal(defaultLayout({ ui_schema_json: { default_editor_layout: "tabs" } }), "tabs");
  assert.equal(defaultLayout({ ui_schema_json: { default_editor_layout: "stacked" } }), "stacked");
  for (const layout of ["tabs", "stacked", undefined]) assert.equal(validateEditorLayout({ default_editor_layout: layout }), null);
  for (const layout of [null, "Stacked", "invalid", {}, 0]) assert.ok(validateEditorLayout({ default_editor_layout: layout }));
  for (const ui of [null, [], "tabs"]) assert.ok(validateEditorLayout(ui));
  assert.deepEqual(JSON.parse(collectUiSchema({ dataset: { legacyUiSchema: '{"sections":[{"label":"General"}],"custom":true}' } }, "stacked")),
    { sections: [{ label: "General" }], custom: true, default_editor_layout: "stacked" });
});

for (const endpoint of ["subledger-account-types/save", "accounting-objects/save-type", "accounting-dimensions/save-type"]) {
  test(`${endpoint} validates and persists layout through the existing scoped type save`, async () => {
    const file = require.resolve(`../api/${endpoint}`), actualRequire = createRequire(file);
    async function run(layout, admin = true) {
      const calls = [];
      const scope = { module: { exports: {} }, require: name => {if(name.endsWith('/context'))return require('../api/_shared/context');
        if (name.endsWith("/erp")) return {
          authTenant: async () => ({ tenantId: "tenant" }), requireAdmin: () => admin ? null : { status: 403, body: {} },
          clean: (v, fallback = "") => String(v ?? fallback), nullable: v => v || null, bool: Boolean,
          parseJson: (v, fallback) => v === undefined ? fallback : JSON.parse(v),
          validateSchemaDefinition: () => [], validateWorkflowPath: async () => null,
        };
        if (name.endsWith("/modules")) return { moduleIds: () => [], validateModules: async () => null, replaceLinks: async () => {} };
        return actualRequire(name);
      } };
      vm.runInNewContext(fs.readFileSync(file, "utf8"), scope);
      const result = await scope.module.exports({ req: { method: "POST" },
        body: { organisation_id: "org", type_code: "example", type_name: "Example", workflow_path_id: "path", schema_json: "{}", ui_schema_json: JSON.stringify({ default_editor_layout: layout }) },
        send: (status, body) => ({ status, body }),
        broker: async (profile, action, query) => { calls.push(query); return { rows: [{ subledger_account_type_id: "id", accounting_object_type_id: "id", accounting_dimension_type_id: "id" }], rowCount: 1 }; },
      });
      return { result, calls };
    }
    for (const layout of ["tabs", "stacked", undefined]) {
      const { result, calls } = await run(layout);
      assert.ok(result.type || result.subledger_account_type, JSON.stringify(result));
      assert.equal(calls[0].values[0], "tenant"); assert.ok(calls[0].values.includes("org"));
      assert.ok(calls[0].values.some(value => typeof value === "string" && value.includes(JSON.stringify({ default_editor_layout: layout }))));
    }
    const invalid = await run("invalid"); assert.equal(invalid.result.status, 400); assert.equal(invalid.calls.length, 0);
    const denied = await run("stacked", false); assert.equal(denied.result.status, 403); assert.equal(denied.calls.length, 0);
  });
}

test("seed layouts are defined in JSON, scoped to seeded master types and exclude transactions", async () => {
  let batch;
  await seedEditorLayouts({ broker: async (_profile, _action, query) => { batch = query; } }, { tenantId: "tenant" }, "org", defaults);
  assert.equal(batch.statements.length, 3);
  for (const statement of batch.statements) {
    assert.match(statement.text, /tenant_id=\$1 AND organisation_id=\$2 AND type_code=ANY/);
    assert.match(statement.text, /ui_schema_json=COALESCE/);
    assert.doesNotMatch(statement.text, /erp_transaction/);
    assert.equal(statement.values[3], "tabs");
  }
  await assert.rejects(() => seedEditorLayouts({}, {}, "org", { ...defaults, defaultEditorLayouts: { subledger_account: "bad" } }), /Invalid seeded/);
});

let chromium;
try { ({ chromium } = require("playwright")); } catch {}
test('native modal record editors keep Save visible while long sections scroll', {skip:!chromium}, async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.SHOWIF_BROWSER_CHANNEL?{channel:process.env.SHOWIF_BROWSER_CHANNEL}:{})});
 try{
  const page=await browser.newPage();
  for(const id of ['account-form','accounting-object-form','accounting-dimension-form'])for(const width of [1200,390]){
   await page.setViewportSize({width,height:640});
   await page.setContent(`<style>${fs.readFileSync(require.resolve('../public/style.css'),'utf8')}</style><form id="${id}" class="panel form record-layout-editor" hidden><div class="record-editor-header"><h2>Edit record</h2><button type="button" class="panel-close">×</button></div><div class="record-editor-body"><div style="height:1800px">Long configured sections</div></div><div class="account-editor-actions"><button type="submit">Save</button></div></form>`);
   for(const script of ['modal-editors','movable-panels'])await page.addScriptTag({content:fs.readFileSync(require.resolve('../public/'+script),'utf8')});
   await page.evaluate(()=>{erpModalEditors.install();erpMovablePanels.install();document.querySelector('form').hidden=false;});
   await page.locator('dialog').waitFor({state:'visible'});
   for(const layout of ['stacked','tabs']){
    await page.locator('form').evaluate((form,layout)=>form.dataset.editorLayout=layout,layout);
    const check=async()=>{
     const geometry=await page.evaluate(()=>{
      const form=document.querySelector('form'),body=form.querySelector('.record-editor-body'),save=form.querySelector('[type=submit]');
      body.scrollTop=body.scrollHeight;
      const a=form.getBoundingClientRect(),b=save.getBoundingClientRect();
      return {scrolls:body.scrollHeight>body.clientHeight,inside:b.top>=a.top&&b.bottom<=a.bottom&&b.bottom<=innerHeight&&b.right<=innerWidth,outerScroll:form.scrollHeight>form.clientHeight+1};
     });
     assert.ok(geometry.scrolls);assert.ok(geometry.inside,JSON.stringify(geometry));assert.equal(geometry.outerScroll,false);
    };
    await check();
    await page.evaluate(()=>erpMovablePanels.resize(document.querySelector('form'),500,400));await check();
    await page.locator('.editor-move-handle').focus();await page.keyboard.press('ArrowDown');await check();
   }
  }
 }finally{await browser.close();}
});
test("seeded editors retain data and grids across layouts, expand independently and scroll within fixed chrome", { skip: !chromium }, async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.SHOWIF_BROWSER_CHANNEL ? { channel: process.env.SHOWIF_BROWSER_CHANNEL } : {}) });
  try {
    const page = await browser.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const app = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
    const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
    const extract = name => {
      const start = app.indexOf(`  function ${name}(`);
      const end = app.indexOf("\n  function ", start + 5);
      return app.slice(start, end);
    };
    const examples = [
      ["account", defaults.ledgerFamilySchemas.asset, { assetTag: "VEH-001", assetClass: "ppe", assetSubClass: "vehicles" }],
      ["accounting-object", defaults.accountingObjectTypeMetadata.property.schema_json, { physicalAddress: "Example warehouse site", propertyKind: "building" }],
      ["accounting-dimension", defaults.accountingDimensionTypeMetadata.service.schema_json, {}],
    ];
    for (const [prefix, schema, detail] of examples) for (const width of [1100, 390]) {
      await page.setViewportSize({ width, height: 640 });
      const start = html.search(new RegExp(`<form\\s+id="${prefix}-form"`));
      const markup = html.slice(start, html.indexOf("</form>", start) + 7).replace(/\s+hidden(?=[\s>])/, "");
      await page.goto("about:blank");
      await page.setContent(`<style>body{display:block!important;padding:12px!important;overflow:auto!important}.record-layout-editor{width:min(520px,100%)}</style>${markup}`);
      await page.addStyleTag({ content: fs.readFileSync(require.resolve("../public/style.css"), "utf8") });
      await page.addScriptTag({ content: fs.readFileSync(require.resolve("../public/schema-visibility"), "utf8") });
      await page.addScriptTag({ content: fs.readFileSync(require.resolve("../public/record-editor-layout"), "utf8") });
      await page.addScriptTag({ content: fs.readFileSync(require.resolve("../public/movable-panels"), "utf8") });
      await page.addScriptTag({ content: `const $=id=>document.getElementById(id);const state={orgId:"",currencies:[],accounts:[],accountingObjects:[]};const pretty=name=>name;
        const objectActions={editor(){}};
        function syncRequiredMarkers(){};function loadResourceAssignmentEditor(){return Promise.resolve()};function loadEntityDocuments(){return Promise.resolve()};function loadObjectVersions(){return Promise.resolve()};function renderWorkflowHistory(){};
        const recordComments={show(){}};
        ${extract("installResourceAssignmentTab")}
        ${extract("showResourceEditorTab")}
        ${extract("installObjectVersionTabs")}
        ${extract("installWorkflowHistoryTabs")}
        ${extract("syncRecordTypeDescription")}
        
        ${app.slice(app.indexOf("  function schemaFields("), app.indexOf("  function syncRecordTypeDescription("))}
        ${app.slice(app.indexOf("  function collectSchemaDetail("), app.indexOf("  function collectAccountDetail("))} ` });
      assert.deepEqual(errors, []);
      await page.evaluate(({ prefix, schema, detail }) => {
        const form = $(`${prefix}-form`); form.hidden = false;
        const add = document.createElement("button"); add.id = `new-${prefix}`; document.body.append(add);
        installResourceAssignmentTab(`${prefix}-form`, prefix);
        installObjectVersionTabs(); installWorkflowHistoryTabs();
        const commentsTab=document.createElement("button");commentsTab.type="button";commentsTab.textContent="Comments";
        commentsTab.setAttribute(prefix==="account"?"data-account-fixed-tab":"data-record-tab","comments");
        form.querySelector(".account-editor-tabs").append(commentsTab);
        const comments=document.createElement("section");comments.setAttribute(prefix==="account"?"data-account-fixed-panel":"data-record-panel","comments");comments.textContent="No comments yet.";
        form.insertBefore(comments,form.querySelector(".account-editor-actions"));
        // Match the actual shared heading block and installed optional panels.
        const header = document.createElement("header"); header.className = "record-editor-header";
        form.querySelector("h2").before(header); header.append(form.querySelector("h2"));
        const description = document.createElement("p"); description.className = "record-type-description"; description.textContent = "Seeded record editor"; header.append(description);
        const layout = erpRecordEditorLayout.install({ form, prefix, selectTab: id => prefix === "account" ? showAccountEditorTab(id) : showAccountingEditorTab(prefix, id) });
        recordEditorLayouts.set(prefix, layout);
        syncRecordTypeDescription(prefix, {type_name:"Fleet Vehicle",type_description:"Seeded record editor",ui_schema_json:{default_editor_layout:"stacked"}}, prefix === "account" ? "Sub Ledger" : prefix === "accounting-object" ? "Accounting Object" : "Accounting Dimension");
        layout.bind({ ui_schema_json: { default_editor_layout: "stacked" } });
        renderSchemaDetailFields(`${prefix}-detail-fields`, schema, detail); layout.reset();
        // The production editor is floating; exercise movement together with the actual layout renderer.
        form.style.position = "absolute";
        erpMovablePanels.install();
      }, { prefix, schema, detail });
      await page.waitForTimeout(40);
      const compact = await page.locator("form").evaluate(form => {
        const header = form.querySelector('.record-editor-header'), toolbar = form.querySelector('.record-editor-layout-switch');
        const title = header.querySelector('h2'), context = header.querySelector('.record-type-context');
        return { inside: header.contains(toolbar), titleFirst: title.getBoundingClientRect().top < context.getBoundingClientRect().top,
          beside: toolbar.getBoundingClientRect().top < context.getBoundingClientRect().bottom,
          context: context.textContent, top: form.getBoundingClientRect().top };
      });
      assert.equal(compact.inside, true); assert.equal(compact.titleFirst, true); assert.equal(compact.beside, true);
      assert.match(compact.context, / \/ Fleet Vehicle$/);
      await page.locator(".editor-move-handle").first().focus();
      await page.locator(".editor-move-handle").first().press("ArrowRight");
      assert.equal(await page.locator("form").evaluate(node => node.style.position), "fixed");
      assert.equal(await page.locator("form").getAttribute("data-editor-layout"), "stacked");
      assert.ok(await page.locator(".record-editor-section-toggle").count() >= 3);
      assert.equal(await page.locator('.record-editor-section-toggle[aria-expanded="false"]').count(), 0);
      const nameInput = page.locator(`#${prefix}-name`);
      await nameInput.fill("Preview");
      const invalidName = page.locator(`#${prefix}-name`);
      await invalidName.fill("");
      await page.locator(".record-editor-section-toggle").first().click();
      await invalidName.evaluate(node => node.checkValidity());
      assert.equal(await page.locator(".record-editor-section-toggle").first().getAttribute("aria-expanded"), "true");
      await invalidName.fill("Preview");
      const before = await page.evaluate(({ prefix, schema }) => collectSchemaDetail(`${prefix}-detail-fields`, schema), { prefix, schema });
      await page.locator(".record-editor-section-toggle").first().click();
      await page.locator(".record-editor-section-toggle").nth(1).click();
      assert.equal(await page.locator('.record-editor-section-toggle[aria-expanded="false"]').count(), 2);
      await page.locator(".record-editor-section-toggle").nth(1).click();
      assert.equal(await page.locator('.record-editor-section-toggle[aria-expanded="false"]').count(), 1);
      await page.locator('.schema-grid-heading button').first().click();
      assert.equal(await page.locator(".schema-grid-row").count(), 1, JSON.stringify({ prefix, width, errors }));
      const row = page.locator('.schema-grid-row [data-detail-field]').first();
      await row.fill((await row.getAttribute("type")) === "date" ? "2026-10-15" : "Example characteristic");
      if ((await row.getAttribute("type")) !== "date") {
        await row.fill(""); await row.pressSequentially("Characteristic");
        assert.equal(await row.inputValue(), "Characteristic");
        assert.equal(await row.evaluate(node => node === document.activeElement), true);
      }
      const added = await page.evaluate(({ prefix, schema }) => collectSchemaDetail(`${prefix}-detail-fields`, schema), { prefix, schema });
      await page.locator('[data-editor-layout="tabs"]').click();
      await page.locator('[data-editor-layout="stacked"]').click();
      const after = await page.evaluate(({ prefix, schema }) => collectSchemaDetail(`${prefix}-detail-fields`, schema), { prefix, schema });
      assert.deepEqual(after, added); for (const key of Object.keys(detail)) assert.equal(after[key], before[key]);
      assert.equal(await page.locator('.record-editor-section-toggle[aria-expanded="false"]').count(), 0);
      const geometry = await page.evaluate(() => {
        const header = document.querySelector('.record-editor-header'), footer = document.querySelector('.account-editor-actions'), body = document.querySelector('.record-editor-body');
        const top = header.getBoundingClientRect().top, bottom = footer.getBoundingClientRect().bottom;
        body.scrollTop = body.scrollHeight;
        return { scrolls: body.scrollHeight > body.clientHeight, moved: top !== header.getBoundingClientRect().top || bottom !== footer.getBoundingClientRect().bottom, bottom, fits: document.documentElement.scrollWidth <= innerWidth };
      });
      assert.equal(geometry.scrolls, true); assert.equal(geometry.moved, false); assert.ok(geometry.bottom <= 640); assert.equal(geometry.fits, true);
      await page.locator(".record-editor-body").evaluate(node => { node.scrollTop = 0; });
      if (process.env.EDITOR_LAYOUT_SCREENSHOT_DIR) await page.screenshot({path: require("node:path").join(process.env.EDITOR_LAYOUT_SCREENSHOT_DIR, `${prefix}-stacked-${width}.png`), fullPage:true});
      // Reopening always resets to the type default; an unsaved preference has no persistence.
      await page.locator('[data-editor-layout="tabs"]').click();
      if (process.env.EDITOR_LAYOUT_SCREENSHOT_DIR) await page.screenshot({path: require("node:path").join(process.env.EDITOR_LAYOUT_SCREENSHOT_DIR, `${prefix}-tabs-${width}.png`), fullPage:true});
      await page.evaluate(prefix => recordEditorLayouts.get(prefix).reset(), prefix);
      assert.equal(await page.locator("form").getAttribute("data-editor-layout"), "stacked");
      // Regenerating a schema and switching to/from the raw-JSON fallback cannot detach the container.
      await page.evaluate(({ prefix, schema, detail }) => {
        renderSchemaDetailFields(`${prefix}-detail-fields`, {}, { sample: "retained" });
        renderSchemaDetailFields(`${prefix}-detail-fields`, schema, detail);
      }, { prefix, schema, detail });
      assert.equal(await page.locator(`#${prefix}-detail-fields`).count(), 1);
      if (prefix === "accounting-object") {
        await page.selectOption('[data-detail-field="propertyKind"]', "land");
        assert.equal(await page.locator('[data-detail-grid="features"]').evaluate(node => node.closest('.record-editor-section').hidden), true);
        await page.selectOption('[data-detail-field="propertyKind"]', "building");
        assert.equal(await page.locator('[data-detail-grid="features"]').evaluate(node => node.closest('.record-editor-section').hidden), false);
      }
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
