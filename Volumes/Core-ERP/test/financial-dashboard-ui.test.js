'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
let chromium;try{({chromium}=require('playwright'));}catch{}
const {financialDashboardResult}=require('../api/_shared/erp/financial-dashboard');
test('financial dashboard renders proportional totals, category drill-downs and narrow layouts',{skip:!chromium},async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.SHOWIF_BROWSER_CHANNEL?{channel:process.env.SHOWIF_BROWSER_CHANNEL}:{})});
  try{
    const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const data=financialDashboardResult([
      {account_class:'asset',balance:'1200.00',type_id:'bank',type_name:'Bank accounts',account_id:'bank-1',subledger_code:'B01',subledger_name:'Operating account',gl_account_id:'1010',account_code:'1010',account_name:'Bank'},
      {account_class:'asset',balance:'6800.00',type_id:'asset',type_name:'Assets',account_id:'asset-1',subledger_code:'A01',subledger_name:'Property',gl_account_id:'1300',account_code:'1300',account_name:'Cost'},
      {account_class:'asset',balance:'240.00',type_id:'asset',type_name:'Assets',account_id:'car',subledger_code:'A02',subledger_name:'Mazda',gl_account_id:'1300',account_code:'1300',account_name:'Cost'},
      {account_class:'asset',balance:'-100.00',type_id:'asset',type_name:'Assets',account_id:'car',subledger_code:'A02',subledger_name:'Mazda',gl_account_id:'1350',account_code:'1350',account_name:'Depreciation'},
      {account_class:'liability',balance:'-3400.00',type_id:'loan',type_name:'Loans',account_id:'loan-1',subledger_code:'L01',subledger_name:'Property loan',gl_account_id:'2500',account_code:'2500',account_name:'Loan payable'},
    ],'2026-10-26');
    await page.setContent('<main id="target"></main>');await page.addStyleTag({path:path.resolve('public/style.css')});await page.addScriptTag({path:path.resolve('public/financial-dashboard.js')});
    const render=async value=>page.evaluate(value=>{document.getElementById('target').replaceChildren();window.erpFinancialDashboard.render({target:document.getElementById('target'),data:value,formatMoney:value=>'R '+Number(value).toFixed(2),onAccount:(type,account)=>{window.selectedStatement={type,account};}});},value);
    await render(data);
    assert.equal(await page.locator('.financial-dashboard-asset .financial-dashboard-group').count(),2);
    assert.doesNotMatch(await page.locator('.financial-dashboard-asset').innerText(),/Mazda|Property|Operating account/);
    assert.match(await page.locator('.financial-dashboard-asset').innerText(),/Assets.*R 6940.00/s);
    assert.match(await page.locator('.financial-dashboard-asset .financial-dashboard-percentage').innerText(),/58.23%/);
    assert.match(await page.locator('.financial-dashboard-liability .financial-dashboard-percentage').innerText(),/41.77%/);
    await page.locator('.financial-dashboard-asset .financial-dashboard-group').filter({hasText:'Assets'}).click();
    assert.equal(await page.locator('.financial-dashboard-detail button').filter({hasText:'Mazda'}).count(),1);
    assert.match(await page.locator('.financial-dashboard-detail').innerText(),/Mazda.*R 140.00/s);
    assert.doesNotMatch(await page.locator('.financial-dashboard-detail').innerText(),/Depreciation/);
    await page.getByRole('button',{name:/A02 · Mazda/}).click();
    assert.match(await page.locator('.financial-dashboard-detail').innerText(),/Depreciation/);
    await page.getByRole('button',{name:'← Assets',exact:true}).click();
    assert.doesNotMatch(await page.locator('.financial-dashboard-detail').innerText(),/Depreciation/);
    for(const width of [1400,900,375,320]){
      await page.setViewportSize({width,height:1100});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`no horizontal overflow at ${width}`);
      const assetBars=await page.locator('.financial-dashboard-asset .financial-dashboard-track').evaluateAll(tracks=>tracks.map(track=>({track:track.getBoundingClientRect().left,bar:track.firstElementChild.getBoundingClientRect().left})));
      assert.ok(assetBars.every(({track,bar})=>Math.abs(track-bar)<1),`asset bars start at the left edge at ${width}`);
      const boxes=await page.locator('.financial-dashboard-position > section').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
      if(width===1400)assert.ok(boxes[0].right<=boxes[1].x&&boxes[1].right<=boxes[2].x,'assets, centre, liabilities remain in order');
      const bars=await page.locator('.financial-dashboard-comparison-track .financial-dashboard-bar').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width));
      assert.ok(Math.abs(bars[1]/bars[0]-3400/8140)<.01,'comparison uses one proportional scale');
    }
    await page.getByRole('button',{name:/Loans R/}).click();assert.match(await page.locator('.financial-dashboard-detail').innerText(),/Property loan/);
    await page.getByRole('button',{name:/Property loan, Loan payable/}).click();
    assert.equal((await page.evaluate(()=>window.selectedStatement)).account.gl_account_id,'2500');
    await render({...data,restricted:true});assert.match(await page.locator('.financial-dashboard-warning').innerText(),/Partial financial position/);
    await render(financialDashboardResult([],'2026-10-26'));assert.match(await page.locator('.financial-dashboard-detail').innerText(),/No posted/);
    assert.match(await page.locator('.financial-dashboard-asset .financial-dashboard-percentage').innerText(),/Not available/);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
