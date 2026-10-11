"use strict";
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..'),pub=path.join(root,'Volumes/Core-ERP/public'),app=fs.readFileSync(path.join(pub,'app.js'),'utf8');
const extract=(a,b)=>app.slice(app.indexOf(`  function ${a}(`),app.indexOf(`  function ${b}(`));
const helpers=extract('table','workflowStepsForPath')+extract('setRequiredMarker','updateAccountLegalEntityRequirement')+extract('addPanelCloseButtons','renderDashboard')+extract('fiscalRecordActions','renderCountries')+extract('renderPeriodGrid','renderAccounts');
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.ERP_BROWSER_EXECUTABLE?{executablePath:process.env.ERP_BROWSER_EXECUTABLE}:{})});try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent(fs.readFileSync(path.join(pub,'index.html'),'utf8').replace(/<script[\s\S]*?<\/script>/g,'').replace(/<link[\s\S]*?>/g,''));
 await page.addStyleTag({content:fs.readFileSync(path.join(pub,'style.css'),'utf8')});
 await page.addStyleTag({content:'.workspace-context,.sidebar{display:none!important}.erp-shell{display:block!important}main{margin:0!important;padding:16px!important}.view{min-height:850px}'});
 await page.evaluate(helpers=>{
  window.$=id=>document.getElementById(id);window.dateOnly=v=>String(v||'').slice(0,10);window.pretty=v=>String(v).replaceAll('_',' ');window.searchTerm=id=>$(id).value.toLowerCase();window.rowMatches=(r,t)=>Object.values(r).some(v=>String(v).toLowerCase().includes(t));
  window.expandedFiscalYears=new Set();window.state={orgId:'org',years:[{fiscal_year_id:'y1',fiscal_year_code:'FY2026',start_date:'2026-01-01',end_date:'2026-12-31',status:'open'},{fiscal_year_id:'y2',fiscal_year_code:'FY2027',start_date:'2027-01-01',end_date:'2027-12-31',status:'open'}],periods:[{fiscal_period_id:'p1',fiscal_year_id:'y1',period_number:1,period_code:'FY2026-01',start_date:'2026-01-01',end_date:'2026-01-31',status:'open'},{fiscal_period_id:'p2',fiscal_year_id:'y1',period_number:2,period_code:'Special period',start_date:'2026-02-01',end_date:'2026-02-28',status:'open'},{fiscal_period_id:'p3',fiscal_year_id:'y2',period_number:1,period_code:'FY2027-01',start_date:'2027-01-01',end_date:'2027-01-31',status:'open'}]};
  window.requests=[];window.notifications=[];window.failSave=false;window.alert=m=>notifications.push(m);window.invalidateDashboard=()=>{};window.ensureFiscal=async()=>{};
  window.api=async(p,o)=>{const body=JSON.parse(o.body);requests.push({p,body});if(p.includes('save')){if(failSave)throw new Error('Save failed');if(p.endsWith('save-period'))Object.assign(state.periods.find(r=>r.fiscal_period_id===body.fiscal_period_id)||{},body);return {fiscal_year:{fiscal_year_id:body.fiscal_year_id||'new-year'}};}
   if(body.fiscal_period_id==='p1'||body.fiscal_year_id==='y1')throw new Error('Cannot delete fiscal record: 1 transaction record references this period.');
   if(p.endsWith('delete-period'))state.periods=state.periods.filter(r=>r.fiscal_period_id!==body.fiscal_period_id);
   if(p.endsWith('delete-year')){state.years=state.years.filter(r=>r.fiscal_year_id!==body.fiscal_year_id);state.periods=state.periods.filter(r=>r.fiscal_year_id!==body.fiscal_year_id);}return {ok:true};};
  (0,eval)(helpers);installFiscalEditors();addPanelCloseButtons();syncRequiredMarkers();renderFiscal();$('fiscal-search').addEventListener('input',renderFiscal);
  document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!=='view-fiscal');
 },helpers);
 const out=path.join(root,'output/fiscal-setup');fs.mkdirSync(out,{recursive:true});
 const fullWidth=await page.evaluate(()=>{const s=$('view-fiscal').querySelector('.split');return Math.abs(s.getBoundingClientRect().width-s.querySelector('.panel').getBoundingClientRect().width)<2;});assert.ok(fullWidth);
 await page.screenshot({path:path.join(out,'desktop-closed.png')});
 await page.getByRole('button',{name:'Expand periods for FY2026',exact:true}).click();assert.ok(await page.getByRole('button',{name:'Edit Special period',exact:true}).isVisible());
 const row=page.locator('#fiscal-year-list .period-cell tbody tr').last();await row.focus();await page.keyboard.press('Enter');assert.ok(await page.locator('#fiscal-period-panel').isVisible());assert.equal(await page.locator('#period-year-context').textContent(),'FY2026 · 2026-01-01 to 2026-12-31');
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  const layout=await page.locator('#fiscal-period-form').evaluate(form=>{const box=form.getBoundingClientRect();return {bounds:box.left>=0&&box.right<=innerWidth+1,sticky:getComputedStyle(form.querySelector('.actions')).position==='sticky',aligned:[...form.querySelectorAll('label:not(.check)')].every(l=>{const c=l.querySelector('.account-field-caption').getBoundingClientRect(),f=l.querySelector('input,select').getBoundingClientRect();return f.left>=c.right&&Math.abs(f.top-c.top)<2;})};});assert.ok(layout.bounds&&layout.sticky&&layout.aligned,JSON.stringify(layout));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Narrow grid overflow stays in its scroll container');
  await page.screenshot({path:path.join(out,`${width}-period-open.png`)});
 }
 await page.setViewportSize({width:1440,height:900});await page.locator('#period-status').selectOption('soft_closed');await page.evaluate(()=>failSave=true);await page.getByRole('button',{name:'Save Period',exact:true}).click();await page.waitForFunction(()=>notifications.includes('Save failed'));assert.ok(await page.locator('#fiscal-period-panel').isVisible());assert.equal(await page.locator('#period-status').inputValue(),'soft_closed');
 await page.evaluate(()=>failSave=false);await page.getByRole('button',{name:'Save Period',exact:true}).click();await page.waitForFunction(()=>$('fiscal-period-panel').hidden);const saved=await page.evaluate(()=>requests.filter(r=>r.p==='fiscal/save-period').at(-1).body);assert.equal(saved.period_code,'Special period');await page.screenshot({path:path.join(out,'desktop-expanded.png')});
 await page.getByRole('button',{name:'Delete Special period',exact:true}).scrollIntoViewIfNeeded();page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Delete Special period',exact:true}).click();assert.equal(await page.evaluate(()=>requests.filter(r=>r.p.includes('delete')).length),0);
 page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'Delete Special period',exact:true}).click();await page.waitForFunction(()=>!state.periods.some(p=>p.fiscal_period_id==='p2'));
 await page.getByRole('button',{name:'Delete FY2026-01',exact:true}).click();await page.waitForFunction(()=>notifications.some(m=>m.includes('1 transaction')));assert.ok(await page.getByRole('button',{name:'Edit FY2026-01',exact:true}).isVisible());
 await page.getByRole('button',{name:'Edit FY2027',exact:true}).click();assert.ok(await page.locator('#fiscal-editor-panel').isVisible());assert.ok(await page.locator('#fiscal-periods').isHidden());
 await page.screenshot({path:path.join(out,'desktop-year-open.png')});await page.locator('#fiscal-editor-panel [data-panel-cancel]').click();assert.ok(await page.locator('#fiscal-editor-panel').isHidden());
 await page.getByRole('button',{name:'Delete FY2027',exact:true}).click();await page.waitForFunction(()=>!state.years.some(y=>y.fiscal_year_id==='y2'));assert.equal(await page.evaluate(()=>state.periods.filter(p=>p.fiscal_year_id==='y2').length),0);
 await page.locator('#fiscal-search').fill('FY2026-01');assert.ok(await page.getByRole('button',{name:'Edit FY2026',exact:true}).isVisible());await page.locator('#fiscal-search').fill('no match');assert.equal(await page.locator('#fiscal-year-list .empty').textContent(),'No records yet.');await page.locator('#fiscal-search').fill('');
 await page.getByRole('button',{name:'Add period to FY2026',exact:true}).click();assert.equal(await page.locator('#period-number').inputValue(),'2');await page.locator('#fiscal-period-panel .panel-close').click();
 await page.locator('#add-fiscal-year').click();assert.ok(await page.locator('#fiscal-periods').isVisible());await page.setViewportSize({width:390,height:900});await page.screenshot({path:path.join(out,'narrow-year-open.png')});await page.locator('#fiscal-editor-panel .panel-close').click();await page.screenshot({path:path.join(out,'narrow-closed.png')});
 assert.deepEqual(errors,[]);console.log('PASS: grouped periods, shared keyboard grid, Edit/Delete, confirmation cancellation, blocked/successful deletion, save failure retention, parent context, aligned responsive panels, sticky actions and list width');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
