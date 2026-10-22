'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
let chromium;try{({chromium}=require('playwright'));}catch{}
const app=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
const block=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b,app.indexOf(a)));

test('setup and capture support alternative object types, single selection and unchanged dimensions at desktop and narrow widths',{skip:!chromium},async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.SHOWIF_BROWSER_CHANNEL?{channel:process.env.SHOWIF_BROWSER_CHANNEL}:{})});
 try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setContent('<style>body{display:block!important;overflow:auto!important;padding:16px}</style><form class="panel form" id="transaction-type-form"><div id="transaction-type-lines"></div></form><div id="capture"><div class="journal-line-classifications"></div></div>');
  await page.addStyleTag({content:fs.readFileSync(require.resolve('../public/style.css'),'utf8')});
  await page.addScriptTag({content:`
   const $=id=>document.getElementById(id);
   const classificationValueCache=new Map();
   const state={accountingObjectTypes:[{accounting_object_type_id:'property',type_name:'Property'},{accounting_object_type_id:'cost',type_name:'Cost Centre'},...Array.from({length:25},(_,i)=>({accounting_object_type_id:'type'+i,type_name:'Organisation type '+i}))],accountingDimensionTypes:[{accounting_dimension_type_id:'service',type_name:'Service'}],accounts:[{account_kind:'gl',account_id:'expense',account_code:'5600',account_name:'Purchase Expense'}],subledgerAccountTypes:[{subledger_account_type_id:'vendor',type_name:'Supplier'}]};
   function option(select,rows,key,name,placeholder){select.replaceChildren();if(placeholder)select.append(new Option(placeholder,''));for(const row of rows)select.append(new Option(name(row),row[key]));}
   async function classificationValues(kind,type){return kind==='object'?[{accounting_object_id:type+'1',object_code:type.toUpperCase(),object_name:type+' record'}]:[{accounting_dimension_id:'water',dimension_code:'WATER',dimension_name:'Water'}];}
   function pretty(value){return value;} function alert(message){throw new Error(message);}
   ${block('  async function fillClassificationSelect(','  async function fillPermittedObjectSelect(')}
   ${block('  async function fillPermittedObjectSelect(','  function journalDefinitionFor(')}
   ${block('  let activeCheckboxPopover = null;','  function renderWorkflowActionRoles(')}
   ${block('  function renderTransactionTypeLines(','  async function selectRole(')}
   ${block('  function renderJournalClassifications(','  function applyJournalDefinition(')}
   const definition={line_code:'expense',line_description:'Purchase expense',gl_account_id:'expense',debit_credit:'debit',subledger_requirement:'not_used',object_requirement:'mandatory',object_value_behaviour:'captured',object_requirements:[{accounting_object_type_id:'property',type_name:'Property'},{accounting_object_type_id:'cost',type_name:'Cost Centre'}],dimension_requirements:[{accounting_dimension_type_id:'service',type_name:'Service',requirement:'optional',value_behaviour:'captured'}]};
   addTransactionTypeLine(definition);renderJournalClassifications(document.getElementById('capture'),definition);
  `});
  for(const width of [1200,390]){
   await page.setViewportSize({width,height:1100});
   assert.equal(await page.locator('.tx-allocation-class').inputValue(),'object');
   assert.equal(await page.locator('.tx-object-requirement').inputValue(),'mandatory');
   const picker=page.locator('.tx-object-type-picker');
   await picker.locator('summary').click();
   await page.waitForFunction(()=>document.querySelector('.tx-object-type-popup').matches(':popover-open'));
   assert.equal(await page.locator('.tx-object-type-options input[value="property"]').evaluate(node=>{const r=node.getBoundingClientRect();return node===document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);}),true,'initial checkbox must not be clipped by the allocation section');
   await page.locator('.tx-object-type-search').fill('Cost');
   assert.equal(await page.locator('.tx-object-type-options label:visible').count(),1);
   const cost=page.locator('.tx-object-type-options input[value="cost"]');
   await cost.uncheck();
   assert.equal(await cost.isChecked(),false);
   await cost.check();
   assert.equal(await cost.isChecked(),true);
   assert.equal(await cost.evaluate(node=>{const r=node.getBoundingClientRect();return node===document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);}),true);
   assert.equal(await page.locator('.tx-object-type-popup').evaluate(node=>{const r=node.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}),true);
   if(process.env.ALLOCATION_SCREENSHOT_DIR)await page.screenshot({path:require('node:path').join(process.env.ALLOCATION_SCREENSHOT_DIR,`allocation-picker-${width}.png`)});
   await page.locator('.tx-object-type-search').fill('');
   assert.equal(await page.locator('.tx-object-type-options label:visible').count(),27);
   await page.locator('.tx-object-type-search').press('Escape');
   assert.equal(await picker.getAttribute('open'),null);
   const dimension=page.locator('.tx-line-dimension-requirements');
   assert.equal(await dimension.locator('select').count(),4);
   await dimension.locator('.tx-classification-behaviour').selectOption('fixed');
   await dimension.locator('.tx-classification-value').selectOption('water');
   assert.equal(await dimension.locator('.tx-classification-value').isEnabled(),true);
   await page.locator('.tx-object-behaviour').selectOption('defaulted');
   await page.locator('.tx-object-default').selectOption('cost1');
   assert.equal(await page.locator('.tx-object-default').inputValue(),'cost1');
   await page.locator('.tx-object-behaviour').selectOption('captured');
   assert.equal(await page.locator('.tx-object-default').isDisabled(),true);
   const allocation=page.locator('#capture [data-classification-kind="object"]');
   assert.equal(await allocation.count(),1);
   await allocation.selectOption('property1');
   assert.equal(await allocation.getAttribute('data-type-id'),'property');
   await allocation.selectOption('cost1');
   assert.equal(await allocation.getAttribute('data-type-id'),'cost');
   assert.equal(await page.locator('#capture [data-classification-kind="dimension"]').count(),1);
   const outside=await page.locator('.tx-allocation-fields input,.tx-allocation-fields select,.tx-object-type-picker').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).some(n=>n.getBoundingClientRect().right>innerWidth));
   assert.equal(outside,false);
   if(process.env.ALLOCATION_SCREENSHOT_DIR)await page.screenshot({path:require('node:path').join(process.env.ALLOCATION_SCREENSHOT_DIR,`allocation-${width}.png`),fullPage:true});
  }
  await page.locator('.tx-allocation-class').selectOption('subledger');
  assert.equal(await page.locator('.tx-object-allocation').isVisible(),false);
  await page.locator('.tx-line-subledger').selectOption('vendor');
  await page.locator('.tx-allocation-class').selectOption('object');
  assert.equal(await page.locator('.tx-line-subledger').inputValue(),'');
  assert.equal(await page.locator('.tx-line-subledger-requirement').inputValue(),'not_used');
  await page.evaluate(()=>{
    const first=document.querySelector('.transaction-type-line');
    first.querySelector('.tx-line-description').value='Existing expense';
    addTransactionTypeLine({...definition,line_code:'creditor',line_description:'Creditor control',line_order:20,transaction_line_definition_id:'creditor-id'});
  });
  const ordered=page.locator('.transaction-type-line');
  assert.deepEqual(await ordered.locator('.tx-line-sort').evaluateAll(nodes=>nodes.map(n=>n.value)),['10','20']);
  await ordered.nth(1).locator('.tx-line-sort').fill('5');
  await ordered.nth(1).locator('.tx-line-sort').press('Tab');
  assert.equal(await ordered.first().locator('.tx-line-description').inputValue(),'Creditor control');
  assert.equal(await ordered.first().getAttribute('data-definition-id'),'creditor-id');
  assert.equal(await ordered.last().locator('.tx-line-description').inputValue(),'Existing expense');
  await ordered.first().locator('.tx-line-sort').fill('10');
  assert.equal(await ordered.first().locator('.tx-line-sort').evaluate(n=>n.validity.valid),false);
  await ordered.first().locator('.tx-line-sort').fill('5');
  await ordered.first().locator('.tx-line-sort').press('Tab');
  await page.evaluate(()=>addTransactionTypeLine({...definition,line_code:'new_line',line_description:'New line'}));
  assert.equal(await ordered.last().locator('.tx-line-sort').inputValue(),'20');
  await page.evaluate(()=>{classificationValues=async()=>[];renderJournalClassifications(document.getElementById('capture'),definition);});
  await page.waitForFunction(()=>document.querySelector('#capture [data-classification-kind="object"] option:disabled')?.textContent==='No available records');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
