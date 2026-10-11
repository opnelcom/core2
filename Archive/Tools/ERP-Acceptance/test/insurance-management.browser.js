"use strict";
const {chromium}=require("playwright"),fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const root=path.resolve(__dirname,"../../.."),erp=path.join(root,"Volumes/Core-ERP");
const source=fs.readFileSync(path.join(erp,"public/app.js"),"utf8"),css=fs.readFileSync(path.join(erp,"public/style.css"),"utf8");
const extract=(from,to)=>source.slice(source.indexOf(`  function ${from}(`),source.indexOf(`  function ${to}(`));
const functions=extract("schemaFields","valueForDetailField")+extract("valueForDetailField","showAccountFixedTab")+extract("renderSchemaDetailFields","renderAccountDetailFields")+extract("collectSchemaDetail","collectAccountDetail");
const seeds=require(path.join(erp,"seeds/template-defaults.json"));
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.ERP_BROWSER_EXECUTABLE?{executablePath:process.env.ERP_BROWSER_EXECUTABLE}:{})});try{
 const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];page.on("pageerror",error=>errors.push(error.message));
 await page.setContent(`<style>${css}</style><form class="panel accounting-record-editor" style="width:1000px;max-width:100%"><div id="fixture-detail-fields"></div></form>`);
 await page.evaluate(({functions,schema})=>{
  window.$=id=>document.getElementById(id);window.pretty=name=>name;window.syncRequiredMarkers=()=>{};window.state={orgId:"org"};window.requests=[];
  window.api=async url=>{
   const params=new URLSearchParams(url.split("?")[1]);window.requests.push(Object.fromEntries(params));const target=JSON.parse(params.get("target"));
   if(target.class==="accounting_object")return {records:[{id:"00000000-0000-0000-0000-000000000001",code:"POLICY-A",name:"Asset policy"},{id:"00000000-0000-0000-0000-000000000002",code:"POLICY-B",name:"Property policy"}]};
   if(target.anyOf)return {records:params.get("source_id").endsWith("1")?[{id:"subledger_account:00000000-0000-0000-0000-000000000003",code:"VEHICLE",name:"Vehicle",object_class:"subledger_account"}]:[{id:"accounting_object:00000000-0000-0000-0000-000000000004",code:"PROPERTY",name:"Property",object_class:"accounting_object"}]};
   return {records:[]};
  };
  window.testSchema=schema;(0,eval)(functions);renderSchemaDetailFields("fixture-detail-fields",schema,{affectedItems:[{damage:"Repair",claimedAmount:"1000.00"}]});
 },{functions,schema:seeds.accountingObjectTypeMetadata.insurance_claim.schema_json});
 const policy=page.locator('[data-detail-field="policy"]');await policy.selectOption("00000000-0000-0000-0000-000000000001");
 await page.getByRole("button",{name:"Affected items",exact:true}).click();const item=page.locator('[data-detail-grid="affectedItems"] [data-detail-field="item"]');
 await page.waitForFunction(()=>document.querySelector('[data-detail-grid="affectedItems"] [data-detail-field="item"]').options.length===2);
 await item.selectOption("subledger_account:00000000-0000-0000-0000-000000000003");
 assert.equal(await page.locator('input[type="search"]').count(),0);
 const data=await page.evaluate(()=>collectSchemaDetail("fixture-detail-fields",window.testSchema));assert.equal(data.policy,"00000000-0000-0000-0000-000000000001");assert.equal(data.affectedItems[0].item,"subledger_account:00000000-0000-0000-0000-000000000003");
 await page.getByRole("button",{name:"Claim",exact:true}).click();await policy.selectOption("00000000-0000-0000-0000-000000000002");
 await page.waitForFunction(()=>[...document.querySelector('[data-detail-grid="affectedItems"] [data-detail-field="item"]').options].some(option=>option.textContent.includes("PROPERTY")));
 assert.ok(await page.evaluate(()=>window.requests.some(p=>p.source_grid==="insuredItems"&&p.source_column==="item"&&p.source_class==="accounting_object")));
 assert.deepEqual(errors,[]);console.log("Insurance browser checks passed: shared schema grids, mixed item IDs, policy-dependent refresh, single Save collection and no search inputs.");
 }finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
