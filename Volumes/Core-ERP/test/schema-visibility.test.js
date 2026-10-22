"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const visibility = require("../public/schema-visibility");
const { validateSchema, validateSchemaDefinition } = require("../api/_shared/erp/utils");
const schema = require("../examples/contract-showif.json");
const propertySchema = require("../seeds/template-defaults.json").accountingObjectTypeMetadata.property.schema_json;
const { upgradeSeededSchema } = require("../api/_shared/erp/schema-attributes");

test("Property Features hide only for land/site and preserve validation and stored counts", () => {
  const tab = propertySchema.tabs.find(tab => tab.fields.includes("features"));
  assert.deepEqual(tab.showif, propertySchema.properties.features.showif);
  assert.deepEqual(validateSchemaDefinition(propertySchema), []);
  for (const kind of ["land", "site", "building", "floor", "room", "wing", "leased_store", "other", "", undefined]) {
    const data = { features: [{ featureType: "bedrooms", value: 3 }] };
    if (kind !== undefined) data.propertyKind = kind;
    const before = structuredClone(data);
    assert.equal(visibility.evaluate(tab.showif, data, undefined, "object", propertySchema), !["land", "site"].includes(kind));
    assert.deepEqual(validateSchema(propertySchema, data), []);
    assert.deepEqual(data, before);
  }
  assert.ok(validateSchema(propertySchema, {propertyKind:"land",features:[{featureType:"bedrooms"}]}).length);
});

test("seed enrichment adds Property visibility without changing explicit conditions or custom tab groupings", () => {
  const current = structuredClone(propertySchema);
  delete current.properties.features.showif;
  const tab = current.tabs.find(tab => tab.fields.includes("features"));
  delete tab.showif; tab.label = "My features";
  const before = structuredClone(current);
  const updated = upgradeSeededSchema(current, propertySchema, {addGrids:true});
  assert.deepEqual(updated.properties.features.showif, propertySchema.properties.features.showif);
  assert.deepEqual(updated.tabs.find(tab => tab.label === "My features").showif, propertySchema.properties.features.showif);
  assert.deepEqual(upgradeSeededSchema(updated, propertySchema, {addGrids:true}), updated);
  assert.deepEqual(current, before);
  const custom = {field:"propertyKind",operator:"eq",value:"other"};
  current.properties.features.showif = custom; tab.showif = custom;
  const preserved = upgradeSeededSchema(current, propertySchema, {addGrids:true});
  assert.deepEqual(preserved.properties.features.showif, custom);
  assert.deepEqual(preserved.tabs.find(tab => tab.label === "My features").showif, custom);
  delete tab.showif; tab.fields.push("areaSqm");
  assert.equal(upgradeSeededSchema(current, propertySchema).tabs.find(tab => tab.label === "My features").showif, undefined);
  const incomplete = structuredClone(before);delete incomplete.properties.propertyKind;
  const safe = upgradeSeededSchema(incomplete,propertySchema,{addGrids:true});
  assert.equal(safe.properties.features.showif,undefined);
  assert.equal(safe.tabs.find(tab=>tab.label==="My features").showif,undefined);
});

test("conditions compare codes, typed amounts, dates, fields and compound conditions without mutation", () => {
  const s = { properties: { amount: { type: "currency" }, other: { type: "currency" }, date: { type: "date" } } };
  const data = { amount: "10.00", other: "2.00", date: "2026-10-13" };
  const original = structuredClone(data);
  for (const [operator, value, expected] of [["eq",10,true],["ne",10,false],["gt",2,true],["gte",10,true],["lt",20,true],["lte",10,true],["in",[2,10],true],["notIn",[10],false]]) {
    assert.equal(visibility.evaluate({ field: "amount", operator, value }, data, undefined, "object", s), expected);
  }
  assert.equal(visibility.evaluate({field:"amount",operator:"gt",valueField:"other"},data,undefined,"object",s),true);
  assert.equal(visibility.evaluate({field:"date",operator:"lt",value:"2026-11-01"},data,undefined,"object",s),true);
  assert.equal(visibility.evaluate({all:[{field:"amount",operator:"isNotEmpty"},{any:[{field:"missing",operator:"isEmpty"}]}]},data),true);
  assert.equal(visibility.evaluate({field:"missing",operator:"gt",value:0},data),false);
  assert.deepEqual(data,original);
});

test("schema conditions validate references, operators, operands and row scope", () => {
  assert.deepEqual(validateSchemaDefinition(schema), []);
  for (const rule of [{field:"missing",operator:"eq",value:1},{scope:"row",field:"contractType",operator:"eq",value:"lease_in"},{field:"contractType",operator:"eval",value:1},{field:"contractType",operator:"eq",value:1,valueField:"contractNumber"},{all:[]},{field:"contractType",operator:"in",valueField:"contractNumber"}]) {
    const copy=structuredClone(schema);copy.properties.renewalDate.showif=rule;
    assert.ok(validateSchemaDefinition(copy).some(message=>message.includes("showif")));
  }
  const row=schema.properties.fixedCharges.rowSchema;
  assert.equal(visibility.evaluate(row.properties.effectiveTo.showif,{contractType:"lease_in"},{frequency:"once"},"row",schema,row),false);
  assert.equal(visibility.evaluate({scope:"object",field:"contractType",operator:"eq",value:"lease_in"},{contractType:"lease_in"},{frequency:"once"},"row",schema,row),true);
  const required={properties:{name:{type:"text",showif:{field:"flag",operator:"eq",value:true}},flag:{type:"boolean"}},required:["name"]};
  assert.deepEqual(validateSchema(required,{flag:false}),["name is required"]);
});

let chromium;
try { ({chromium}=require("playwright")); } catch {}
test("browser renderer retains hidden values, updates rows and switches hidden tabs at desktop and narrow widths", {skip:!chromium}, async () => {
  const browser=await chromium.launch({headless:true, ...(process.env.SHOWIF_BROWSER_CHANNEL ? {channel:process.env.SHOWIF_BROWSER_CHANNEL} : {})});
  try {
    const page=await browser.newPage();
    await page.setContent('<form id="accounting-object-form"><div class="account-editor-tabs"><button data-record-tab="general" class="active">Identification</button></div><div id="accounting-object-detail-fields"></div></form><div id="snapshot"></div>');
    await page.addScriptTag({content:fs.readFileSync(require.resolve('../public/schema-visibility'),'utf8')});
    const app=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
    await page.addScriptTag({content:'const $=id=>document.getElementById(id); const state={orgId:"",currencies:[],subledgerAccountTypes:[],accountingObjectTypes:[],accountingDimensionTypes:[]}; const pretty=name=>name; function syncRequiredMarkers(){}\n'+app.slice(app.indexOf('  function schemaFields('),app.indexOf('  function syncRecordTypeDescription('))+app.slice(app.indexOf('  function collectSchemaDetail('),app.indexOf('  function collectAccountDetail('))});
    for (const width of [1100,420]) {
      await page.setViewportSize({width,height:900});
      await page.evaluate(s=>{
        document.getElementById('snapshot').innerHTML='';
        renderSchemaDetailFields('accounting-object-detail-fields',s,{contractType:'lease_in',renewalDate:'2027-01-01',fixedCharges:[{frequency:'once',effectiveTo:'2027-01-01'},{frequency:'monthly',effectiveTo:'2028-01-01'}]});
      },schema);
      assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('.schema-grid-row')].map(row=>row.querySelector('[data-detail-field="effectiveTo"]').closest('label').hidden)),[true,false]);
      await page.evaluate(()=>showAccountingEditorTab('accounting-object','schema:tab-3'));
      await page.selectOption('[data-detail-field="contractType"]','service_provision',{force:true});
      assert.equal(await page.locator('[data-account-detail-tab="tab-3"]').evaluate(button=>button.hidden),true);
      assert.equal(await page.locator('[data-account-detail-tab="tab-0"]').evaluate(button=>button.classList.contains('active')),true);
      const data=await page.evaluate(s=>collectSchemaDetail('accounting-object-detail-fields',s),schema);
      assert.equal(data.renewalDate,'2027-01-01');assert.equal(data.fixedCharges[0].effectiveTo,'2027-01-01');
      await page.selectOption('[data-detail-field="contractType"]','lease_in',{force:true});
      await page.evaluate(()=>showAccountingEditorTab('accounting-object','schema:tab-3'));
      await page.selectOption('.schema-grid-row:first-child [data-detail-field="frequency"]','monthly',{force:true});
      assert.equal(await page.locator('.schema-grid-row:first-child [data-detail-field="effectiveTo"]').evaluate(input=>input.closest('label').hidden),false);
      await page.locator('.schema-grid-heading button').first().click();
      assert.equal(await page.locator('.schema-grid-row').count(),3);
      await page.evaluate(s=>{renderSchemaDetailFields('snapshot',s,{contractType:'service_provision'});document.querySelectorAll('#snapshot input,#snapshot select').forEach(input=>input.disabled=true);},schema);
      assert.equal(await page.locator('#snapshot [data-account-detail-tab="tab-3"]').evaluate(button=>button.hidden),true);
      await page.evaluate(s=>{
        document.getElementById('snapshot').innerHTML='';
        renderSchemaDetailFields('accounting-object-detail-fields',s,{propertyKind:'building',features:[{featureType:'bedrooms',value:3}]});
        showAccountingEditorTab('accounting-object','schema:tab-4');
      },propertySchema);
      for (const kind of ['land','site','building','floor','room','wing','leased_store','other','']) {
        await page.selectOption('[data-detail-field="propertyKind"]',kind,{force:true});
        const hidden=['land','site'].includes(kind);
        assert.equal(await page.locator('[data-account-detail-tab="tab-4"]').evaluate(button=>button.hidden),hidden);
        assert.equal(await page.locator('[data-detail-grid="features"]').evaluate(grid=>grid.hidden),hidden);
        const saved=await page.evaluate(s=>collectSchemaDetail('accounting-object-detail-fields',s),propertySchema);
        assert.deepEqual(saved.features,[{featureType:'bedrooms',value:3}]);
      }
      await page.evaluate(s=>{
        renderSchemaDetailFields('snapshot',s,{propertyKind:'site',features:[{featureType:'bedrooms',value:3}]});
        document.querySelectorAll('#snapshot input,#snapshot select').forEach(input=>input.disabled=true);
      },propertySchema);
      assert.equal(await page.locator('#snapshot [data-account-detail-tab="tab-4"]').evaluate(button=>button.hidden),true);
      assert.equal(await page.locator('#snapshot [data-detail-grid="features"]').evaluate(grid=>grid.hidden),true);
    }
  } finally {await browser.close();}
});
