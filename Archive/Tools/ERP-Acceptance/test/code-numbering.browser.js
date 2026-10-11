"use strict";
const { chromium } = require("playwright");
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../../.."), erp = path.join(root, "Volumes/Core-ERP");
const source = fs.readFileSync(path.join(erp, "public/app.js"), "utf8");
const extract = name => {
  const start = source.indexOf(`  function ${name}(`);
  assert.ok(start >= 0, name);
  const rest = source.slice(start + 4), next = rest.search(/\n  (?:async )?function /);
  return source.slice(start, next < 0 ? source.length : start + 4 + next);
};
const functions = ["ensureTextareaField", "moveControlToPanel", "showSetupTypeTab", "installSetupTypeTabs",
  "installResourceRoleMappingField", "installCodeNumberingFields", "updateCodeNumberingFields", "loadCodeNumberingFields",
  "collectCodeNumberingFields", "updateRecordCodeField", "updateAccountCodeNumbering", "updateAccountingCodeNumbering",
  "installSetupTypeEditors", "setRequiredMarker", "syncRequiredMarkers", "accountingMasterConfig"].map(extract).join("\n");
const screens = [["glaccounttypes", "gl-account-type"], ["ledgerfamilies", "ledger-family"],
  ["accountingobjecttypes", "accounting-object-type"], ["accountingdimensiontypes", "accounting-dimension-type"]];
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.ERP_BROWSER_EXECUTABLE ? { executablePath: process.env.ERP_BROWSER_EXECUTABLE } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const html = fs.readFileSync(path.join(erp, "public/index.html"), "utf8").replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
    await page.setContent(html);
    await page.addStyleTag({ content: fs.readFileSync(path.join(erp, "public/style.css"), "utf8") });
    await page.evaluate(functions => {
      window.$ = id => document.getElementById(id);
      window.state = { glAccountTypes: [], subledgerAccountTypes: [], accountingObjectTypes: [], accountingDimensionTypes: [] };
      window.selectedAccountScopeCode = "gl";
      window.addResourceRoleMappingRow = () => {};
      (0, eval)(functions); installSetupTypeEditors();
      for (const view of document.querySelectorAll(".view")) view.hidden = true;
    }, functions);
    fs.mkdirSync(path.join(root, "tmp/code-numbering-browser"), { recursive: true });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const [view, prefix] of screens) {
        await page.evaluate(({ view, prefix }) => {
          for (const section of document.querySelectorAll(".view")) section.hidden = true;
          $(`view-${view}`).hidden = false;
          $(`${prefix}-form`).hidden = true;
          loadCodeNumberingFields(prefix, {});
        }, { view, prefix });
        const bounds = await page.locator(`#view-${view} .split`).boundingBox();
        const list = await page.locator(`#view-${view} .split > .panel`).first().boundingBox();
        assert.ok(list.width >= bounds.width - 2, `${prefix} closed list full width at ${width}`);
        await page.evaluate(prefix => { $(`${prefix}-form`).hidden = false; showSetupTypeTab(prefix, "definition"); }, prefix);
        const mode = page.locator(`#${prefix}-numbering-mode`);
        assert.equal(await mode.inputValue(), "manual");
        assert.equal(await page.locator(`#${prefix}-numbering-status`).isVisible(), false);
        assert.equal(await page.locator(`#${prefix}-numbering-start`).isVisible(), false);
        await mode.selectOption("automatic");
        await page.locator(`#${prefix}-numbering-start`).fill("100");
        await page.locator(`#${prefix}-numbering-end`).fill("110");
        await page.locator(`#${prefix}-numbering-padding`).fill("6");
        await page.locator(`#${prefix}-numbering-prefix`).fill("PROP-");
        assert.ok((await page.locator(`#${prefix}-numbering-status`).textContent()).includes("PROP-000100"));
        assert.deepEqual(await page.evaluate(prefix => collectCodeNumberingFields(prefix), prefix), { mode: "automatic", start: 100, end: 110, padding: 6, prefix: "PROP-" });
        const form = await page.locator(`#${prefix}-form`).boundingBox();
        assert.ok(form.y + form.height <= 1000, `${prefix} editor fits viewport at ${width}`);
        const footer = await page.locator(`#${prefix}-form .account-editor-actions`).boundingBox();
        assert.ok(footer.y + footer.height <= 1000, `${prefix} Save remains visible at ${width}: ${JSON.stringify(footer)}`);
        const containing = await page.locator(`#view-${view}`).boundingBox();
        assert.ok(form.x >= containing.x && form.x + form.width <= containing.x + containing.width + 1, `${prefix} anchored within view`);
        const row = await page.locator(`#${prefix}-numbering-mode`).boundingBox();
        const caption = await page.locator(`#${prefix}-numbering-mode`).locator("..").locator(".account-field-caption").boundingBox();
        assert.ok(row.x > caption.x + caption.width, `${prefix} label left/control right at ${width}`);
        assert.ok(row.x + row.width <= form.x + form.width, `${prefix} field fits panel`);
        await page.locator(`[data-setup-type-tab="${prefix}"][data-tab="roles"]`).click();
        await page.locator(`[data-setup-type-tab="${prefix}"][data-tab="definition"]`).click();
        assert.equal(await page.locator(`#${prefix}-numbering-prefix`).inputValue(), "PROP-");
        // Invalid numbering in a hidden tab reveals Definition before browser focus.
        await page.locator(`#${prefix}-numbering-end`).fill("99");
        await page.locator(`[data-setup-type-tab="${prefix}"][data-tab="roles"]`).click();
        await page.evaluate(prefix => $(`${prefix}-numbering-end`).reportValidity(), prefix);
        assert.equal(await mode.isVisible(), true);
        await page.evaluate(prefix => loadCodeNumberingFields(prefix, { code_numbering: { mode: "automatic", start: 100, end: 110, padding: 6, prefix: "PROP-" }, code_number_next: "111" }), prefix);
        assert.ok((await page.locator(`#${prefix}-numbering-status`).textContent()).includes("exhausted"));
        await page.locator(`#${prefix}-form`).evaluate(form => { form.scrollTop = form.scrollHeight; });
        await page.screenshot({ path: path.join(root, `tmp/code-numbering-browser/${prefix}-${width}.png`), fullPage: true });
        // Reopening another/new type clears previous settings and the exhausted counter.
        await page.evaluate(prefix => loadCodeNumberingFields(prefix, {}), prefix);
        assert.equal(await mode.inputValue(), "manual");
        assert.equal(await page.locator(`#${prefix}-numbering-start`).inputValue(), "");
      }
    }
    // Actual built-in record inputs share manual/automatic behaviour.
    for (const prefix of ["account", "accounting-object", "accounting-dimension"]) {
      await page.evaluate(prefix => { $(`${prefix}-code`).value = "entered"; updateRecordCodeField(prefix, { code_numbering: { mode: "automatic" } }, false); }, prefix);
      assert.equal(await page.locator(`#${prefix}-code`).inputValue(), "");
      assert.equal(await page.locator(`#${prefix}-code`).getAttribute("readonly"), "");
      await page.evaluate(prefix => { $(`${prefix}-code`).value = "00100"; updateRecordCodeField(prefix, { code_numbering: { mode: "automatic" } }, true); }, prefix);
      assert.equal(await page.locator(`#${prefix}-code`).inputValue(), "00100");
      await page.evaluate(prefix => updateRecordCodeField(prefix, { code_numbering: { mode: "manual" } }, false), prefix);
      assert.equal(await page.locator(`#${prefix}-code`).getAttribute("readonly"), null);
      assert.equal(await page.locator(`#${prefix}-code`).getAttribute("required"), "");
    }
    assert.deepEqual(errors, []);
    console.log("Code numbering browser checks passed: four actual Setup screens, full-width closed grids, anchored editors, desktop/mobile alignment, settings/preview, tab retention, invalid tab reveal, exhaustion/reset and record code controls.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
