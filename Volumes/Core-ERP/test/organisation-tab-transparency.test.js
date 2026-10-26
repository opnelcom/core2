'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
let chromium;try{({chromium}=require('playwright'));}catch{}
test('organisation bar is half transparent while tabs remain opaque across themes and widths',{skip:!chromium},async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.SHOWIF_BROWSER_CHANNEL||'msedge'});
 try{
  const page=await browser.newPage();
  await page.setContent(`<style>${fs.readFileSync(require.resolve('../public/style.css'),'utf8')}</style><section class="workspace-context"><div class="organisation-tabs-row"><div class="organisation-tabs"><button class="organisation-tab" aria-selected="true">Template</button><button class="organisation-tab">Example</button><button class="organisation-more">More</button></div></div><div class="division-context-row">Active division</div></section>`);
  for(const width of [1200,390])for(const theme of ['light','dark'])for(const glass of [false,true]){
   await page.setViewportSize({width,height:700});
   await page.evaluate(({theme,glass})=>{document.documentElement.dataset.theme=theme;document.body.classList.toggle('panels-glass',glass);},{theme,glass});
   const colours=await page.evaluate(()=>{
    const colour=selector=>getComputedStyle(document.querySelector(selector)).backgroundColor;
    return {bar:colour('.organisation-tabs-row'),parent:colour('.workspace-context'),tabs:[...document.querySelectorAll('.organisation-tab,.organisation-more')].map(node=>getComputedStyle(node).backgroundColor)};
   });
   assert.match(colours.bar,/\/ 0\.5\)/);
   assert.equal(colours.parent,'rgba(0, 0, 0, 0)');
   assert.ok(colours.tabs.every(colour=>/^rgb\(/.test(colour)),JSON.stringify(colours));
   if(width>620){
    await page.locator('.organisation-tab').first().hover();
    assert.match(await page.locator('.organisation-tab').first().evaluate(node=>getComputedStyle(node).backgroundColor),/^rgb\(/);
   }
  }
 }finally{await browser.close();}
});

