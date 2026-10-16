const fs = require('node:fs');
const assert = require('node:assert/strict');
const {chromium} = require('C:/Users/JoeO/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
 const browser = await chromium.launch({headless:true,channel:"chrome"});
 const page = await browser.newPage();
 const source = fs.readFileSync('public/app.js','utf8');
 const helper = source.slice(source.indexOf('  function installRecordTabOverflow()'),source.indexOf('  function showAccountFixedTab(id)'));
 const names = ['Identification','Type details','Contact','Credit','Contacts','Addresses','Commercial terms','Resources','Documents','Versions'];
 await page.setContent(`<style>:root{--panel:white;--ink:#223;--line:#ccc;--brand:#246;--close-hover:#eee} body{font:13px Arial} form{width:780px} button{padding:10px;border:1px solid #ddd} [hidden]{display:none!important}</style><style>${fs.readFileSync('public/style.css','utf8')}</style>` + ['account','accounting-object','accounting-dimension'].map(prefix => `<form id="${prefix}-form" class="accounting-record-editor"><div class="account-fixed-tabs account-editor-tabs">${names.map((name,i)=>`<button type="button" class="account-detail-tab ${i===0?'active':''}">${name}</button>`).join('')}</div></form>`).join(''));
 await page.addScriptTag({content: `const $=id=>document.getElementById(id); ${helper}; document.querySelectorAll('.account-editor-tabs').forEach(bar=>bar.addEventListener('click',event=>{bar.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===event.target));})); installRecordTabOverflow();`});
 await page.waitForTimeout(250);
 for (const prefix of ['account','accounting-object','accounting-dimension']) {
  const form=page.locator('#'+prefix+'-form');
  console.log(prefix,await form.evaluate(f=>({width:f.clientWidth,html:f.innerHTML,rect:f.getBoundingClientRect().toJSON()}))); assert(await form.locator('[data-tab-overflow]').count()>0);
  await form.locator('.record-tabs-more').click();
  const item=form.locator('.record-tabs-menu button').last();
  const text=await item.textContent();
  await item.click(); await page.waitForTimeout(250);
  assert.equal(await form.locator('.account-editor-tabs .active').textContent(),text);
  assert.equal(await form.locator('.account-editor-tabs .active').getAttribute('data-tab-overflow'),null);
 }
 await page.evaluate(()=>document.querySelectorAll('form').forEach(f=>f.style.width='300px'));
 await page.waitForTimeout(250);
 assert(await page.locator('#account-form [data-tab-overflow]').count()>5);
 await page.locator('#account-form .record-tabs-more').focus();
 await page.keyboard.press('ArrowDown');
 assert.equal(await page.locator('#account-form .record-tabs-menu').isVisible(),true);
 await page.keyboard.press('ArrowDown'); await page.keyboard.press('Escape');
 assert.equal(await page.locator('#account-form .record-tabs-menu').isVisible(),false);
 await page.evaluate(()=>{const b=document.querySelector('#account-form .account-editor-tabs');const tab=document.createElement('button');tab.textContent='Dynamic tab';b.append(tab)});
 await page.waitForTimeout(250);
 assert.equal(await page.locator('#account-form .record-tabs-menu button').last().textContent(),'Dynamic tab');
 await page.evaluate(()=>document.querySelectorAll('form').forEach(f=>f.style.width='1600px'));
 await page.waitForTimeout(250);
 assert.equal(await page.locator('#account-form .record-tabs-more').isVisible(),false);
 console.log('Browser fixture passed: three classes, desktop/narrow widths, selected tab promotion, keyboard, dynamic tabs, resize without overflow.');
 await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});



