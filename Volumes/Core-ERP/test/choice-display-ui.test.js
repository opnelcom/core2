"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
let chromium; try { ({chromium} = require("playwright")); } catch {}
test("schema grid choice paints one closed label across themes and retains native values", {skip:!chromium}, async () => {
  const browser = await chromium.launch({headless:true,...(process.env.SHOWIF_BROWSER_CHANNEL ? {channel:process.env.SHOWIF_BROWSER_CHANNEL}: {})});
  try {
    const page = await browser.newPage();
    const css = fs.readFileSync(path.join(__dirname,"../public/style.css"),"utf8");
    const app = fs.readFileSync(path.join(__dirname,"../public/app.js"),"utf8");
    const start = app.indexOf("  function detailChoiceDisplay("), end = app.indexOf("  function detailEnumOptions(",start);
    await page.setContent(`<style>${css}</style><div class="accounting-record-editor"><section class="schema-grid"><table><tr><td style="width:145px"><label class="detail-field"><span class="schema-reference-control"><span class="schema-reference-choice" id="choice"></span></span></label></td></tr></table></section></div>`);
    await page.addScriptTag({content:app.slice(start,end)+`;const select=document.createElement('select');select.setAttribute('aria-label','Charge component');select.append(detailChoiceOption('assessment','Assessment charge with a long description'),detailChoiceOption('rent','Rent'));document.getElementById('choice').append(detailChoiceDisplay(select));`});
    for (const theme of ["light","dark"]) for (const glass of [false,true]) {
      await page.evaluate(({theme,glass})=>{document.documentElement.dataset.theme=theme;document.body.classList.toggle('panels-glass',glass);},{theme,glass});
      for (const disabled of [false,true]) {
        const appearance=await page.locator('select').evaluate((node,disabled)=>{node.disabled=disabled;const label=node.nextElementSibling;return {color:getComputedStyle(node).color,overflow:getComputedStyle(label).textOverflow,text:label.textContent,optionColor:getComputedStyle(node.options[0]).color};},disabled);
        assert.equal(appearance.color,'rgba(0, 0, 0, 0)',`${theme}, glass=${glass}, disabled=${disabled}`);
        assert.equal(appearance.overflow,'ellipsis');assert.equal(appearance.text,'Assessment charge with a long description');
        assert.notEqual(appearance.optionColor,'rgba(0, 0, 0, 0)');
      }
    }
    await page.locator('select').evaluate(node=>{node.disabled=false;});
    await page.locator('select').selectOption('rent');
    assert.equal(await page.locator('select').inputValue(),'rent');
    assert.equal(await page.locator('.schema-choice-label').textContent(),'Rent');
    assert.equal(await page.locator('option:checked').textContent(),'rent - Rent');
  } finally { await browser.close(); }
});
