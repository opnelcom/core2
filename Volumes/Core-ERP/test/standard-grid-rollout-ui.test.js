'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
let chromium; try { ({ chromium } = require('playwright')); } catch {}
const read = name => fs.readFileSync(path.join(__dirname, '../public', name), 'utf8');
const launch = () => chromium.launch({ headless: true, ...(process.env.SHOWIF_BROWSER_CHANNEL ? { channel: process.env.SHOWIF_BROWSER_CHANNEL } : {}) });
test('every registered main list renders through the actual table bridge; nested tables stay legacy', { skip: !chromium }, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.setContent(`<style>${read('style.css')}\n${read('standard-grid.css')}body{display:block;padding:16px;overflow:auto}</style><div id="host"></div>`);
    for (const name of ['standard-grid.js', 'standard-grid-lists.js']) await page.addScriptTag({ content: read(name) });
    const app = read('app.js'), start = app.indexOf('  function table('), end = app.indexOf('  function workflowStepsForPath(', start);
    await page.addScriptTag({ content: `
      const state={orgId:'org',divisionId:'division',workflowStatuses:[]};
      const selectedAccountScopeCode='asset',selectedAccountingObjectTypeId='project',selectedAccountingDimensionTypeId='region',selectedTransactionTypeId='sale';
      const workflowStepLabel=r=>r.workflow_step_label||'Draft',dateOnly=v=>v?String(v).slice(0,10):'';
      const closeWorkflowMenu=()=>{},objectActions={close(){}};
      ${app.slice(start,end)}
      window.exercise=(id,count)=>{
        const host=document.querySelector('#host');host.innerHTML='<section class="view"><div class="panel"><div class="panel-head"><h2>List</h2><div class="panel-actions"></div></div><div id="'+id+'"></div></div></section>';
        const target=document.getElementById(id);
        const row={name:'Entry',transaction_balance:25,total_balance:10,debit_total:5,credit_total:5,journal_date:'2026-10-23',workflow_step_label:'Draft',valid_from:'2026-01-01',valid_to:'2026-12-31',resource_assignment_id:'assignment',colour:'#112233'};
        const columns=Array.from({length:count},(_,i)=>['Field '+i,r=>i===0?r.name:'1']);
        table(target,columns,[row],()=>{});table(target,columns,[row],()=>{});
      };
    ` });
    // Counts mirror the actual list renderers and make a registration mismatch fail.
    const counts = [4,3,6,5,5,4,5,4,7,7,7,4,4,5,7,5,4,6,7,8,7,6,4,7,7,5,8,8,4];
    const ids = await page.evaluate(() => erpStandardGridLists.ids);
    assert.equal(ids.length, counts.length);
    for (let index = 0; index < ids.length; index++) {
      await page.evaluate(([id, count]) => exercise(id, count), [ids[index], counts[index]]);
      assert.equal(await page.locator('.standard-grid').count(), 1, ids[index]);
      assert.equal(await page.getByRole('button', { name: 'Grid options', exact: true }).count(), 1, ids[index]);
      await page.locator('.standard-grid-sort').first().click();
      assert.equal(await page.locator('tbody tr').count(), 1, ids[index]);
      await page.evaluate(() => erpStandardGrid.destroy(document.querySelector('[data-standard-grid]')));
    }
    await page.evaluate(() => exercise('legal-entity-account-list', 2));
    assert.equal(await page.locator('.standard-grid').count(), 0); assert.equal(await page.locator('.data-grid').count(), 1);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
test('fiscal expansion follows filtered/sorted years and nested periods remain outside the shared control', { skip: !chromium }, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>${read('style.css')}\n${read('standard-grid.css')}body{display:block;padding:16px;overflow:auto}</style><div class="panel"><div class="panel-head"></div><input id="fiscal-search"><div id="fiscal-year-list"></div></div>`);
    for (const name of ['standard-grid.js', 'standard-grid-lists.js']) await page.addScriptTag({ content: read(name) });
    const app = read('app.js'), tableStart = app.indexOf('  function table('), tableEnd = app.indexOf('  function workflowStepsForPath(', tableStart);
    const fiscalStart = app.indexOf('  function renderFiscal()'), fiscalEnd = app.indexOf('  function renderCountries()', fiscalStart);
    await page.addScriptTag({ content: `
      const $=id=>document.getElementById(id),state={orgId:'org',years:[{fiscal_year_id:'b',fiscal_year_code:'2027',start_date:'2027-01-01',end_date:'2027-12-31',status:'open'},{fiscal_year_id:'a',fiscal_year_code:'2026',start_date:'2026-01-01',end_date:'2026-12-31',status:'open'}],periods:[],workflowStatuses:[]};
      const expandedFiscalYears=new Set(['a']),dateOnly=v=>v||'',workflowStepLabel=()=>'',searchTerm=()=>'',rowMatches=()=>true,pretty=v=>v;
      const closeWorkflowMenu=()=>{},objectActions={close(){}},fiscalRecordActions=()=>document.createElement('button'),selectFiscalYear=()=>{};
      const renderPeriodGrid=(cell,year)=>{cell.textContent='Periods for '+year.fiscal_year_code};
      ${app.slice(tableStart,tableEnd)}
      ${app.slice(fiscalStart,fiscalEnd)}
      renderFiscal();
    ` });
    await page.locator('[data-sort-key=column-1]').click();
    assert.match(await page.locator('tbody > tr').nth(0).innerText(), /2026/);
    assert.equal(await page.locator('tbody > tr').nth(1).innerText(), 'Periods for 2026');
    await page.locator('[data-filter-key=column-1]').click(); await page.getByLabel('Matches', { exact: true }).fill('2027');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    assert.equal(await page.locator('tbody > tr').count(), 1); assert.match(await page.locator('tbody').innerText(), /2027/);
  } finally { await browser.close(); }
});
test('cached lists restore one menu on return and discard filters, widths and drafts on leaving', { skip: !chromium }, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage(); await page.setContent('<div id="toolbar"></div><div id="grid"></div>');
    await page.addScriptTag({ content: read('standard-grid.js') });
    await page.evaluate(() => {
      window.target = document.querySelector('#grid');
      erpStandardGrid.render({ target, toolbar: document.querySelector('#toolbar'), contextKey: 'org:type', columns: [{ key: 'name', label: 'Name', type: 'text', value: r => r.name }], rows: [{ name: 'One' }, { name: 'Two' }] });
    });
    await page.locator('[data-filter-key=name]').click(); await page.getByLabel('Matches', { exact: true }).fill('One');
    await page.getByRole('button', { name: 'Apply', exact: true }).click(); assert.equal(await page.locator('tbody tr').count(), 1);
    await page.evaluate(() => erpStandardGrid.leave(target));
    assert.equal(await page.getByRole('button', { name: 'Grid options', exact: true }).count(), 0);
    await page.evaluate(() => { erpStandardGrid.resume(target); erpStandardGrid.resume(target); });
    assert.equal(await page.locator('tbody tr').count(), 2); assert.equal(await page.getByRole('button', { name: 'Grid options', exact: true }).count(), 1);
    await page.locator('[data-filter-key=name]').click();
    await page.evaluate(() => erpStandardGrid.leave(target)); assert.equal(await page.locator('.standard-grid-popover').count(), 0);
    await page.evaluate(() => { erpStandardGrid.resume(target); erpStandardGrid.suspend(target); target.textContent = 'Status board'; erpStandardGrid.leave(target); erpStandardGrid.resume(target); });
    assert.equal(await page.locator('#grid').innerText(), 'Status board');
    assert.equal(await page.getByRole('button', { name: 'Grid options', exact: true }).count(), 0);
  } finally { await browser.close(); }
});
