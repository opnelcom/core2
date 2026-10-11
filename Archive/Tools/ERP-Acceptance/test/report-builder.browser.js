'use strict';
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..'),pub=path.join(root,'Volumes/Core-ERP/public');
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.ERP_BROWSER_EXECUTABLE?{executablePath:process.env.ERP_BROWSER_EXECUTABLE}:{})});try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const html=fs.readFileSync(path.join(pub,'index.html'),'utf8').replace(/<script[\s\S]*?<\/script>/g,'').replace(/<link[\s\S]*?>/g,'');
 await page.setContent(html);await page.addStyleTag({content:fs.readFileSync(path.join(pub,'style.css'),'utf8')});
 await page.addStyleTag({content:'.workspace-context,.sidebar{display:none!important}.erp-shell{display:block!important}main{margin:0!important;padding:16px!important}'});
 await page.addScriptTag({content:fs.readFileSync(path.join(pub,'report-builder.js'),'utf8')});
 await page.evaluate(()=>{
  window.requests=[];window.notifications=[];window.ctx={orgId:'org',divisionId:'top',includeChildren:true};
  window.report={report_id:'report',report_code:'dates',report_name:'Transaction dates',is_active:true,definition_version:1,description:'Transactions in the selected division',definition_json:{dataset:'transaction',columns:[{field:'journal_date'},{field:'description'}],filters:[{field:'journal_date',operator:'gte',parameter:'fromDate'}],parameters:[{key:'fromDate',label:'From date',type:'date',required:true}],sort:[{field:'journal_date',direction:'asc'}]}};
  const api=async(p,o)=>{requests.push([p,o?JSON.parse(o.body):null]);if(p.includes('catalogue'))return {datasets:[{key:'transaction',label:'Transaction headers',fields:[{key:'journal_date',label:'Transaction date',type:'date'},{key:'description',label:'Description',type:'text'}]}]};if(p.includes('list'))return {reports:[{...report,parameters:report.definition_json.parameters}]};if(p.includes('save')){report.definition_json=JSON.parse(o.body).definition_json;return {report};}return {rows:[{c0:'2026-10-01',c1:'Invoice'}],columns:[{key:'c0',label:'Date'},{key:'c1',label:'Description'}],run_at:'2026-10-05T10:00:00Z',permitted_division_count:1,next_offset:JSON.parse(o.body).offset?null:100};};
  const table=(target,cols,rows,click)=>{target.replaceChildren();const t=document.createElement('table');const h=t.insertRow();cols.forEach(([title])=>{const th=document.createElement('th');th.textContent=title;h.append(th);});for(const r of rows){const row=t.insertRow();cols.forEach(([,get])=>row.insertCell().textContent=get(r));if(click)row.onclick=()=>click(r);}target.append(t);};
  window.builder=createReportBuilder({syncRequiredMarkers:root=>window.syncRequiredMarkers(root),api,context:()=>ctx,table,notify:message=>notifications.push(message),saved:async()=>{}});
  document.querySelector('#view-reportdefinitions').hidden=false;
 });
 const appSource=fs.readFileSync(path.join(pub,'app.js'),'utf8');
 const markerSource=appSource.slice(appSource.indexOf('  function setRequiredMarker('),appSource.indexOf('  function updateAccountLegalEntityRequirement('));
 await page.evaluate(source=>{(0,eval)(source);syncRequiredMarkers();syncRequiredMarkers();},markerSource);
 const resizeSource=appSource.slice(appSource.indexOf('  function installResizableObjectEditors()'),appSource.indexOf('  function openAccountEditor('));
 await page.evaluate(source=>{window.$=id=>document.getElementById(id);(0,eval)(source);installResizableObjectEditors();},resizeSource);
 await page.evaluate(()=>builder.setup());
 const layout=await page.evaluate(()=>{const view=document.querySelector('#view-reportdefinitions'),split=view.querySelector('.split'),panel=split.querySelector('.panel');return {viewPosition:getComputedStyle(view).position,width:split.getBoundingClientRect().width,listWidth:panel.getBoundingClientRect().width};});assert.equal(layout.viewPosition,'relative');assert.ok(Math.abs(layout.width-layout.listWidth)<2,'Report list must fill the available width');
await page.getByText('Transaction dates',{exact:true}).click();
 assert.ok(await page.locator('#report-definition-form').isVisible());
 for(const width of [1280,540]){
  await page.setViewportSize({width,height:900});
  const fields=await page.locator('#report-panel-details label').evaluateAll(labels=>labels.map(label=>{const caption=label.querySelector('.account-field-caption'),control=label.querySelector('input,select,textarea'),help=label.querySelector('.detail-field-help');const c=caption.getBoundingClientRect(),f=control.getBoundingClientRect();return {aligned:f.left>=c.right&&Math.abs(f.top-c.top)<2,markers:label.querySelectorAll('.required-marker').length,required:control.required,contained:!control.required||!!caption.querySelector('.required-marker'),help:!help||Math.abs(help.getBoundingClientRect().left-f.left)<2};}));
  assert.ok(fields.every(f=>f.aligned&&f.contained&&f.help&&f.markers===(f.required?1:0)),`Real required markers and help must align at ${width}px`);
 }
 await page.setViewportSize({width:1280,height:900});
 await page.locator('#report-definition-search').fill('missing report');assert.equal(await page.locator('#report-definition-list tr').count(),1);await page.locator('#report-definition-search').fill('dates');assert.equal(await page.locator('#report-definition-list tr').count(),2);
 const before=await page.locator('#report-definition-form').boundingBox();await page.getByRole('button',{name:'Resize editor',exact:true}).focus();await page.keyboard.press('ArrowLeft');const after=await page.locator('#report-definition-form').boundingBox();assert.ok(after.width>before.width);assert.equal(Math.round(after.x+after.width),Math.round(before.x+before.width));
 await page.locator('#report-design-name').fill('Transactions by date');await page.locator('#report-tab-columns').click();await page.locator('#report-add-column').click();
 await page.locator('#report-design-columns .report-column-row').last().locator('select').selectOption('description');await page.locator('#report-design-columns .report-column-row').last().getByRole('button',{name:'Remove',exact:true}).click();
 for(const width of [1280,540]){
   await page.setViewportSize({width,height:900});
   const grid=await page.locator('.report-column-grid').count();assert.equal(grid,1);assert.equal(await page.locator('#report-design-columns tr').count(),2);assert.ok(await page.locator('#report-design-columns tr').first().getByRole('button',{name:'Up',exact:true}).isDisabled());

 }
 await page.setViewportSize({width:1280,height:900});
 await page.locator('#report-design-columns tr').last().getByRole('button',{name:'Up',exact:true}).click();assert.equal(await page.locator('#report-design-columns .rd-field').first().inputValue(),'description');
 await page.locator('#report-design-columns tr').first().getByRole('button',{name:'Down',exact:true}).click();assert.equal(await page.locator('#report-design-columns .rd-field').first().inputValue(),'journal_date');
 const output=path.join(root,'output/report-builder');fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,'designer.png')});
 await page.locator('#report-definition-form button[type=submit]').click();await page.waitForFunction(()=>requests.some(([p])=>p.includes('save')));
 await page.waitForFunction(()=>document.querySelector('#report-definition-form').hidden);
 await page.getByText('Transaction dates',{exact:true}).click();await page.locator('#report-tab-details').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#report-tab-columns').getAttribute('aria-selected'),'true');await page.keyboard.press('Escape');assert.ok(await page.locator('#report-definition-form').isHidden());
 const saved=await page.evaluate(()=>requests.find(([p])=>p.includes('save'))[1]);assert.equal(saved.definition_json.parameters[0].type,'date');assert.equal(saved.definition_json.columns.length,2);
 await page.evaluate(async()=>{document.querySelector('#view-reportdefinitions').hidden=true;document.querySelector('#view-customreports').hidden=false;await builder.runner();});
 await page.locator('[data-parameter=fromDate]').fill('2026-09-01');await page.getByRole('button',{name:'Run report',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#custom-report-next').disabled===false);
 await page.locator('[data-parameter=fromDate]').fill('2026-10-01');await page.getByRole('button',{name:'Next',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#custom-report-next').disabled===true);
 await page.getByRole('button',{name:'Previous',exact:true}).click();await page.waitForFunction(()=>requests.filter(([p])=>p==='reports/run').length===3);
 const runs=await page.evaluate(()=>requests.filter(([p])=>p==='reports/run').map(([,b])=>b));assert.deepEqual(runs.map(b=>b.parameters.fromDate),['2026-09-01','2026-09-01','2026-09-01']);assert.deepEqual(runs.map(b=>b.offset),[0,100,0]);
 await page.locator('#view-customreports').screenshot({path:path.join(output,'runner.png')});
 await page.evaluate(()=>builder.reset());assert.equal(await page.locator('#custom-report-result').textContent(),'');assert.ok(await page.locator('#custom-report-export').isDisabled());
 // Exercise the actual role tree function with two reports and two divisions.
 const app=fs.readFileSync(path.join(pub,'app.js'),'utf8');const tree=app.slice(app.indexOf('  function renderMasterPermissionTree('),app.indexOf('  function collectMasterPermissions('));
 await page.evaluate(tree=>{window.$=id=>document.getElementById(id);window.state={divisions:[{division_id:'top',division_code:'TOP',division_name:'Top'},{division_id:'child',parent_division_id:'top',division_code:'CHILD',division_name:'Child'}],reportDefinitions:[{report_id:'report',report_code:'dates',report_name:'Transaction dates',is_active:true},{report_id:'inactive',report_code:'old',report_name:'Old report',is_active:false}]};(0,eval)(tree);renderMasterPermissionTree([{resource_kind:'report',resource_code:'report',division_id:'top',workflow_status:'view',applies_to_children:false}],'reports');document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!=='view-permissions');document.querySelector('#role-form').hidden=false;document.querySelectorAll('.permission-section').forEach(el=>el.hidden=el.id!=='role-tab-reports');document.querySelectorAll('#report-permission-lines .master-permission-children').forEach(el=>el.hidden=false);},tree);
 assert.equal(await page.locator('#report-permission-lines .master-permission-leaf').count(),4);
 assert.ok(await page.locator('[data-resource-code=report][data-division-id=top] .master-permission-check').isChecked());assert.equal(await page.locator('[data-resource-code=report][data-division-id=top] .report-permission-children').isChecked(),false);
 assert.equal(await page.locator('[data-resource-code=inactive][data-division-id=top] .master-permission-check').isChecked(),false);
 await page.locator('#role-form').screenshot({path:path.join(output,'role-reports.png')});
 const menuSource=app.slice(app.indexOf('  function definedReportMenuItems('),app.indexOf('  function resourcesForModules('));
 const menus=await page.evaluate(source=>{window.menuItemMarkup=item=>item;state.reportDefinitions=[{report_id:'one',report_name:'First report',module_ids:['moduleA'],is_active:true},{report_id:'two',report_name:'Second report',module_ids:['moduleB'],is_active:true},{report_id:'old',report_name:'Inactive',module_ids:['moduleA'],is_active:false}];state.navigation={is_administrator:false,permissions:[{role_id:'roleA',resource_kind:'report',resource_code:'one'},{role_id:'roleB',resource_kind:'report',resource_code:'two'}]};(0,eval)(source);return {module:definedReportMenuItems({moduleIds:new Set(['moduleA'])}),role:definedReportMenuItems({role:{role_id:'roleB'}}),technical:definedReportMenuItems()};},menuSource);
 assert.deepEqual(menus.module.map(m=>m.label),['First report']);assert.deepEqual(menus.role.map(m=>m.label),['Second report']);assert.equal(menus.technical.length,2);assert.ok(menus.technical.every(m=>m.attributes.includes('data-defined-report=')));
 assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>notifications),[]);
 console.log('PASS: report designer, typed date parameters, saved pagination parameters, context clearing and individual report role grants');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
