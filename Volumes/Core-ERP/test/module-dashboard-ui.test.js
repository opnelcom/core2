'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {render}=require('../public/module-dashboard');
class Element{
  constructor(tag){this.tag=tag;this.children=[];this.events={};}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  addEventListener(name,callback){this.events[name]=callback;}
  setAttribute(name,value){this[name]=value;}
}
test('module cards and status groups use dynamic labels and route the original type and status',()=>{
  const previous=global.document;
  global.document={createElement:tag=>new Element(tag)};
  try{
    const target=new Element('div');let selected,opened;
    const status={status_code:'custom',status_label:'Custom review',count:2};
    const type={kind:'accounting_object',type_id:'type',type_name:'Work order',total:2,statuses:[status]};
    const data={total_records:2,modules:[{module_id:'module',module_name:'Custom module',total:2,types:[type]}]};
    const options={target,data,onModule:id=>{selected=id;},onOverview(){},onStatus:(t,s)=>{opened=[t,s];}};
    render(options);target.children[1].children[0].events.click();assert.equal(selected,'module');
    render({...options,moduleId:selected});const panel=target.children[2].children[0];
    assert.equal(panel.children[0].textContent,'Work order');
    assert.equal(panel.children[2].children[0].textContent,'Custom review');
    panel.children[2].events.click();assert.equal(opened[0],type);assert.equal(opened[1],status);
    render({...options,data:{modules:[],total_records:0}});assert.match(target.children[1].textContent,/No modules/);
    render({...options,moduleId:'missing'});assert.match(target.children[0].textContent,/no longer available/);
  }finally{global.document=previous;}
});

test('overview hides zero transitional counts while preserving pending tiles and direct module access',()=>{
  const previous=global.document;global.document={createElement:tag=>new Element(tag)};
  try{
    const target=new Element('div');let opened;
    const zero={module_id:'zero',module_name:'No pending work',total:0,types:[]};
    const pending={module_id:'pending',module_name:'Pending work',total:3,types:[]};
    const data={modules:[zero,pending],total_records:3};
    const options={target,data,onModule:id=>{opened=id;},onOverview(){}};
    render(options);
    const grid=target.children.find(child=>child.className==='module-dashboard-grid');
    assert.equal(grid.children.length,1);assert.equal(grid.children[0].children[0].textContent,'Pending work');
    grid.children[0].events.click();assert.equal(opened,'pending');
    render({...options,data:{modules:[zero],total_records:0}});
    assert.equal(target.children.some(child=>child.className==='module-dashboard-grid'),false);
    assert.equal(target.children.at(-1).textContent,'No records in transitional statuses.');
    render({...options,moduleId:'zero'});
    assert.equal(target.children[0].textContent,'← All modules','zero-count modules remain accessible directly');
    assert.ok(target.children.some(child=>child.textContent==='No records in transitional statuses.'));
    assert.equal(data.modules.length,2,'presentation filtering must not remove modules from the supplied data');
  }finally{global.document=previous;}
});

test('compact transaction cards format debit totals and preserve count drill-through',()=>{
  const previous=global.document;global.document={createElement:tag=>new Element(tag)};
  try{
    const target=new Element('div');let opened;
    const status={status_code:'submitted',status_label:'Submitted',count:1,debit_total:'590000.00'};
    const type={kind:'transaction',type_id:'deposit',type_name:'Owner deposit',total:1,statuses:[status]};
    render({target,data:{modules:[{module_id:'corporate',total:1,types:[type]}]},moduleId:'corporate',
      formatMoney:value=>{assert.equal(value,'590000.00');return 'R 590,000.00';},onStatus:(t,s)=>{opened=[t,s];}});
    const grid=target.children[2],panel=grid.children[0],row=panel.children[2];
    assert.equal(grid.className,'module-dashboard-type-grid');
    assert.equal(panel.children[1].textContent,'Transaction · 1 record');
    assert.equal(row.children[1].children[0].children[1].textContent,'R 590,000.00');
    assert.match(row['aria-label'],/1 record, debit total R 590,000.00/);
    row.events.click();assert.equal(opened[0],type);assert.equal(opened[1],status);
  }finally{global.document=previous;}
});

test('sub-ledger cards show DR/CR, include zeros and retain statements without transitional records',()=>{
  const previous=global.document;global.document={createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text})};
  try{
    const target=new Element('div');let opened;
    const type={type_id:'bank',type_name:'Bank account',accounts:[
      {account_id:'debit',account_code:'B1',account_name:'Cheque',balance:'125.00',restricted:false},
      {account_id:'credit',account_code:'B2',account_name:'Overdraft',balance:'-25.00',restricted:false},
      {account_id:'zero',account_code:'B3',account_name:'Reserve',balance:'0',restricted:false}
    ]};
    const zeroType={type_id:'reserve',type_name:'Reserve accounts',accounts:[{account_code:'R1',account_name:'Reserve',balance:'0.00'}]};
    const emptyType={type_id:'empty',type_name:'Empty accounts',accounts:[]};
    render({target,data:{as_of:'2026-10-21',modules:[{module_id:'treasury',total:0,types:[],subledger_types:[type,zeroType,emptyType]}]},moduleId:'treasury',formatMoney:value=>'R '+value,onAccount:(t,a)=>{opened=[t,a];}});
    const cards=target.children.at(-1);let panel=cards.children[0];
    assert.equal(cards.children.length,3);
    assert.equal(panel.children[1].textContent,'3 accounts · Organisation base currency');
    assert.match(panel.children[2]['aria-label'],/R 125.00 DR/);assert.match(panel.children[3]['aria-label'],/R 25.00 CR/);
    panel.children[2].events.click();assert.equal(opened[0],type);assert.equal(opened[1],type.accounts[0]);
    const checkbox=target.children.at(-2).children[0];checkbox.checked=false;checkbox.events.change();
    assert.equal(cards.children[0].children[1].textContent,'2 accounts · Organisation base currency');
    assert.equal(cards.children.length,1);
    checkbox.checked=true;checkbox.events.change();
    assert.equal(cards.children.length,3);
    assert.equal(cards.children[0].children[1].textContent,'3 accounts · Organisation base currency');
  }finally{global.document=previous;}
});

const app=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
for(const kind of ['transaction','subledger_account','accounting_object','accounting_dimension']){
  test(`${kind}: dashboard drill-through opens the existing list and applies the configured status filter`,async()=>{
    const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,{id,value:'old search'});return elements.get(id);};
    let route,filter,refreshed=0;
    const context={state:{orgId:'org',divisionId:'division',includeChildren:false,subledgerAccountTypes:[{subledger_account_type_id:'type',type_code:'customer'}]},
      $:get,window:{erpObjectGridViews:{setStatusFilter:(target,value)=>{filter={target,value};}}},
      openTransactionType:async id=>{route=['transaction',id];},openLedgerFamily:async code=>{route=['subledger',code];},
      openAccountingMaster:async(k,id)=>{route=[k,id];},accountingMasterConfig:k=>({prefix:'accounting-'+k}),
      renderJournals:()=>{refreshed++;},renderAccounts:()=>{refreshed++;},renderAccountingMaster:()=>{refreshed++;}};
    const start=app.indexOf('  async function openDashboardRecords('),end=app.indexOf('  function resetOrgOpenAIFields()',start);
    vm.runInNewContext(app.slice(start,end)+'\nthis.open=openDashboardRecords;',context);
    await context.open({kind,type_id:'type'},{status_code:'custom',status_label:'Custom review'});
    assert.equal(refreshed,1);assert.equal(filter.value.status_code,'custom');assert.equal(filter.value.status_label,'Custom review');
    assert.equal(filter.value.contextKey,kind==='subledger_account'?'org:customer':'org:type');
    assert.deepEqual(Array.from(route),kind==='transaction'?['transaction','type']:kind==='subledger_account'?['subledger','customer']:[kind==='accounting_object'?'object':'dimension','type']);
    for(const [id,element] of elements)if(id.endsWith('-search'))assert.equal(element.value,'');
  });
}
