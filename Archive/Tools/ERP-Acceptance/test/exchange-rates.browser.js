'use strict';
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname,'../../..'), erp = path.join(root,'Volumes/Core-ERP');
const source = fs.readFileSync(path.join(erp,'public/app.js'),'utf8');
function extract(name) {
  const start=source.indexOf(`  function ${name}(`); assert.ok(start>=0,name);
  const rest=source.slice(start+4), next=rest.search(/\n  (?:async )?function /);
  return source.slice(start,next<0?source.length:start+4+next);
}
const helpers=['moveControlToPanel','showSetupTypeTab','installSetupTypeTabs','setRequiredMarker','syncRequiredMarkers','table','installResizableObjectEditors','addPanelCloseButtons'].map(extract).join('\n');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.ERP_BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.setContent(fs.readFileSync(path.join(erp,'public/index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,''));
    await page.addStyleTag({content:fs.readFileSync(path.join(erp,'public/style.css'),'utf8')});
    await page.addScriptTag({content:fs.readFileSync(path.join(erp,'public/exchange-rate-math.js'),'utf8')});
    await page.addScriptTag({content:fs.readFileSync(path.join(erp,'public/exchange-rates.js'),'utf8')});
    await page.evaluate(helpers=>{
      window.$=id=>document.getElementById(id);window.state={orgId:'org-one'};
      (0,eval)(helpers);
      for(const view of document.querySelectorAll('.view'))view.hidden=true;
      $('view-currencies').hidden=false; $('page-title').textContent='Currencies';
      const row={exchange_rate_id:'rate-one',from_currency_code:'USD',to_currency_code:'ZAR',effective_from:'2026-10-11',rate:'18.50000000',revision:1,updated_at:'2026-10-11T08:42:00Z',updated_by_email:'admin@example.com'};
      window.fixtureRows=[row,{...row,exchange_rate_id:'rate-two',from_currency_code:'EUR',rate:'20.25000000'}];
      window.failSave=false;window.savePayloads=[];
      window.api=async(url,options)=>{
        if(url.includes('list?'))return window.deferList?new Promise(resolve=>window.resolveList=resolve):{exchange_rates:fixtureRows};
        if(url.includes('history?'))return window.deferHistory?new Promise(resolve=>window.resolveHistory=resolve):{changes:[{revision:1,rate:'18.50000000',previous_rate:null,changed_at:row.updated_at,changed_by_email:row.updated_by_email}]};
        if(url.includes('/save')) {const body=JSON.parse(options.body);savePayloads.push(body);if(failSave)throw new Error('Fixture save failure');return {exchange_rate:{...row,...body}};}
        throw new Error(url);
      };
      window.editor=createExchangeRateEditor({api,context:()=>state,currencies:()=>[{currency_code:'USD',currency_name:'US Dollar'},{currency_code:'ZAR',currency_name:'South African Rand'},{currency_code:'EUR',currency_name:'Euro'}],table,installSetupTypeTabs,showSetupTypeTab,syncRequiredMarkers});
      installResizableObjectEditors();addPanelCloseButtons();syncRequiredMarkers();
      table($('currency-list'),[['Code',r=>r.code],['Name',r=>r.name]],[{code:'USD',name:'US Dollar'},{code:'ZAR',name:'South African Rand'}]);
    },helpers);
    const tabs=page.locator('#currency-tabs button'),form=page.locator('#exchange-rate-form');
    fs.mkdirSync(path.join(root,'tmp/exchange-rates-browser'),{recursive:true});
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:1000});await tabs.nth(1).click();
      await page.locator('#exchange-rate-list tbody tr').first().waitFor();
      const split=await page.locator('#view-currencies .split').boundingBox(),list=await page.locator('#view-currencies .split > .panel').first().boundingBox();
      assert.ok(list.width>=split.width-2,'closed grid full width');
      await page.screenshot({path:path.join(root,`tmp/exchange-rates-browser/closed-${width}.png`),fullPage:true});
      await page.locator('#exchange-rate-search').fill('EUR');assert.equal(await page.locator('#exchange-rate-list tbody tr').count(),1);
      await page.locator('#exchange-rate-search').fill('');
      await page.locator('#exchange-rate-list tbody tr').first().focus();await page.keyboard.press('Enter');
      assert.equal(await form.isVisible(),true);assert.equal(await page.locator('#exchange-rate-from').isDisabled(),true);
      assert.equal(await page.locator('#exchange-rate-date').getAttribute('readonly'),'');
      assert.ok((await page.locator('#exchange-rate-reverse').textContent()).includes('0.05405405'));
      await page.waitForTimeout(80);
      const box=await form.boundingBox(),view=await page.locator('#view-currencies').boundingBox();
      assert.ok(box.x>=view.x&&box.x+box.width<=view.x+view.width+1,'editor within view');
      assert.ok(box.y+box.height<=1001,`editor within viewport at ${width}: ${JSON.stringify(box)}`);
      const caption=await page.locator('#exchange-rate-value').locator('..').locator('.account-field-caption').boundingBox();
      const control=await page.locator('#exchange-rate-value').boundingBox();assert.ok(control.x>=caption.x+caption.width,'caption left');
      await page.screenshot({path:path.join(root,`tmp/exchange-rates-browser/open-${width}.png`),fullPage:true});
      await page.locator('#exchange-rate-value').fill('18.6');await page.locator('#exchange-rate-reason').fill('Corrected quote');
      await page.locator('#exchange-rate-editor-tabs button').nth(1).click();
      assert.ok((await page.locator('#exchange-rate-history').textContent()).includes('admin@example.com'));
      await page.locator('#exchange-rate-editor-tabs button').nth(0).click();assert.equal(await page.locator('#exchange-rate-value').inputValue(),'18.6');
      await page.locator('#exchange-rate-reason').fill('');await page.locator('#exchange-rate-editor-tabs button').nth(1).click();
      await page.locator('#exchange-rate-save').click();assert.equal(await page.locator('#exchange-rate-reason').isVisible(),true,'invalid hidden field reveals Details');
      await page.locator('#exchange-rate-reason').fill('Corrected quote');await page.evaluate(()=>failSave=true);
      await page.locator('#exchange-rate-save').click();await page.locator('#exchange-rate-error').waitFor();
      assert.equal(await page.locator('#exchange-rate-value').inputValue(),'18.6');assert.equal(await form.isVisible(),true);
      await page.evaluate(()=>failSave=false);await page.locator('#exchange-rate-save').click();await form.waitFor({state:'hidden'});
      const payload=await page.evaluate(()=>savePayloads.at(-1));assert.equal(payload.revision,1);assert.equal(payload.reason,'Corrected quote');
      await page.locator('#add-exchange-rate').click();assert.equal(await page.locator('#exchange-rate-from').isDisabled(),false);
      assert.equal(await page.locator('#exchange-rate-reason').isVisible(),false);
      await page.locator('#exchange-rate-from').selectOption('USD');await page.locator('#exchange-rate-to').selectOption('USD');
      await page.locator('#exchange-rate-date').fill('2026-10-12');await page.locator('#exchange-rate-value').fill('1');
      assert.equal(await page.locator('#exchange-rate-to').evaluate(el=>el.checkValidity()),false);
      await page.locator('#exchange-rate-to').selectOption('ZAR');
      await page.locator('#exchange-rate-save').click();await form.waitFor({state:'hidden'});
      assert.equal((await page.evaluate(()=>savePayloads.at(-1))).exchange_rate_id,null,'new entry is submitted without an existing ID');
      await page.locator('#add-exchange-rate').click();
      const resize=form.locator('.object-editor-resize');await resize.focus();await page.keyboard.press('ArrowLeft');
      assert.ok(await form.evaluate(el=>!!el.style.width));
      await page.keyboard.press('Escape');await form.waitFor({state:'hidden'});
      await page.locator('#add-exchange-rate').click();await form.locator('[data-panel-cancel]').click();await form.waitFor({state:'hidden'});
    }
    // Ignore responses started in a previous organisation, even after switching back.
    await page.evaluate(()=>{deferList=true;editor.load(true);state.orgId='org-two';editor.reset();state.orgId='org-one';resolveList({exchange_rates:fixtureRows});});
    await page.waitForTimeout(30);assert.equal(await page.locator('#exchange-rate-list tbody tr').count(),0);
    await page.evaluate(async()=>{deferList=false;await editor.load(true);});await tabs.nth(1).click();
    await page.evaluate(()=>deferHistory=true);await page.locator('#exchange-rate-list tbody tr').first().click();
    await page.evaluate(()=>{state.orgId='org-two';editor.reset();resolveHistory({changes:[{changed_by_email:'LEAK'}]});});
    await page.waitForTimeout(30);assert.equal(await form.isVisible(),false);assert.ok(!(await page.locator('#exchange-rate-history').textContent()).includes('LEAK'));
    assert.deepEqual(errors,[]);console.log('Exchange rates browser: closed/open desktop/mobile, keyboard, corrections, failures, resize and context guards passed');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
