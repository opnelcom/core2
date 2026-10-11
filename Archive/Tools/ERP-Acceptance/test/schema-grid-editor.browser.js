"use strict";
// Optional browser check: node Tools/ERP-Acceptance/test/schema-grid-editor.browser.js
// Uses Playwright from ERP-Acceptance. Set ERP_BROWSER_EXECUTABLE for system Edge.
const { chromium } = require("playwright");
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const root = path.resolve(__dirname,"../../..");
const source = fs.readFileSync(path.join(root,"Volumes/Core-ERP/public/app.js"),"utf8");
const css = fs.readFileSync(path.join(root,"Volumes/Core-ERP/public/style.css"),"utf8");
const schema = require(path.join(root,"Volumes/Core-ERP/seeds/template-defaults.json")).accountingObjectTypeMetadata.property.schema_json;
const extract=(from,to)=>source.slice(source.indexOf(`  function ${from}(`),source.indexOf(`  function ${to}(`));
const functions = extract("setRequiredMarker","updateAccountLegalEntityRequirement") + extract("schemaFields","valueForDetailField") + extract("valueForDetailField","showAccountFixedTab") + extract("renderSchemaDetailFields","renderAccountDetailFields") + extract("collectSchemaDetail","collectAccountDetail");
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.ERP_BROWSER_EXECUTABLE?{executablePath:process.env.ERP_BROWSER_EXECUTABLE}:{})});
  try {
    const page=await browser.newPage({viewport:{width:1000,height:750}}), errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    await page.setContent(`<style>${css}</style><form id="accounting-object-form" class="panel accounting-record-editor" style="position:relative;top:auto;right:auto;width:820px;max-width:100%;margin:20px auto;max-height:none"><h2>Edit property · Oak House</h2><div id="fixture-detail-fields" class="account-schema-fields"></div></form>`);
    await page.evaluate(({functions,schema})=>{
      window.$=id=>document.getElementById(id);window.pretty=name=>name;window.state={orgId:"test-org"};
      window.api=async path=>({records:[{id:"00000000-0000-0000-0000-000000000001",code:path.includes("measurement_unit")?"sqm":"gla",name:path.includes("measurement_unit")?"Square metre":"Gross Lettable Area"}]});
      window.testSchema=schema;
      window.testData={physicalAddress:"18 Oak Avenue",areaSqm:"180.0000",marketValues:[{valuationDate:"2026-09-30",amount:"2450000.00",currencyCode:"ZAR"}],measurements:[{dimensionType:"00000000-0000-0000-0000-000000000001",effectiveFrom:"2026-09-30",effectiveTo:"",quantity:"195.0000",unit:"00000000-0000-0000-0000-000000000001"}],features:[]};
      (0,eval)(functions);renderSchemaDetailFields("fixture-detail-fields",schema,window.testData);
    },{functions,schema});
    for(const width of [1280,540]){
      await page.setViewportSize({width,height:900});
      const aligned=await page.locator('.account-schema-fields label.detail-field').evaluateAll(labels=>labels.filter(l=>!l.closest('.schema-grid')&&l.getBoundingClientRect().width&&l.querySelector('input,select,textarea')).every(l=>{const c=l.querySelector('.account-field-caption').getBoundingClientRect(),f=l.querySelector('input,select,textarea').getBoundingClientRect();return f.left>=c.right&&Math.abs(f.top-c.top)<2;}));
      assert.ok(aligned,`Generated schema fields align at ${width}px`);
    }
    await page.setViewportSize({width:1000,height:750});
    const ordering = await page.evaluate(() => ({
      keys: schemaFields({properties:{z:{type:"text"},c:{type:"text",sortOrder:20},b:{type:"text",sortOrder:10},a:{type:"text",sortOrder:10},y:{type:"text"}}}).map(([key])=>key),
      tabs: schemaTabs({tabs:[{label:"Explicit",fields:["b","a"]}]},schemaFields({properties:{a:{type:"text",sortOrder:10},b:{type:"text",sortOrder:20}}}))[0].fields
    }));
    assert.deepEqual(ordering.keys,["a","b","c","y","z"]);
    assert.deepEqual(ordering.tabs,["b","a"]);
    const columnKeys = await page.evaluate(() => {
      const definition = structuredClone(window.testSchema);
      const properties = definition.properties.marketValues.rowSchema.properties;
      definition.properties.marketValues.rowSchema.properties = Object.fromEntries(Object.entries(properties).reverse());
      renderSchemaDetailFields("fixture-detail-fields",definition,window.testData);
      return [...document.querySelector('[data-detail-grid="marketValues"] tbody tr').querySelectorAll('[data-detail-field]')].map(input=>input.dataset.detailField);
    });
    assert.deepEqual(columnKeys,["valuationDate","amount","currencyCode","method","valuer","notes"]);
    const heights = await page.evaluate(() => {
      const host = document.createElement("div"); document.body.append(host);
      const measure = rows => {
        const label = renderDetailInput("notes",{type:"long_text",title:"Notes",rows},"",false);
        host.append(label); return label.querySelector("textarea").getBoundingClientRect().height;
      };
      const one = measure(1), three = measure(3);
      const definition = structuredClone(window.testSchema);
      definition.properties.marketValues.rowSchema.properties.notes.rows = 1;
      renderSchemaDetailFields("fixture-detail-fields",definition,window.testData);
      document.querySelector('[data-detail-grid="marketValues"]').closest(".account-detail-panel").hidden = false;
      const grid = document.querySelector('[data-detail-grid="marketValues"] textarea').getBoundingClientRect().height;
      host.remove(); return {one,three,grid};
    });
    assert.ok(heights.one < 60, JSON.stringify(heights));
    assert.ok(heights.three > heights.one + 25, JSON.stringify(heights));
    assert.ok(heights.grid > 0 && heights.grid < 60, JSON.stringify(heights));

    await page.getByRole("button",{name:"Measurements",exact:true}).click();
    const grid=page.locator('[data-detail-grid="measurements"]');
    await grid.locator('[data-detail-field="quantity"]').fill("200.1234");
    await grid.getByRole("button",{name:"+ Add row",exact:true}).click();
    assert.equal(await grid.locator("tbody tr").count(),2);
    await grid.locator("tbody tr").last().getByRole("button",{name:/Remove row/}).click();
    assert.equal(await grid.locator("tbody tr").count(),1);
    const data=await page.evaluate(()=>collectSchemaDetail("fixture-detail-fields",window.testSchema));
    assert.equal(data.measurements[0].quantity,"200.1234");
    assert.equal(data.marketValues[0].amount,"2450000.00");
    assert.equal(data.physicalAddress,"18 Oak Avenue");
    assert.equal(data.dimensionType,undefined);
    assert.deepEqual(data.features,[]);
    assert.equal(await grid.locator('.schema-reference-control input[type="search"]').count(),0);
    assert.ok(await grid.locator('[data-detail-field="dimensionType"] option').count()>=2);
    const bounds=await grid.boundingBox();assert.ok(bounds.width<850);
    await grid.locator(".schema-grid-scroll").evaluate(element=>{element.scrollLeft=0;});
    if(process.argv[2])await page.screenshot({path:process.argv[2],fullPage:true});
    const versionFunctions=extract("installObjectVersionTabs","openAccountEditor")+extract("showAccountingEditorTab","showAccountEditorTab");
    await page.evaluate(({versionFunctions})=>{
      document.getElementById("accounting-object-form").removeAttribute("id");
      const form=document.createElement("form");form.id="accounting-object-form";form.className="panel accounting-record-editor";form.style.cssText="width:820px;max-width:100%;margin:20px auto";
      form.innerHTML='<div class="account-editor-tabs"></div><input id="accounting-object-id" value="record-id" type="hidden"><div id="accounting-object-detail-fields"></div><div class="account-editor-actions"></div>';document.body.append(form);
      const original=window.api;
      window.api=async path=>path.startsWith("schema-records/versions")?{versions:[{version_number:1,saved_at:"2026-10-04T10:00:00Z",saved_by_email:"tester@example.com",record_json:{object_name:"Oak House",additional_data:window.testData},schema_json:window.testSchema,resource_assignments_json:[]}]}:original(path);
      (0,eval)(versionFunctions);installObjectVersionTabs();
    },{versionFunctions});
    await page.getByRole("button",{name:"Versions",exact:true}).click();
    await page.getByRole("button",{name:"View snapshot",exact:true}).click();
    await page.getByRole("heading",{name:"Version 1 · read-only snapshot"}).waitFor();
    const snapshot=page.locator("#accounting-object-version-detail-fields");
    assert.equal(await snapshot.locator("input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled)").count(),0);
    assert.equal(await snapshot.locator("[data-detail-grid]").count(),3);
    await page.setViewportSize({width:390,height:850});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
    if(overflow)console.log(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>!e.closest('.schema-grid-scroll')&&e.getBoundingClientRect().right>window.innerWidth+1).map(e=>({tag:e.tagName,id:e.id,class:e.className,width:e.getBoundingClientRect().width})).slice(0,15)));
    assert.equal(overflow,false,"Grid overflow must stay inside its scroll container");
    assert.deepEqual(errors,[]);
    console.log("Browser checks passed: grid add/remove, exact values, reference lookup, combined collection, read-only full snapshots and mobile containment.");
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
