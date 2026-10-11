"use strict";
const {chromium}=require("playwright");
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const root=path.resolve(__dirname,"../../.."),pub=path.join(root,"Volumes/Core-ERP/public");
const app=fs.readFileSync(path.join(pub,"app.js"),"utf8");
const markers=app.slice(app.indexOf("  function setRequiredMarker("),app.indexOf("  function updateAccountLegalEntityRequirement("));
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.ERP_BROWSER_EXECUTABLE?{executablePath:process.env.ERP_BROWSER_EXECUTABLE}:{})});try{
 const page=await browser.newPage();
 await page.setContent(fs.readFileSync(path.join(pub,"index.html"),"utf8").replace(/<script[\s\S]*?<\/script>/g,"").replace(/<link[\s\S]*?>/g,""));
 await page.addStyleTag({content:fs.readFileSync(path.join(pub,"style.css"),"utf8")});
 await page.addStyleTag({content:".workspace-context,.sidebar{display:none!important}.erp-shell{display:block!important}main{margin:0!important;padding:16px!important}.view{min-height:850px}"});
 await page.evaluate(source=>{(0,eval)(source);syncRequiredMarkers();syncRequiredMarkers();},markers);
 const output=path.join(root,"output/edit-field-alignment");fs.mkdirSync(output,{recursive:true});
 for(const width of [1280,540]){
  await page.setViewportSize({width,height:900});
  for(const id of ["account-form","accounting-object-form","accounting-dimension-form","report-definition-form"]){
   await page.evaluate(id=>{document.querySelectorAll(".view").forEach(v=>v.hidden=!v.contains(document.getElementById(id)));document.querySelectorAll("#account-form,#accounting-object-form,#accounting-dimension-form,#report-definition-form").forEach(f=>f.hidden=true);},id);
   await page.screenshot({path:path.join(output,`${id}-${width}-closed.png`)});
   await page.evaluate(id=>document.getElementById(id).hidden=false,id);
   const checks=await page.locator(`#${id} label:not(.check)`).evaluateAll(labels=>labels.filter(l=>l.getBoundingClientRect().width&&!l.closest(".schema-grid")&&l.querySelector("input:not([type=hidden]),select,textarea")).map(l=>{const control=l.querySelector("input:not([type=hidden]),select,textarea"),caption=l.querySelector(":scope > .account-field-caption"),f=control.getBoundingClientRect(),c=caption?.getBoundingClientRect();return {text:caption?.textContent,aligned:!!c&&f.left>=c.right&&Math.abs(f.top-c.top)<2,marker:!control.required||caption.querySelectorAll(".required-marker").length===1,overflow:f.right>l.getBoundingClientRect().right+1};}));
   assert.ok(checks.length,`${id}: visible built-in fields`);
   assert.ok(checks.every(c=>c.aligned&&c.marker&&!c.overflow),`${id} at ${width}: ${JSON.stringify(checks)}`);
   await page.screenshot({path:path.join(output,`${id}-${width}-open.png`)});
  }
 }
 console.log("PASS: four production editor forms, required markers, idempotent captions, desktop and narrow alignment");
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
