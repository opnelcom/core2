'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {catalogue,compileReport}=require('../api/_shared/erp/report-definitions');
const {reportXlsx}=require('../api/_shared/erp/report-xlsx');
const schema={type:'object',properties:{reference:{type:'short_text',title:'Supplier reference'},amount:{type:'currency',precision:12,scale:2},items:{type:'grid',title:'Items',rowSchema:{type:'object',properties:{quantity:{type:'integer'},item:{type:'text'}}}}},required:['reference']};
test('transaction report datasets expose current header and grid schemas with bound scope, filters and sorting',async()=>{
 const reads=[];
 const datasets=await catalogue({broker:async(_p,_a,q)=>{reads.push(q);return {rows:q.text.includes('FROM erp_transaction_type ')?[{type_code:'invoice',type_name:'Invoice',schema_json:schema}]:[]};}},{tenantId:'tenant'},'org');
 const dataset=datasets.find(d=>d.key==='transaction:invoice:items');
 assert.ok(dataset.fields.some(f=>f.key==='data:reference'));
 assert.ok(dataset.fields.some(f=>f.key==='row:quantity'));
 assert.ok(reads.every(q=>q.values[0]==='tenant'&&q.values[1]==='org'));
 const query=compileReport({dataset:dataset.key,columns:[{field:'journal_number'},{field:'data:reference'},{field:'row:quantity'}],filters:[{field:'data:reference',operator:'eq',value:"INV'001"}],sort:[{field:'row:quantity',direction:'desc'}]},datasets,{tenantId:'tenant',organisationId:'org',divisionIds:['division']});
 assert.match(query.text,/r.source_division_id=ANY/);assert.match(query.text,/t.type_code=/);assert.match(query.text,/jsonb_array_elements/);
 assert.ok(query.values.includes('invoice'));assert.ok(query.values.includes("INV'001"));assert.ok(!query.text.includes("INV'001"));
 assert.deepEqual(query.columns.map(c=>c.label),['Transaction number','Supplier reference','quantity']);
 assert.ok(reportXlsx(query.columns,[{c0:'J1',c1:'INV001',c2:'3'}]).length>500);
});
function definitionFixture(){
 const writes=[];let committed=false;
 const shared={...require('../api/_shared/erp/utils'),authTenant:async()=>({tenantId:'tenant'}),requireAdmin:()=>null,validateWorkflowPath:async()=>null};
 const scope={module:{exports:{}},require:name=>name==='crypto'?require('node:crypto'):name.endsWith('/context')?require('../api/_shared/context'):name.endsWith('/transaction-plan')?{createTransactionPlan:()=>({client:{query:async()=>({rows:[]})},write:q=>writes.push(q),commit:async()=>{committed=true;}})}:name.endsWith('/modules')?{moduleIds:()=>[],validateModules:async()=>null,replaceLinks:async()=>{}}:name.endsWith('/erp')?shared:require('../api/_shared/erp/'+name.split('/').at(-1))};
 vm.createContext(scope);vm.runInContext(fs.readFileSync(require.resolve('../api/transaction-types/save'),'utf8'),scope);
 const ctx={req:{method:'POST'},body:{organisation_id:'org',transaction_group_id:'group',type_code:'invoice',type_name:'Invoice',workflow_path_id:'workflow',is_financial:false,schema_json:schema},send:(status,body)=>({status,body}),broker:async()=>({rows:[{}]})};
 return {ctx,writes,api:scope.module.exports,committed:()=>committed};
}
test('type definition validates schemas before writes and persists valid definitions in its transaction plan',async()=>{
 for(const invalid of ['{','[]',{properties:{bad:{type:'currency',precision:2,scale:3}}}]){
  const f=definitionFixture();f.ctx.body.schema_json=invalid;assert.equal((await f.api(f.ctx)).status,400);assert.equal(f.writes.length,0);assert.equal(f.committed(),false);
 }
 const f=definitionFixture();const saved=await f.api(f.ctx);assert.equal(f.committed(),true);assert.deepEqual(saved.transaction_type.schema_json,schema);
 const write=f.writes.find(q=>q.text.includes('SET schema_json='));assert.deepEqual(JSON.parse(write.values[3]),schema);assert.deepEqual(Array.from(write.values.slice(0,2)),['tenant','org']);
});
let chromium;
try { ({chromium}=require('playwright')); } catch {}
test('transaction schema tabs render, validate, retain grids and lock saved transactions at desktop and narrow widths',{skip:!chromium},async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.SHOWIF_BROWSER_CHANNEL?{channel:process.env.SHOWIF_BROWSER_CHANNEL}:{})});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const app=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
  const extract=name=>{const start=app.indexOf(`  function ${name}(`);const end=app.indexOf('\n  function ',start+5);return app.slice(start,end);};
  const html=fs.readFileSync(require.resolve('../public/index.html'),'utf8');const start=html.indexOf('<form id="journal-form"');
  assert.ok(start>=0);const markup=html.slice(start,html.indexOf('</form>',start)+7).replace(/\s+hidden(?=[\s>])/,'');
  for(const width of [1100,390]){
   await page.setViewportSize({width,height:850});await page.goto('about:blank');await page.setContent(markup);
   await page.addStyleTag({content:fs.readFileSync(require.resolve('../public/style.css'),'utf8')+'\nbody{display:block!important;padding:12px!important}#journal-form{width:100%;box-sizing:border-box}'});
   await page.addScriptTag({content:fs.readFileSync(require.resolve('../public/schema-visibility'),'utf8')});
   await page.addScriptTag({content:`const $=id=>document.getElementById(id);const state={orgId:'',currencies:[],transactionTypes:[],subledgerAccountTypes:[],accountingObjectTypes:[],accountingDimensionTypes:[]};const pretty=name=>name;function syncRequiredMarkers(){};\n`+extract('showSetupTypeTab')+app.slice(app.indexOf('  function schemaFields('),app.indexOf('  function syncRecordTypeDescription('))+app.slice(app.indexOf('  function collectSchemaDetail('),app.indexOf('  function collectAccountDetail('))+extract('selectedJournalSchema')+extract('showJournalSchemaTab')+extract('renderJournalSchema')+extract('setJournalEditable')});
   await page.evaluate(()=>{
    const schema={type:'object',tabs:[{id:'details',label:'Delivery',fields:['reference']},{id:'items',label:'Items',fields:['items']}],properties:{reference:{type:'short_text',title:'Reference',uiWidth:'medium'},items:{type:'grid',rowSchema:{type:'object',properties:{item:{type:'text',title:'Item',uiWidth:'medium'}}}}},required:['reference']};
    state.transactionTypes=[{transaction_type_id:'invoice',schema_json:schema}];$('journal-type').innerHTML='<option value="invoice">Invoice</option>';renderJournalSchema({reference:'INV1',items:[{item:'Part'}]});
   });
   assert.equal(await page.locator('[data-account-detail-tab]').count(),2);
   await page.locator('[data-account-detail-tab="tab-0"]').click();
   assert.equal(await page.locator('#journal-transaction-panel').evaluate(e=>e.hidden),true);
   assert.equal(await page.locator('[data-detail-field="reference"]').inputValue(),'INV1');
   assert.equal(await page.locator('[data-account-detail-tab="tab-0"]').getAttribute('aria-selected'),'true');
   await page.locator('[data-detail-field="reference"]').fill('');
   assert.equal(await page.locator('[data-detail-field="reference"]').evaluate(e=>e.checkValidity()),false);
   await page.locator('[data-detail-field="reference"]').fill('INV2');
   const bounds=await page.locator('[data-detail-field="reference"]').boundingBox();assert.ok(bounds.width>0&&bounds.x+bounds.width<=width+1,JSON.stringify(bounds));
   await page.locator('[data-account-detail-tab="tab-1"]').click();
   assert.equal(await page.locator('.schema-grid-row').count(),1);
   const data=await page.evaluate(()=>collectSchemaDetail('journal-detail-fields',selectedJournalSchema()));assert.equal(data.reference,'INV2');assert.equal(data.items[0].item,'Part');
   await page.evaluate(()=>setJournalEditable(false));assert.equal(await page.locator('[data-detail-field="item"]').isDisabled(),true);
   await page.evaluate(()=>{showSetupTypeTab('journal','transaction');state.transactionTypes[0].schema_json={properties:{newField:{type:'text',title:'New field'}}};renderJournalSchema();});
   assert.equal(await page.locator('[data-detail-field="reference"]').count(),0);assert.equal(await page.locator('[data-detail-field="newField"]').count(),1);
   await page.evaluate(()=>{state.transactionTypes[0].schema_json={};renderJournalSchema();});assert.equal(await page.locator('[data-account-detail-tab]').count(),0);
   const schemas=require('../api/_shared/erp/transaction-schema-defaults').resolveTransactionSchemas(require('../seeds/template-defaults.json'));
   for(const [code,schema] of Object.entries(schemas)){
    const result=await page.evaluate(s=>{
     state.transactionTypes[0].schema_json=s;renderJournalSchema();
     const data=collectSchemaDetail('journal-detail-fields',s);
     const required=[...document.querySelectorAll('#journal-detail-fields [data-detail-field]')].filter(input=>input.required&&!input.closest('[data-detail-grid]')).map(input=>input.dataset.detailField);
     const layoutErrors=[];
     for(const button of document.querySelectorAll('[data-account-detail-tab]')){
      button.click();
      for(const label of document.querySelectorAll('#journal-detail-fields .detail-field:not(.check)')){
       if(label.closest('[data-detail-grid]')||!label.getClientRects().length)continue;
       const columns=getComputedStyle(label).gridTemplateColumns.split(' ');
       const control=label.querySelector('input,select,textarea');
       if(!control)continue;
       const bounds=control.getBoundingClientRect(),row=label.getBoundingClientRect();
       if(columns.length!==2||bounds.x<row.x+90||bounds.right>row.right+1||bounds.width<=0)layoutErrors.push(control.dataset.detailField);
      }
     }
     return {fields:Object.keys(data).sort(),required:required.sort(),tabs:document.querySelectorAll('[data-account-detail-tab]').length,layoutErrors};
    },schema);
    assert.deepEqual(result.fields,Object.keys(schema.properties).sort(),code);
    assert.deepEqual(result.required,[...schema.required].sort(),code);
    assert.ok(result.tabs>0,code);
    assert.deepEqual(result.layoutErrors,[],`${code} at ${width}px must keep captions left of controls`);
   }

  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
