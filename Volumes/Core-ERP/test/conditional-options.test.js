'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {validateSchema,validateSchemaDefinition}=require('../api/_shared/erp/utils');
const visibility=require('../public/schema-visibility');
const defaults=require('../seeds/template-defaults.json');
const asset=defaults.ledgerFamilySchemas.asset;
const available=cls=>visibility.availableOptions(asset.properties.assetSubClass,{assetClass:cls}).map(o=>o.code);
test('one Asset type retains class-specific options, numbering and examples without retired type references',()=>{
 assert.equal(defaults.ledgerFamilies.filter(row=>row[0]==='asset').length,1);
 for(const type of ['asset_ppe','asset_ip','asset_intangibles','asset_rou']){
  assert.equal(defaults.ledgerFamilySchemas[type],undefined);
  // Transaction and report codes intentionally retain their established names.
  const walk=value=>{if(typeof value==='string')assert.notEqual(value,type);else if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')for(const [key,item]of Object.entries(value)){assert.notEqual(key,type);walk(item);}};
  walk(defaults);
 }
 assert.ok(defaults.ledgerFamilySchemas.capex_project);
 assert.equal(defaults.codeNumberingTypes.subledger_account.asset.prefix,'AST-');
 assert.deepEqual(validateSchemaDefinition(asset),[]);
 const tabFields=asset.tabs.flatMap(t=>t.fields);assert.equal(new Set(tabFields).size,tabFields.length,'fields render once so hidden duplicates cannot overwrite edits');
 assert.equal(available().length,0);
 assert.deepEqual(available('investment_property'),['land','buildings','land_and_buildings']);
 assert.ok(available('ppe').includes('vehicles'));assert.ok(!available('ppe').includes('software'));
 assert.ok(available('intangibles').includes('software'));assert.ok(!available('intangibles').includes('land'));
 for(const example of defaults.exampleData.filter(e=>e.type==='asset'))assert.deepEqual(validateSchema(asset,example.data),[],example.code);
 assert.equal(visibility.evaluate(asset.properties.leaseReference.showif,{assetClass:'ppe'}),false);
 assert.equal(visibility.evaluate(asset.properties.leaseReference.showif,{assetClass:'right_of_use'}),true);
 for(const report of defaults.reportSeeds.filter(r=>r.definition_json.dataset==='subledger_account:asset')){
  assert.equal(report.definition_json.filters.find(f=>f.field==='data:assetClass').operator,'eq');
  assert.ok(report.definition_json.columns.some(c=>c.field==='data:assetSubClass'));
 }
});
test('conditional option API validation rejects unavailable values and malformed conditions, with unchanged unconditional options',()=>{
 assert.ok(validateSchema(asset,{assetClass:'ppe',assetSubClass:'software'}).some(e=>e.startsWith('assetSubClass must be one of')));
 assert.ok(validateSchema(asset,{assetClass:'',assetSubClass:'land'}).some(e=>e.startsWith('assetSubClass must be one of')));
 assert.deepEqual(validateSchema(asset,{assetClass:'ppe',assetSubClass:'land'}),[]);
 const schema={properties:{kind:{type:'select',options:['a','b']},choice:{type:'select',options:[{code:'always'},{code:'a-only',showif:{field:'kind',operator:'eq',value:'a'}}]}}};
 assert.deepEqual(validateSchema(schema,{kind:'b',choice:'always'}),[]);
 const invalid=structuredClone(schema);invalid.properties.choice.options[1].showif.field='missing';
 assert.ok(validateSchemaDefinition(invalid).some(e=>e.startsWith('choice.options[1].showif')));
 const row={type:'object',properties:{kind:{type:'text'},choice:{type:'select',options:[{code:'match',showif:{all:[{scope:'object',field:'kind',operator:'eq',value:'parent'},{field:'kind',operator:'eq',value:'row'}]}}]}}};
 const grid={properties:{kind:{type:'text'},items:{type:'grid',rowSchema:row}}};
 assert.deepEqual(validateSchemaDefinition(grid),[]);
 assert.deepEqual(validateSchema(grid,{kind:'parent',items:[{kind:'row',choice:'match'}]}),[]);
 assert.ok(validateSchema(grid,{kind:'other',items:[{kind:'row',choice:'match'}]}).length);
});
let chromium;try{({chromium}=require('playwright'));}catch{}
test('conditional selects filter, preserve and clear the common field at desktop and narrow widths',{skip:!chromium},async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.SHOWIF_BROWSER_CHANNEL?{channel:process.env.SHOWIF_BROWSER_CHANNEL}:{})});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<form id="accounting-object-form"><div class="account-editor-tabs"><button data-record-tab="general" class="active">Identification</button></div><div id="accounting-object-detail-fields"></div></form>');
  await page.addStyleTag({content:fs.readFileSync(require.resolve('../public/style.css'),'utf8')});
  await page.addScriptTag({content:fs.readFileSync(require.resolve('../public/schema-visibility'),'utf8')});
  const app=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
  await page.addScriptTag({content:'const $=id=>document.getElementById(id);const pretty=name=>name;function syncRequiredMarkers(){}\n'+app.slice(app.indexOf('  function schemaFields('),app.indexOf('  function syncRecordTypeDescription('))+app.slice(app.indexOf('  function collectSchemaDetail('),app.indexOf('  function collectAccountDetail('))});
  // Use actual Asset controls without reference loading unrelated to classification.
  const schema=structuredClone(asset);for(const [key,field]of Object.entries(schema.properties))if(field.type==='reference')field.type='text';
  for(const width of [1100,390]){
   await page.setViewportSize({width,height:900});
   await page.evaluate(s=>renderSchemaDetailFields('accounting-object-detail-fields',s,{assetClass:'ppe',assetSubClass:'land'}),schema);
   const cls=page.locator('[data-detail-field="assetClass"]'),sub=page.locator('[data-detail-field="assetSubClass"]');
   assert.equal(await sub.inputValue(),'land');
   await cls.selectOption('investment_property',{force:true});assert.equal(await sub.inputValue(),'land');
   await cls.selectOption('intangibles',{force:true});assert.equal(await sub.inputValue(),'');
   assert.ok(!(await sub.locator('option').evaluateAll(options=>options.map(o=>o.value))).includes('land'));
   await sub.selectOption('software',{force:true});
   assert.equal((await page.evaluate(s=>collectSchemaDetail('accounting-object-detail-fields',s),schema)).assetSubClass,'software');
   assert.equal(await page.locator('[data-detail-field="leaseReference"]').evaluate(el=>el.closest('label').hidden),true);
   await cls.selectOption('right_of_use',{force:true});assert.equal(await sub.inputValue(),'');
   assert.equal(await page.locator('[data-detail-field="leaseReference"]').evaluate(el=>el.closest('label').hidden),false);
   await cls.selectOption('ppe',{force:true});
   assert.equal(await page.locator('[data-detail-field="leaseReference"]').evaluate(el=>el.closest('label').hidden),true);
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
