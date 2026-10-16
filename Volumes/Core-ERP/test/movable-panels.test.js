"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
let chromium;
try { ({ chromium } = require("playwright")); } catch {}

test("real ERP floating editors drag by heading, retain controls, reset on reopening and remain bounded", { skip: !chromium }, async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.SHOWIF_BROWSER_CHANNEL ? { channel: process.env.SHOWIF_BROWSER_CHANNEL } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } }), errors = [], requests = [];
    page.on("pageerror", error => errors.push(error.stack));
    page.on("dialog", dialog => dialog.dismiss());
    await page.route("https://erp.test/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith("/erp/api/")) {
        requests.push({ method: route.request().method(), path: url.pathname });
        return route.fulfill({ json: { organisations: [], currencies: [], countries: [], subledger_account_types: [] } });
      }
      const file = path.join(__dirname, "../public", url.pathname === "/erp/" ? "index.html" : url.pathname.replace(/^\/erp\//, ""));
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: "Not found" });
      return route.fulfill({ contentType: file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html", body: fs.readFileSync(file) });
    });
    await page.goto("https://erp.test/erp/", { waitUntil: "networkidle" });
    async function open(id) {
      await page.evaluate(id => {
        document.querySelectorAll(".view").forEach(view => { view.hidden = true; });
        let node = document.getElementById(id);
        while (node && node !== document.body) { if (node.hidden) node.hidden = false; node = node.parentElement; }
      }, id);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
    async function drag(panel, dx = -70, dy = 15) {
      const heading = panel.locator(".editor-drag-heading").first();
      const h = await heading.boundingBox();
      // The move button shares the heading's drag behaviour and supplies a reliable hit target.
      const handle = panel.locator(".editor-move-handle").first(), hit = await handle.boundingBox();
      assert.ok(h && hit);
      await page.mouse.move(hit.x + hit.width / 2, hit.y + hit.height / 2);
      await page.mouse.down();
      await page.mouse.move(hit.x + hit.width / 2 + dx, hit.y + hit.height / 2 + dy, { steps: 5 });
      await page.mouse.up();
    }
    const ids = ["organisation-form", "division-form", "fiscal-editor-panel", "fiscal-period-panel", "country-form", "currency-form", "exchange-rate-form", "tax-type-form", "resource-role-modal", "financial-format-form", "module-form", "gl-account-type-form", "ledger-family-form", "accounting-object-type-form", "accounting-dimension-type-form", "transaction-group-form", "role-form", "workflow-form", "workflow-status-form", "account-form", "accounting-object-form", "accounting-dimension-form", "legal-entity-form", "journal-form", "report-definition-form", "resource-form", "org-copy-panel", "org-delete-panel"];
    for (const id of ids) {
      await open(id);
      const panel = page.locator(`#${id}`);
      assert.equal(await panel.evaluate(node => node.classList.contains("movable-editor")), true, id);
      const firstInput = panel.locator('input:not([type="hidden"]):not([type="checkbox"]):not([type="color"]), textarea').first();
      const beforeValue = await firstInput.count() ? await firstInput.inputValue() : null;
      await drag(panel);
      assert.equal(await panel.evaluate(node => getComputedStyle(node).position), "fixed", id);
      const after = await panel.boundingBox();
      const area = await page.locator("main").boundingBox();
      assert.ok(after.x >= area.x + 7 && after.y >= area.y + 7, `${id}: top/left boundary`);
      assert.ok(after.x + after.width <= area.x + area.width - 7 && after.y + after.height <= 993, `${id}: bottom/right boundary`);
      if (beforeValue !== null) assert.equal(await firstInput.inputValue(), beforeValue, id);
      await panel.evaluate(node => { node.hidden = true; });
      await panel.evaluate(node => { node.hidden = false; });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
      assert.notEqual(await panel.evaluate(node => node.style.position), "fixed", `${id}: reopening resets position`);
      assert.equal(await panel.evaluate(node => node.style.left), "", `${id}: no saved coordinates`);
      await panel.evaluate(node => { node.hidden = true; });
    }
    // The transaction-type designer is an ordinary page, not a floating editor.
    assert.equal(await page.locator("#transaction-type-form .editor-move-handle").count(), 0);
    await open("accounting-object-form");
    const record = page.locator("#accounting-object-form"), input = page.locator("#accounting-object-name");
    await input.fill("Unsaved preview value");
    const original = await record.boundingBox();
    const title = record.locator(".editor-drag-heading").first();
    const titleBox = await title.boundingBox();
    // Drag the text itself, in addition to the accessible handle.
    await page.mouse.move(titleBox.x + 160, titleBox.y + 10); await page.mouse.down();
    await page.mouse.move(titleBox.x + 80, titleBox.y + 30, { steps: 5 }); await page.mouse.up();
    assert.ok((await record.boundingBox()).x < original.x - 30);
    assert.equal(await input.inputValue(), "Unsaved preview value");
    // Moving beyond either edge cannot strand the title, close control or footer off screen.
    await drag(record, -4000, -4000);
    let edge = await record.boundingBox(); const workspaceBounds = await page.locator("main").boundingBox();
    assert.ok(edge.x >= workspaceBounds.x + 7 && edge.y >= workspaceBounds.y + 7);
    await drag(record, 4000, 4000); edge = await record.boundingBox();
    assert.ok(edge.x + edge.width <= 1500 && edge.y + edge.height <= 1000);
    const move = record.locator(".editor-move-handle");
    await move.focus(); const beforeKey = await record.boundingBox(); await move.press("ArrowLeft");
    assert.ok((await record.boundingBox()).x < beforeKey.x);
    // Existing resize grip remains independent and keeps the moved panel inside the workspace.
    const grip = record.locator(".object-editor-resize"); const beforeResize = await record.boundingBox();
    await grip.focus(); await grip.press("ArrowRight");
    const resized = await record.boundingBox(); assert.ok(resized.width < beforeResize.width);
    assert.ok(Math.abs(resized.x + resized.width - beforeResize.x - beforeResize.width) < 2);
    assert.equal(await input.inputValue(), "Unsaved preview value");
    // Editing a heading doesn't start a drag when its actual target is a field or action button.
    await input.fill("Still editing"); assert.equal(await input.inputValue(), "Still editing");
    await page.setViewportSize({ width: 390, height: 640 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const narrow = await record.boundingBox();
    assert.ok(narrow.x >= 0 && narrow.x + narrow.width <= 391 && narrow.y >= 0 && narrow.y + narrow.height <= 641);
    await record.locator(":scope > .panel-close").click();
    assert.equal(await record.isVisible(), false);
    await open("accounting-object-form");
    assert.notEqual(await record.evaluate(node => node.style.position), "fixed");
    // A modal retains its backdrop and resets when the backdrop closes.
    await page.setViewportSize({ width: 1500, height: 1000 });
    await page.evaluate(() => { document.getElementById("intake-modal").hidden = false; });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    const intake = page.locator(".intake-panel"); await drag(intake, -50, 20);
    assert.equal(await intake.evaluate(node => node.style.position), "fixed");
    await page.locator("#close-intake").click();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    assert.equal(await intake.evaluate(node => node.style.position), "");
    assert.equal(await page.locator("#intake-modal").isVisible(), false);
    // Native modal edit/selection panels keep their top-layer behaviour and close normally.
    await page.locator(".object-action-dialog").evaluate(node => node.showModal());
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    const dialog = page.locator(".object-action-dialog"); await drag(dialog, -60, 10);
    assert.equal(await dialog.evaluate(node => node.open && node.style.position === "fixed"), true);
    await dialog.locator(".panel-close").click();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    assert.equal(await dialog.evaluate(node => node.open), false);
    assert.equal(await dialog.evaluate(node => node.style.position), "");
    assert.ok(requests.every(request => request.method === "GET"), "Movement must never write application data");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
