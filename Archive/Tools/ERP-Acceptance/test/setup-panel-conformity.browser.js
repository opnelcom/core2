"use strict";
// Read-only audit of production markup/CSS and runtime layout installers.
const {chromium}=require("playwright"),fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"../../.."),pub=path.join(root,"Volumes/Core-ERP/public"),app=fs.readFileSync(path.join(pub,"app.js"),"utf8");
const extract=(a,b)=>app.slice(app.indexOf(`  function ${a}(`),app.indexOf(`  function ${b}(`));
const helpers=extract("setRequiredMarker","updateAccountLegalEntityRequirement")+extract("addPanelCloseButtons","renderDashboard")+extract("showOrganisationTab","renderOrganisationIconPreview");
const items=[['organisation-form','view-organisations'],['division-form','view-divisions'],['fiscal-form','view-fiscal','fiscal-editor-panel'],['country-form','view-countries'],['currency-form','view-currencies'],['tax-type-form','view-taxtypes'],['resource-role-form','view-resourceroles','resource-role-modal']];
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.ERP_BROWSER_EXECUTABLE?{executablePath:process.env.ERP_BROWSER_EXECUTABLE}:{})});try{
 const page=await browser.newPage();
 await page.setContent(fs.readFileSync(path.join(pub,'index.html'),'utf8').replace(/<script[\s\S]*?<\/script>/g,'').replace(/<link[\s\S]*?>/g,''));
 await page.addStyleTag({content:fs.readFileSync(path.join(pub,'style.css'),'utf8')});
 await page.addStyleTag({content:'.workspace-context,.sidebar{display:none!important}.erp-shell{display:block!important}main{margin:0!important;padding:16px!important}.view{min-height:850px}'});
 await page.evaluate(helpers=>{window.$=id=>document.getElementById(id);window.renderOrganisationIconPreview=()=>{};(0,eval)(helpers);installOrganisationTabs();syncRequiredMarkers();addPanelCloseButtons();},helpers);
 const out=path.join(root,'output/setup-panel-conformity');fs.mkdirSync(out,{recursive:true});const results=[];
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  for(const [formId,viewId,panelId=formId] of items){
   await page.evaluate(({formId,viewId,panelId,items})=>{
    document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!==viewId);
    for(const [f,v,p=f] of items)document.getElementById(p).hidden=true;
    document.getElementById('fiscal-period-panel').hidden=true;

   },{formId,viewId,panelId,items});
   const closed=await page.evaluate(viewId=>{const v=document.getElementById(viewId),split=v.querySelector('.split'),list=split.querySelector('.panel');return {viewPosition:getComputedStyle(v).position,listRatio:list.getBoundingClientRect().width/split.getBoundingClientRect().width};},viewId);
   await page.screenshot({path:path.join(out,`${formId}-${width}-closed.png`)});
   await page.evaluate(panelId=>document.getElementById(panelId).hidden=false,panelId);
   const open=await page.evaluate(({formId,panelId,viewId})=>{const form=document.getElementById(formId),panel=document.getElementById(panelId),box=form.getBoundingClientRect(),overlay=panelId==='fiscal-editor-panel'?panel.parentElement:form,action=form.querySelector(':scope > .actions');
    const fields=[...form.querySelectorAll('label:not(.check)')].filter(l=>l.getBoundingClientRect().width&&l.querySelector('input:not([type=hidden]),select,textarea')).map(l=>{const control=l.querySelector('input:not([type=hidden]),select,textarea'),caption=l.querySelector('.account-field-caption');const range=document.createRange();range.selectNodeContents(caption||l.firstChild);const c=range.getBoundingClientRect(),f=control.getBoundingClientRect();return {name:(caption?.textContent||l.firstChild.textContent).trim(),aligned:f.left>=c.right&&Math.abs(f.top-c.top)<10};});
    return {position:getComputedStyle(overlay).position,anchor:overlay.offsetParent?.id,withinViewport:box.left>=0&&box.right<=innerWidth+1,close:!!panel.querySelector('.panel-close'),sticky:action?getComputedStyle(action).position:null,actionAlignment:action?getComputedStyle(action).justifyContent:null,tabs:form.querySelectorAll('[role=tab],.setup-type-tabs .tab').length,fields};
   },{formId,panelId,viewId});
   results.push({formId,width,...closed,...open});
   await page.screenshot({path:path.join(out,`${formId}-${width}-open.png`)});
  }
 }
 fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
