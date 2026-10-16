"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
let chromium;
try { ({ chromium } = require("playwright")); } catch {}

test("complete ERP startup installs record layouts and every Setup deletion control before bootstrap", { skip: !chromium }, async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.SHOWIF_BROWSER_CHANNEL ? { channel: process.env.SHOWIF_BROWSER_CHANNEL } : {}) });
  try {
    const page = await browser.newPage(), errors = [], alerts = [], requests = [];
    page.on("pageerror", error => errors.push(error.stack));
    page.on("dialog", async dialog => { alerts.push(dialog.message()); await dialog.dismiss(); });
    await page.route("https://erp.test/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith("/erp/api/")) {
        requests.push({ method: route.request().method(), path: url.pathname });
        await route.fulfill({ json: { organisations: [], currencies: [], countries: [], subledger_account_types: [] } });
        return;
      }
      const name = url.pathname === "/erp/" ? "index.html" : url.pathname.replace(/^\/erp\//, "");
      const file = path.join(__dirname, "../public", name);
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: "Not found" });
      const contentType = name.endsWith(".js") ? "text/javascript" : name.endsWith(".css") ? "text/css" : "text/html";
      await route.fulfill({ contentType, body: fs.readFileSync(file) });
    });
    await page.goto("https://erp.test/erp/", { waitUntil: "networkidle" });
    const missingActions = await page.locator("form").evaluateAll(forms => forms.filter(form => !form.querySelector(".actions")).map(form => form.id));
    assert.deepEqual(errors, [], JSON.stringify({ errors, missingActions }, null, 2));
    assert.ok(requests.some(request => request.path === "/erp/api/setup/bootstrap"));
    assert.ok(requests.every(request => request.method === "GET"), "Startup must not create/delete records");
    assert.deepEqual(alerts.filter(Boolean), []);
    assert.equal(await page.locator("button[data-setup-delete]").count(), 21);
    assert.equal(await page.locator("#transaction-type-form .transaction-type-editor-actions > [data-setup-delete='transaction_type']").count(), 1);
    assert.equal(await page.locator(".record-editor-layout-switch").count(), 3);
    for (const prefix of ["ledger-family", "accounting-object-type", "accounting-dimension-type"]) {
      const control = page.locator(`#${prefix}-default-editor-layout`);
      assert.equal(await control.inputValue(), "tabs");
      assert.equal(await control.evaluate(node => node.closest("[data-setup-type-panel]").dataset.panel), "definition");
    }
    assert.equal(await page.locator("#transaction-type-default-editor-layout").count(), 0);
  } finally { await browser.close(); }
});
