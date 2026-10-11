"use strict";
// Optional Playwright check using the production resize installer and stylesheet.
const { chromium } = require("playwright");
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../../..");
const source = fs.readFileSync(path.join(root, "Volumes/Core-ERP/public/app.js"), "utf8");
const installer = source.slice(source.indexOf("  function installResizableObjectEditors("), source.indexOf("  function openAccountEditor("));
const css = fs.readFileSync(path.join(root, "Volumes/Core-ERP/public/style.css"), "utf8");
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.ERP_BROWSER_EXECUTABLE ? { executablePath: process.env.ERP_BROWSER_EXECUTABLE } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const ids = ["account-form", "accounting-object-form", "accounting-dimension-form"];
    await page.setContent(`<style>${css}.view{position:relative;height:850px}</style>${ids.map((id, i) => `<section class="view" id="${["view-accounts", "view-accountingobjects", "view-accountingdimensions"][i]}">${i ? '<div class="split">' : ''}<form hidden class="panel accounting-record-editor" id="${id}"><h2>Edit record</h2><div><label>Fields<textarea></textarea></label></div><div class="actions account-editor-actions"><button type="button">Save</button></div></form>${i ? '</div>' : ''}</section>`).join("")}`);
    await page.evaluate(installer => { window.$ = id => document.getElementById(id); (0, eval)(installer); installResizableObjectEditors(); }, installer);
    for (const id of ids) {
      await page.evaluate(id => { document.querySelectorAll(".view").forEach(view => { view.style.display = view.contains(document.getElementById(id)) ? "block" : "none"; }); document.getElementById(id).hidden = false; }, id);
      const form = page.locator(`#${id}`), handle = form.getByRole("button", { name: "Resize editor" });
      const initial = await form.boundingBox();
      const grip = await handle.boundingBox();
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
      await page.mouse.down(); await page.mouse.move(grip.x + grip.width / 2 - 100, grip.y + grip.height / 2 + 100); await page.mouse.up();
      const grown = await form.boundingBox();
      assert.ok(grown.width > initial.width + 90, id);
      assert.ok(grown.height > initial.height, id);
      assert.equal(await form.evaluate(el => getComputedStyle(el).alignContent), "start", id);
      assert.equal(await form.locator("label").evaluate(el => getComputedStyle(el).alignItems), "start", id);
      const titleBottom = await form.locator("h2").evaluate(el => el.getBoundingClientRect().bottom);
      const fieldTop = await form.locator(":scope > div").first().evaluate(el => el.getBoundingClientRect().top);
      assert.ok(fieldTop - titleBottom <= 21, `${id}: resized rows must retain compact spacing`);
      await handle.focus(); await page.keyboard.press("ArrowRight");
      assert.ok((await form.boundingBox()).width < grown.width, id);
      for (let n = 0; n < 15; n++) await page.keyboard.press("Shift+ArrowLeft");
      const limited = await form.boundingBox(); assert.ok(limited.x >= 0 && limited.x + limited.width <= 1200, id);
      await page.evaluate(id => { document.getElementById(id).hidden = true; }, id);
      await page.evaluate(id => { document.getElementById(id).hidden = false; }, id);
      assert.equal(await form.evaluate(el => el.style.width), "", id);
      assert.equal(await form.evaluate(el => el.style.height), "", id);
      await page.setViewportSize({ width: 390, height: 650 });
      await handle.focus(); await page.keyboard.press("ArrowLeft");
      const mobile = await form.boundingBox(); assert.ok(mobile.x >= 0 && mobile.x + mobile.width <= 390, id);
      await page.setViewportSize({ width: 1200, height: 900 });
    }
    console.log("Three editor resize checks passed: pointer, keyboard, bounds, reset and mobile.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
