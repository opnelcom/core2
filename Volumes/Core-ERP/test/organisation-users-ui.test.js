'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let chromium;try{({chromium}=require('playwright'));}catch{}
test('user editor keeps left captions, saves dated assignments and never offers user deletion',{skip:!chromium},async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.SHOWIF_BROWSER_CHANNEL?{channel:process.env.SHOWIF_BROWSER_CHANNEL}:{})});
  try{
    const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
    const start=html.indexOf('        <section id="view-users"'),end=html.indexOf('        <section id="view-schemauitester"',start);
    const section=html.slice(start,end).replace('data-organisation-setup="true" hidden','data-organisation-setup="true"');
    await page.setContent(`<style>${fs.readFileSync(path.join(__dirname,'../public/style.css'),'utf8')}body{display:block;overflow:auto;padding:20px}#erp-user-form{position:relative;inset:auto;width:100%;max-width:800px}</style>${section}`);
    await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../public/organisation-users.js'),'utf8')});
    await page.evaluate(()=>{
      window.saved=[];window.refreshes=0;
      window.userState={orgId:'org',organisationUsers:[],roleUsers:[],userDivisions:[],roles:[{role_id:'role',role_name:'Clerk',is_active:true}],divisions:[{division_id:'north',division_code:'N',division_name:'North'},{division_id:'south',division_code:'S',division_name:'South'}]};
      window.editor=window.erpOrganisationUsers.create({state:window.userState,api:async(route,options)=>{window.saved.push({route,body:JSON.parse(options.body)});},table:()=>{},dateOnly:value=>value||'',refresh:async()=>{window.refreshes++;},onError:message=>{throw new Error(message);}});
    });
    await page.locator('#add-erp-user').click();
    for(const width of [1100,390]){
      await page.setViewportSize({width,height:1000});
      const geometry=await page.locator('#erp-user-tab-identification label:not(.check)').evaluateAll(rows=>rows.map(row=>{const label=row.querySelector('span').getBoundingClientRect(),control=row.querySelector('input,textarea').getBoundingClientRect();return {left:label.right<=control.left,inside:control.right<=row.getBoundingClientRect().right+1};}));
      assert.ok(geometry.every(row=>row.left&&row.inside),JSON.stringify({width,geometry}));
    }
    assert.equal(await page.locator('#erp-user-form [data-setup-delete]').count(),0);
    await page.locator('#erp-user-email').fill('person@example.test');await page.locator('#erp-user-known_name').fill('Person');
    await page.locator('[data-user-tab=roles]').click();await page.locator('#erp-user-add-role').click();
    await page.locator('#erp-user-roles-rows select').selectOption('role');await page.locator('#erp-user-roles-rows [data-date=valid_from]').fill('2026-01-01');
    await page.locator('[data-user-tab=divisions]').click();await page.locator('#erp-user-add-division').click();
    await page.locator('#erp-user-divisions-rows select').selectOption('north');await page.locator('#erp-user-add-division').click();
    await page.locator('#erp-user-divisions-rows select').nth(1).selectOption('south');
    await page.locator('#erp-user-form [type=submit]').click();
    assert.deepEqual(await page.evaluate(()=>window.saved[0]),{route:'users/save',body:{organisation_id:'org',user_id:null,is_enabled:true,email:'person@example.test',known_name:'Person',full_name:'',title:'',description:'',valid_from:'',valid_to:'',roles:[{role_id:'role',valid_from:'2026-01-01',valid_to:''}],divisions:[{division_id:'north',valid_from:'',valid_to:''},{division_id:'south',valid_from:'',valid_to:''}]}});
    assert.equal(await page.evaluate(()=>window.refreshes),1);assert.equal(await page.locator('#erp-user-form').isVisible(),false);assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
test('role dropdown lists active users and preserves only its own inactive selection',{skip:!chromium},async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.SHOWIF_BROWSER_CHANNEL?{channel:process.env.SHOWIF_BROWSER_CHANNEL}:{})});
  try{
    const page=await browser.newPage();await page.setContent('<select id="users"></select>');await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../public/organisation-users.js'),'utf8')});
    await page.evaluate(()=>{window.accounts=[{email:'active@example.test',known_name:'Active',is_current:true},{email:'old@example.test',known_name:'Old',is_current:false},{email:'other@example.test',known_name:'Other',is_current:false}];window.erpOrganisationUsers.fillUserSelect(document.querySelector('select'),window.accounts);});
    assert.equal(await page.locator('option').count(),2);await page.locator('select').selectOption({label:'Active — active@example.test'});assert.equal(await page.locator('select').inputValue(),'active@example.test');
    await page.evaluate(()=>window.erpOrganisationUsers.fillUserSelect(document.querySelector('select'),window.accounts,'OLD@example.test'));
    assert.equal(await page.locator('select').inputValue(),'old@example.test');assert.equal(await page.locator('option').count(),3);assert.match(await page.locator('option:checked').textContent(),/inactive/);
  }finally{await browser.close();}
});
test('division picker exposes assigned subregions when their parent is not assigned',{skip:!chromium},async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.SHOWIF_BROWSER_CHANNEL?{channel:process.env.SHOWIF_BROWSER_CHANNEL}:{})});
  try{
    const page=await browser.newPage();await page.setContent('<div id="division-tree"></div>');
    const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'),start=app.indexOf('  function renderDivisionTree('),end=app.indexOf('\n  function ',start+1);
    await page.addScriptTag({content:`const state={divisionId:'north',divisions:[{division_id:'north',parent_division_id:'root',division_name:'North',division_code:'N'},{division_id:'east',parent_division_id:'root',division_name:'East',division_code:'E'}]};const $=id=>document.getElementById(id),collapsedDivisionIds=new Set(),divisionPath=()=>'',selectWorkspaceDivision=async()=>{};${app.slice(start,end)};renderDivisionTree();`});
    assert.equal(await page.locator('.division-tree-item').count(),2);
    assert.equal(await page.getByRole('button',{name:'North (N)',exact:true}).count(),1);
    assert.equal(await page.getByRole('button',{name:'East (E)',exact:true}).count(),1);
    assert.equal(await page.locator('[aria-level="1"]').count(),2);
  }finally{await browser.close();}
});
