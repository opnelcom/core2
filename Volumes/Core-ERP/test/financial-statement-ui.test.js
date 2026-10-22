"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

// Run with NODE_PATH pointing to the bundled browser dependencies.
let chromium;
try { ({ chromium } = require("playwright")); } catch {}
test("financial statement cards and inline drill-down at desktop and narrow widths", { skip: !chromium }, async () => {
  const browser = await chromium.launch({headless:true, ...(process.env.ERP_BROWSER_CHANNEL ? {channel:process.env.ERP_BROWSER_CHANNEL} : {})});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const source = fs.readFileSync(require.resolve("../public/app.js"),"utf8");
    const functions = source.slice(source.indexOf("  function renderFinancialStatementResult("),source.indexOf("  async function moveJournalWorkflow("));
    await page.setContent('<div id="view-reports"><div id="report-result"></div></div>');
    await page.addStyleTag({content:fs.readFileSync(require.resolve("../public/style.css"),"utf8")});
    await page.addScriptTag({content:`
      const $ = id => document.getElementById(id);
      const state = {orgId:'org'};
      let financialReportSequence = 1, selectedReport = 'financial_statement';
      const formatOrgMoney = value => 'R ' + Number(value).toFixed(2);
      const dateOnly = value => value;
      function table(target, columns, rows) {
        const table = document.createElement('table');
        const head = document.createElement('tr'); for (const [label] of columns) { const th = document.createElement('th'); th.textContent = label; head.append(th); } table.append(head);
        for(const row of rows) { const tr = document.createElement('tr'); for(const [,get] of columns) { const td=document.createElement('td'); const value=get(row); if(value instanceof Node)td.append(value);else td.textContent=value || '';tr.append(td); } table.append(tr); } target.replaceChildren(table);
      }
      async function api(url) {
        if(url.startsWith('journals/')) return {journal:{journal_number:'JRN-1',journal_date:'2026-10-03',description:'Deposit'},lines:[{gl_account_code:'1010',gl_account_name:'Bank',debit_amount:1000,credit_amount:0}]};
        if(url.includes('account_id'))return {rows:[{journal_id:'journal',journal_number:'JRN-1',journal_date:'2026-10-03',transaction_heading:'Owner capital contribution',description:'Line description',journal_description:'Journal description',debit_amount:1000,credit_amount:0}],total_count:1};
        return {rows:[{gl_account_id:'bank',account_code:'1010',account_name:'Bank',amount:1000}]};
      }
      ${functions}
      renderFinancialStatementResult([{financial_statement_line_id:'total',line_label:'Total Assets',line_type:'formula',amount:1000},{financial_statement_line_id:'equity',line_label:'Equity',line_type:'account_group',amount:1000}],{asset:1000,liability:0,equity:1000},new URLSearchParams({organisation_id:'org'}),1);
    `});
    for (const width of [1200,360]) {
      await page.setViewportSize({width,height:900});
      assert.equal(await page.locator('.financial-statement-summary-card').count(),3);
      assert.equal(await page.getByText('Balance check',{exact:true}).count(),0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
      const parent = page.getByRole('button',{name:'Total Assets',exact:true});
      assert.equal(await parent.getAttribute('aria-expanded'),'false');
      await parent.click();
      assert.equal(await parent.getAttribute('aria-expanded'),'true');
      const childRow = page.locator('.financial-statement-table > tbody > .statement-detail-row');
      assert.equal(await childRow.locator(':scope > td').evaluate(el => getComputedStyle(el).paddingTop),'0px');
      assert.equal(await page.getByRole('button',{name:'Back',exact:true}).count(),0);
      await page.getByRole('button',{name:'1010 - Bank',exact:true}).waitFor();
      const alignment = await page.evaluate(() => {
        const parent = document.querySelector('.statement-line');
        const child = document.querySelector('.statement-gl-row');
        return { parentRight: parent.children[1].getBoundingClientRect().right, childRight: child.children[1].getBoundingClientRect().right,
          labelFont: getComputedStyle(child.querySelector('button')).fontSize, amountFont: getComputedStyle(child.children[1]).fontSize,
          amountAlign: getComputedStyle(parent.children[1]).textAlign };
      });
      assert.ok(Math.abs(alignment.parentRight - alignment.childRight) < 1);
      assert.equal(alignment.labelFont,'13px');
      assert.equal(alignment.amountFont,'13px');
      assert.equal(alignment.amountAlign,'right');
      await page.getByRole('button',{name:'1010 - Bank',exact:true}).click();
      await page.getByRole('columnheader',{name:'Transaction heading',exact:true}).waitFor();
      await page.getByRole('cell',{name:'Owner capital contribution',exact:true}).waitFor();
      assert.equal(await page.getByText('Line description',{exact:true}).count(),0);
      assert.equal(await page.getByText('Journal description',{exact:true}).count(),0);
      await page.getByRole('button',{name:'JRN-1',exact:true}).click();
      await page.getByRole('heading',{name:'Journal JRN-1'}).waitFor();
      await page.getByRole('button',{name:'Close journal detail'}).click();
      await page.getByRole('button',{name:'JRN-1',exact:true}).waitFor();
      await page.getByRole('button',{name:'1010 - Bank',exact:true}).click();
      assert.equal(await page.getByRole('button',{name:'JRN-1',exact:true}).count(),0);
      assert.equal(await parent.getAttribute('aria-expanded'),'true');
      await page.getByRole('button',{name:'1010 - Bank',exact:true}).click();
      await page.getByRole('button',{name:'JRN-1',exact:true}).waitFor();
      await parent.click();
      assert.equal(await parent.getAttribute('aria-expanded'),'false');
      assert.equal(await page.locator('.statement-detail-row').count(),0);
    }
    const assets = page.getByRole('button',{name:'Total Assets',exact:true});
    const equity = page.getByRole('button',{name:'Equity',exact:true});
    await assets.click();
    await equity.click();
    assert.equal(await page.locator('.financial-statement-table > tbody > .statement-detail-row').count(),2);
    await assets.click();
    assert.equal(await equity.getAttribute('aria-expanded'),'true');
    assert.equal(await page.locator('.financial-statement-table > tbody > .statement-detail-row').count(),1);
    await equity.click();
    await page.evaluate(() => renderFinancialStatementResult([{financial_statement_line_id:'total',line_label:'Total Assets',line_type:'formula',amount:1000,comparative_amount:900,variance:100,variance_percent:11.11}],null,new URLSearchParams({organisation_id:'org',compare_period_from_id:'first',compare_period_to_id:'last'}),1));
    const comparative = page.locator('.statement-line > td').nth(2).getByRole('button');
    await comparative.click();
    await page.getByRole('button',{name:'1010 - Bank',exact:true}).waitFor();
    assert.equal(await page.locator('.statement-gl-row > td').nth(1).textContent(),'');
    const comparisonAlignment = await page.evaluate(() => Math.abs(document.querySelector('.statement-line').children[2].getBoundingClientRect().right - document.querySelector('.statement-gl-row').children[2].getBoundingClientRect().right));
    assert.ok(comparisonAlignment < 1);
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
});
