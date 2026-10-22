"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
let chromium;
try { ({ chromium } = require("playwright")); } catch {}

test("record and transaction toolbars align, wrap, retain controls and restore Refresh on navigation", { skip: !chromium }, async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.SHOWIF_BROWSER_CHANNEL || "msedge" });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const source = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
    const start = source.indexOf("  function syncObjectGridContext(");
    const contextFunction = source.slice(start, source.indexOf("\n  function ", start + 5));
    const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "").replace(/<link\b[^>]*>/g, "");
    await page.setContent(html);
    await page.addStyleTag({ path: require.resolve("../public/style.css") });
    await page.evaluate(() => {
      const main = document.querySelector("main");
      document.body.replaceChildren(main);
      for (const child of [...main.children]) if (!child.matches(".topbar, #view-accounts, #view-accountingobjects, #view-accountingdimensions, #view-journals")) child.remove();
    });
    await page.addStyleTag({ content: "body{display:block;overflow:auto;height:auto}main{padding:12px;overflow:visible}.view>.split{display:block}" });
    await page.addScriptTag({ path: require.resolve("../public/workflow-grid-visibility.js") });
    await page.addScriptTag({ path: require.resolve("../public/object-grid-views.js") });
    await page.addScriptTag({ content: `
      const $=id=>document.getElementById(id);
      const state={subledgerAccountTypes:[{type_code:'asset',type_name:'Asset'}],accountingDimensionTypes:[{accounting_dimension_type_id:'region',type_name:'Region'}],transactionTypes:[{transaction_type_id:'invoice',type_name:'Invoice'}]};
      let selectedAccountScopeCode='asset',selectedAccountingDimensionTypeId='region',selectedTransactionTypeId='invoice';
      const labelForFamily=()=> 'Asset';
      const accountingMasterContextType=()=>({type_name:'Property',type_description:'Property details'});
      ${contextFunction}
      let refreshClicks=0; $('refresh').addEventListener('click',()=>refreshClicks++);
      window.exerciseGrid=(view,prefix,gl=false)=>{
        selectedAccountScopeCode=gl?'gl':'asset';
        document.querySelectorAll('.view').forEach(item=>item.hidden=item.id!=='view-'+view);
        syncObjectGridContext(1,view);
        const target=$(prefix+'-list'),toolbar=$(prefix+'-grid-title').closest('.panel-head');
        erpObjectGridViews.render({target,toolbar,enabled:!gl,columns:[],rows:[{workflow_status:'draft'}],statuses:[],steps:[],workflowPath:()=>null,table:()=>{},onOpen:()=>{},code:()=> 'ONE',name:()=> 'Example',workflowButton:()=>document.createElement('button')});
        syncObjectGridContext(1,view);
      };
    ` });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [view, prefix, type] of [["accounts", "account", "Asset"], ["accountingobjects", "accounting-object", "Property"], ["accountingdimensions", "accounting-dimension", "Region"], ["journals", "journal", "Invoice"]]) {
        // Exercise repeated render and both grid modes: controls must not duplicate.
        await page.evaluate(([v,p])=>{exerciseGrid(v,p);exerciseGrid(v,p);}, [view,prefix]);
        const toolbar = page.locator(`#${prefix}-grid-title`).locator("..");
        assert.equal(await toolbar.locator(":scope > button").first().textContent(), `+ Add ${type}`);
        assert.equal(await toolbar.locator("#refresh").count(), 1);
        assert.equal(await toolbar.locator(".object-grid-view-control").count(), 1);
        const boxes = await toolbar.locator("#refresh, .object-grid-view-control button").evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {y:r.y,h:r.height,right:r.right};}));
        assert.equal(boxes[0].h, 34); assert.equal(boxes[1].h, 34);
        if (width===1440) assert.equal(boxes[0].y, boxes[1].y, `${view}: ${JSON.stringify(await toolbar.evaluate(node=>({html:node.outerHTML,width:node.clientWidth})))}`);
        assert.ok(boxes.every(box=>box.right<=width));
        await toolbar.getByRole("button", {name:"Status",exact:true}).click();
        assert.equal(await page.locator(`#${prefix}-list .object-status-column`).count(), 1);
        await toolbar.getByRole("button", {name:"Columnar",exact:true}).click();
        const visibility = page.locator(`#${view==='accounts'?'view-accounts':'view-'+view} label.check`).filter({hasText:'Show hidden records'});
        await visibility.locator("input").check();
        assert.equal(await visibility.locator("input").isChecked(), true);
      }
    }
    await page.evaluate(()=>exerciseGrid('accounts','account',true));
    assert.equal(await page.locator(".topbar-actions #refresh").count(), 1);
    assert.equal(await page.locator("#view-accounts .object-grid-toolbar").count(), 0);
    await page.locator("#refresh").click();
    assert.equal(await page.evaluate(()=>refreshClicks),1);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
