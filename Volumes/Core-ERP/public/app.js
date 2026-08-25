(()=>{
const $=id=>document.getElementById(id);
let boot={organisations:[],currencies:[],countries:[],ledger_families:[]};
let state={orgId:null,currencies:[],countries:[],divisions:[],accounts:[],accountTypes:[],ledgerFamilies:[],ledgerTypes:[],masterTypes:[],masterRecords:[],legalEntities:[],legalEntityDetail:null,journals:[],years:[],periods:[],transactionGroups:[],transactionTypes:[],postingRules:[],roles:[],rolePermissions:[],roleUsers:[],dashboardSummary:null};
let selectedMasterRecord=null;
let selectedJournal=null;
let selectedLegalEntity=null;
let selectedLedgerFamilyCode='gl';
let selectedTransactionTypeId='';
let selectedReport='income';
let expandedFiscalYears=new Set();
let expandedLedgerFamilies=new Set();
let expandedTransactionGroups=new Set();
let loadedAccountFamilies=new Set();
let loadedSlices={menu:false,dashboard:false,divisions:false,fiscal:false,countries:false,currencies:false,ledgerTypes:false,masterTypes:false,legalEntities:false,transactions:false,permissions:false};
const today=()=>new Date().toISOString().slice(0,10);
const pretty=v=>String(v||'').replaceAll('_',' ');
const setupViews=new Set(['organisations','divisions','fiscal','countries','currencies','ledgerfamilies','transactiongroups','transactiontypes','permissions']);
const masterWorkflowOptions=['view','*','draft','submitted','approved','rejected','blocked','archived','deleted'];
const transactionWorkflowOptions=['view','*','draft','submitted','approved','rejected','blocked','reversed','deleted'];
const legalEntityRequiredFamilies=new Set(['customer','vendor','contract','loan']);
function orgStorageKey(){
  return boot.tenant_id?`erp.currentOrg.${boot.tenant_id}`:'erp.currentOrg';
}
function getStoredOrgId(){
  try{return window.localStorage.getItem(orgStorageKey())||'';}catch{return '';}
}
function storeCurrentOrg(orgId=state.orgId){
  if(!orgId)return;
  try{window.localStorage.setItem(orgStorageKey(),orgId);}catch{}
}
function resolveCurrentOrgId(){
  const exists=id=>boot.organisations.some(org=>org.organisation_id===id);
  if(exists(state.orgId))return state.orgId;
  const stored=getStoredOrgId();
  if(exists(stored))return stored;
  return boot.organisations[0]?.organisation_id||null;
}
function dateOnly(value){
  return String(value||'').slice(0,10);
}
function searchTerm(id){
  return String($(id)?.value||'').trim().toLowerCase();
}
function rowMatches(row,term){
  if(!term)return true;
  return Object.values(row||{}).some(value=>{
    if(value===null||value===undefined||typeof value==='object')return false;
    return String(value).toLowerCase().includes(term);
  });
}
async function api(path,options={}){
  const r=await fetch('/erp/api/'+path,{headers:{'content-type':'application/json'},...options});
  const j=await r.json();
  if(!r.ok)throw Object.assign(new Error(j.error||'Request failed'),{details:j});
  return j;
}
function alert(message){
  $('alert').hidden=!message;
  $('alert').textContent=message||'';
}
function option(select,items,valueKey,labelKey,blank=''){
  if(!select)return;
  select.innerHTML=blank?`<option value="">${blank}</option>`:'';
  items.forEach(item=>{
    const o=document.createElement('option');
    o.value=item[valueKey];
    o.textContent=typeof labelKey==='function'?labelKey(item):item[labelKey];
    select.append(o);
  });
}
function prependOption(select,value,label){
  const o=document.createElement('option');
  o.value=value;
  o.textContent=label;
  select.insertBefore(o,select.firstChild);
}
function table(target,columns,rows,onClick){
  if(!rows.length){target.innerHTML='<p class="empty">No records yet.</p>';return;}
  const el=document.createElement('table');
  el.innerHTML=`<thead><tr>${columns.map(c=>`<th>${c[0]}</th>`).join('')}</tr></thead>`;
  const body=document.createElement('tbody');
  rows.forEach(row=>{
    const tr=document.createElement('tr');
    tr.tabIndex=0;
    tr.className='click-row';
    columns.forEach(([,fn])=>{
      const td=document.createElement('td');
      td.textContent=fn(row)??'';
      tr.append(td);
    });
    if(onClick)tr.addEventListener('click',()=>onClick(row));
    body.append(tr);
  });
  el.append(body);
  target.innerHTML='';
  target.append(el);
}
function currentOrg(){return boot.organisations.find(o=>o.organisation_id===state.orgId)||boot.organisations[0];}
function setSetupExpanded(expanded){
  $('setup-subnav').hidden=!expanded;
  $('setup-toggle').setAttribute('aria-expanded',expanded?'true':'false');
  $('setup-toggle').classList.toggle('active',expanded&&setupViews.has(document.querySelector('.view:not([hidden])')?.id?.replace('view-','')));
}
function setMenuExpanded(toggleId,subnavId,expanded){
  $(subnavId).hidden=!expanded;
  $(toggleId).setAttribute('aria-expanded',expanded?'true':'false');
}
function show(view){
  document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!==`view-${view}`);
  document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  setSetupExpanded(setupViews.has(view));
  $('reports-toggle')?.classList.toggle('active',view==='reports');
  $('page-title').textContent=document.querySelector(`[data-view="${view}"]`)?.textContent||$('page-title').textContent;
}
async function openView(view){
  if(view==='dashboard'){
    show(view);
    renderDashboard();
    loadDashboardData().catch(e=>alert(e.message));
    return;
  }
  await ensureViewData(view);
  show(view);
}
function labelForFamily(code){
  const family=state.ledgerFamilies.find(row=>row.ledger_family_code===code);
  return family?.family_name||pretty(code);
}
function labelForTransactionType(id){
  const type=state.transactionTypes.find(row=>row.transaction_type_id===id);
  return type?.type_name||'Transactions';
}
function buildDynamicMenu(){
  const families=state.ledgerFamilies.filter(f=>f.is_active!==false);
  $('master-subnav').innerHTML=families.map(f=>`<button type="button" class="nav subnav-item" data-ledger-family="${f.ledger_family_code}">${f.family_name}</button>`).join('');
  $('master-subnav').querySelectorAll('[data-ledger-family]').forEach(button=>{
    button.addEventListener('click',()=>openLedgerFamily(button.dataset.ledgerFamily).catch(e=>alert(e.message)));
  });
  $('transaction-subnav').innerHTML=state.transactionGroups.filter(g=>g.is_active!==false).map(group=>{
    const types=state.transactionTypes.filter(type=>type.transaction_group_id===group.transaction_group_id&&type.is_active!==false);
    const expanded=expandedTransactionGroups.has(group.transaction_group_id);
    return `<div class="menu-group"><button type="button" class="nav subnav-item menu-group-toggle" aria-expanded="${expanded?'true':'false'}" data-transaction-group="${group.transaction_group_id}">${group.group_name}</button><div class="transaction-type-group" ${expanded?'':'hidden'}>${types.map(type=>`<button type="button" class="nav subnav-item subnav-depth" data-transaction-type="${type.transaction_type_id}">${type.type_name}</button>`).join('')}</div></div>`;
  }).join('');
  $('transaction-subnav').querySelectorAll('[data-transaction-group]').forEach(button=>{
    button.addEventListener('click',()=>{
      const groupId=button.dataset.transactionGroup;
      if(expandedTransactionGroups.has(groupId))expandedTransactionGroups.delete(groupId);
      else expandedTransactionGroups.add(groupId);
      buildDynamicMenu();
    });
  });
  $('transaction-subnav').querySelectorAll('[data-transaction-type]').forEach(button=>{
    button.addEventListener('click',()=>openTransactionType(button.dataset.transactionType).catch(e=>alert(e.message)));
  });
  highlightDynamicMenu();
}
function highlightDynamicMenu(){
  document.querySelectorAll('[data-ledger-family]').forEach(button=>button.classList.toggle('active',button.dataset.ledgerFamily===selectedLedgerFamilyCode&&!$('view-accounts').hidden));
  document.querySelectorAll('[data-transaction-type]').forEach(button=>button.classList.toggle('active',button.dataset.transactionType===selectedTransactionTypeId&&!$('view-journals').hidden));
  document.querySelectorAll('[data-report-view]').forEach(button=>button.classList.toggle('active',button.dataset.reportView===selectedReport&&!$('view-reports').hidden));
  $('master-toggle').classList.toggle('active',!$('view-accounts').hidden);
  $('transaction-toggle').classList.toggle('active',!$('view-journals').hidden);
  $('reports-toggle')?.classList.toggle('active',!$('view-reports').hidden);
}
async function openLedgerFamily(familyCode){
  await Promise.all([loadMenuData(),ensureDivisions(),ensureLedgerTypes(),ensureLegalEntities()]);
  selectedLedgerFamilyCode=familyCode;
  selectedTransactionTypeId='';
  $('account-form-family').value=familyCode;
  $('account-form').hidden=true;
  show('accounts');
  setMenuExpanded('master-toggle','master-subnav',true);
  setMenuExpanded('transaction-toggle','transaction-subnav',false);
  $('page-title').textContent=labelForFamily(familyCode);
  $('account-grid-title').textContent=labelForFamily(familyCode);
  await loadAccountsForFamily(familyCode);
  renderAccounts();
  highlightDynamicMenu();
}
async function openTransactionType(typeId){
  await Promise.all([loadMenuData(),ensureDivisions(),ensureFiscal()]);
  selectedTransactionTypeId=typeId;
  selectedLedgerFamilyCode='';
  const type=state.transactionTypes.find(row=>row.transaction_type_id===typeId);
  if(type?.transaction_group_id)expandedTransactionGroups.add(type.transaction_group_id);
  $('journal-form').hidden=true;
  show('journals');
  setMenuExpanded('transaction-toggle','transaction-subnav',true);
  setMenuExpanded('master-toggle','master-subnav',false);
  $('page-title').textContent=labelForTransactionType(typeId);
  $('journal-grid-title').textContent=labelForTransactionType(typeId);
  await Promise.all([loadJournalsForTransactionType(typeId),loadAllAccounts()]);
  renderJournals();
  fillAccountSelects();
  highlightDynamicMenu();
}
async function openReport(report){
  await ensureViewData('reports');
  selectedReport=report;
  selectedLedgerFamilyCode='';
  selectedTransactionTypeId='';
  show('reports');
  setMenuExpanded('reports-toggle','reports-subnav',true);
  setMenuExpanded('master-toggle','master-subnav',false);
  setMenuExpanded('transaction-toggle','transaction-subnav',false);
  const titles={income:'Income Statement',balance:'Balance Sheet',ledger:'Ledger Balances'};
  $('page-title').textContent=titles[report]||'Reports';
  $('report-title').textContent=titles[report]||'Reports';
  $('report-division-label').hidden=report!=='ledger';
  renderReport().catch(e=>alert(e.message));
  highlightDynamicMenu();
}
function fillSelects(){
  const currencies=state.currencies.length?state.currencies:boot.currencies;
  const families=state.ledgerFamilies;
  option($('organisation-select'),boot.organisations,'organisation_id',o=>`${o.organisation_code} - ${o.organisation_name}`);
  $('organisation-select').value=state.orgId||'';
  const template=boot.organisations.find(o=>o.is_template);
  option($('org-copy-source'),boot.organisations,'organisation_id',o=>`${o.organisation_code} - ${o.organisation_name}`,'Select source organisation');
  option($('org-copy-target'),boot.organisations,'organisation_id',o=>`${o.organisation_code} - ${o.organisation_name}`,'Select target organisation');
  if(template)$('org-copy-source').value=template.organisation_id;
  $('org-copy-target').value=state.orgId||'';
  option($('org-delete-target'),boot.organisations,'organisation_id',o=>`${o.organisation_code} - ${o.organisation_name}`,'Select organisation');
  $('org-delete-target').value=state.orgId||'';
  option($('transaction-type-group'),state.transactionGroups,'transaction_group_id',g=>`${g.group_code} - ${g.group_name}`,'Select group');
  option($('report-year'),state.years,'fiscal_year_id',y=>y.fiscal_year_code,'Select fiscal year');
  if(!$('report-year').value&&state.years[0])$('report-year').value=state.years[0].fiscal_year_id;
  [$('org-currency')].forEach(s=>option(s,currencies,'currency_code',c=>`${c.currency_code} - ${c.currency_name}`));
  [$('account-form-family'),$('master-family'),$('account-subledger-family'),$('ledger-type-family')].forEach(s=>option(s,families.filter(f=>f.is_active!==false),'ledger_family_code',f=>`${f.ledger_family_code} - ${f.family_name}`,s?.id==='account-subledger-family'?'None':''));
  if(!$('account-form-family').value||$('account-form-family').value==='bank')$('account-form-family').value='gl';
}
function fillDivisionSelects(){
  const label=d=>`${'  '.repeat(Number(d.depth)||0)}${d.division_code} - ${d.division_name}`;
  [$('division-parent'),$('account-division'),$('master-division'),$('journal-division')].forEach(s=>option(s,state.divisions,'division_id',label,s.id==='division-parent'?'Root division':''));
  option($('report-division'),state.divisions,'division_id',label,'All divisions');
  document.querySelectorAll('.permission-division').forEach(s=>option(s,state.divisions,'division_id',label,'Select division'));
}
function fillAccountSelects(){
  const gl=state.accounts.filter(a=>a.ledger_family_code==='gl');
  option($('master-ledger-account'),state.accounts.filter(a=>a.ledger_family_code!=='gl'),'ledger_account_id',a=>`${a.account_code} - ${a.account_name}`,'None');
  document.querySelectorAll('.line-gl').forEach(s=>option(s,gl,'ledger_account_id',a=>`${a.account_code} - ${a.account_name}`));
  document.querySelectorAll('.line-sub').forEach(s=>option(s,state.accounts.filter(a=>a.ledger_family_code!=='gl'),'ledger_account_id',a=>`${a.ledger_family_code}: ${a.account_code} - ${a.account_name}`,'None'));
}
function fillLegalEntitySelects(){
  option($('account-legal-entity'),state.legalEntities,'legal_entity_id',e=>`${e.known_name} - ${e.legal_name}`,'None');
  document.querySelectorAll('.relationship-entity').forEach(select=>option(select,state.legalEntities.filter(e=>e.legal_entity_id!==selectedLegalEntity),'legal_entity_id',e=>`${e.known_name} - ${e.legal_name}`,'Select legal entity'));
}
function showLegalEntityTab(tab){
  document.querySelectorAll('[data-legal-entity-tab]').forEach(button=>button.classList.toggle('active',button.dataset.legalEntityTab===tab));
  document.querySelectorAll('[data-legal-entity-panel]').forEach(panel=>{panel.hidden=panel.dataset.legalEntityPanel!==tab;});
}
function setupLegalEntityTabs(){
  const form=$('legal-entity-form');
  if(!form||form.dataset.tabsReady)return;
  const moveTo=(panel,ids)=>{
    ids.forEach(id=>{
      const el=$(id);
      const wrapper=el?.closest('label')||el;
      if(wrapper)panel.append(wrapper);
    });
  };
  const makePanel=(id,label)=>{
    const panel=document.createElement('div');
    panel.id=`legal-entity-tab-${id}`;
    panel.className=`legal-entity-tab-panel full${id==='details'?' legal-entity-details-grid':''}`;
    panel.dataset.legalEntityPanel=id;
    panel.hidden=id!=='details';
    return panel;
  };
  const tabs=document.createElement('div');
  tabs.className='tabs legal-entity-tabs full';
  tabs.setAttribute('role','tablist');
  [
    ['details','Details'],
    ['identifications','Identification Numbers'],
    ['addresses','Addresses'],
    ['relationships','Relationships'],
    ['additional','Additional Data'],
    ['accounts','Linked Accounts']
  ].forEach(([id,label],index)=>{
    const button=document.createElement('button');
    button.type='button';
    button.className=`tab${index?'':' active'}`;
    button.dataset.legalEntityTab=id;
    button.textContent=label;
    button.addEventListener('click',()=>showLegalEntityTab(id));
    tabs.append(button);
  });
  const details=makePanel('details');
  moveTo(details,['legal-entity-type','legal-entity-legal-name','legal-entity-known-name','legal-entity-status','legal-entity-effective-from','legal-entity-effective-to']);
  const identifications=makePanel('identifications');
  identifications.append($('legal-entity-identifications').closest('section'));
  const addresses=makePanel('addresses');
  addresses.append($('legal-entity-addresses').closest('section'));
  const relationships=makePanel('relationships');
  relationships.append($('legal-entity-relationships').closest('section'));
  const additional=makePanel('additional');
  additional.append($('legal-entity-additional').closest('label'));
  const accounts=makePanel('accounts');
  accounts.append($('legal-entity-account-list').closest('.linked-accounts'));
  const heading=form.querySelector('h2');
  heading.insertAdjacentElement('afterend',tabs);
  let anchor=tabs;
  [details,identifications,addresses,relationships,additional,accounts].forEach(panel=>{
    anchor.insertAdjacentElement('afterend',panel);
    anchor=panel;
  });
  form.dataset.tabsReady='true';
}
function fillAccountTypes(){
  const family=$('account-form-family').value||'gl';
  option($('account-type'),state.accountTypes.filter(t=>t.ledger_family_code===family),'account_type_id',t=>`${t.account_type_code} - ${t.account_type_name}`,family==='gl'?'Select type':'None');
}
function selectedAccountFamilySchema(){
  const family=$('account-form-family').value||selectedLedgerFamilyCode||'gl';
  return state.ledgerFamilies.find(row=>row.ledger_family_code===family)?.schema_json||{};
}
function schemaFields(schema){
  const properties=schema&&typeof schema==='object'&&!Array.isArray(schema)?schema.properties||{}:{};
  return Object.entries(properties).filter(([,field])=>field&&typeof field==='object'&&!Array.isArray(field));
}
function schemaTabs(schema,fields){
  const fieldNames=fields.map(([name])=>name);
  const assigned=new Set();
  const tabs=Array.isArray(schema?.tabs)?schema.tabs:[];
  const result=tabs.map((tab,index)=>{
    const names=(Array.isArray(tab?.fields)?tab.fields:[]).filter(name=>fieldNames.includes(name));
    names.forEach(name=>assigned.add(name));
    return {id:`tab-${index}`,label:tab.label||tab.title||tab.name||`Tab ${index+1}`,fields:names};
  }).filter(tab=>tab.fields.length);
  const remaining=fieldNames.filter(name=>!assigned.has(name));
  if(remaining.length||!result.length)result.push({id:'details',label:'Details',fields:remaining.length?remaining:fieldNames});
  return result;
}
function valueForDetailField(detail,schema,name){
  if(detail&&Object.prototype.hasOwnProperty.call(detail,name))return detail[name];
  if(Object.prototype.hasOwnProperty.call(schema,'default'))return schema.default;
  return schema.type==='boolean'?false:'';
}
function detailInputType(field){
  if(field.format==='date')return 'date';
  if(field.format==='date-time')return 'datetime-local';
  if(field.type==='number'||field.type==='integer')return 'number';
  return 'text';
}
function renderDetailInput(name,field,value,required){
  const label=document.createElement('label');
  label.textContent=field.title||pretty(name);
  if(field.description)label.title=field.description;
  if(Array.isArray(field.enum)){
    const select=document.createElement('select');
    select.dataset.detailField=name;
    if(!required){
      const blank=document.createElement('option');
      blank.value='';
      blank.textContent='None';
      select.append(blank);
    }
    field.enum.forEach(item=>{
      const option=document.createElement('option');
      option.value=String(item);
      option.textContent=field.enumNames?.[field.enum.indexOf(item)]||String(item);
      select.append(option);
    });
    select.value=value??'';
    label.append(select);
    return label;
  }
  if(field.type==='boolean'){
    label.className='check';
    const input=document.createElement('input');
    input.type='checkbox';
    input.dataset.detailField=name;
    input.checked=!!value;
    label.prepend(input);
    return label;
  }
  const input=(field.type==='object'||field.type==='array'||field.format==='textarea')?document.createElement('textarea'):document.createElement('input');
  input.dataset.detailField=name;
  if(input.tagName==='INPUT')input.type=detailInputType(field);
  if(field.type==='integer')input.step='1';
  input.value=(field.type==='object'||field.type==='array')?JSON.stringify(value??(field.type==='array'?[]:{}),null,2):(value??'');
  label.append(input);
  return label;
}
function showAccountDetailTab(container,id){
  container.querySelectorAll('[data-account-detail-tab]').forEach(button=>button.classList.toggle('active',button.dataset.accountDetailTab===id));
  container.querySelectorAll('[data-account-detail-panel]').forEach(panel=>{panel.hidden=panel.dataset.accountDetailPanel!==id;});
}
function renderAccountDetailFields(detail={}){
  const container=$('account-detail-fields');
  if(!container)return;
  const schema=selectedAccountFamilySchema();
  const fields=schemaFields(schema);
  container.innerHTML='';
  if(!fields.length){
    const label=document.createElement('label');
    label.className='full';
    label.textContent='Additional data JSON';
    const textarea=document.createElement('textarea');
    textarea.dataset.detailRaw='true';
    textarea.value=JSON.stringify(detail||{},null,2);
    label.append(textarea);
    container.append(label);
    return;
  }
  const required=new Set(Array.isArray(schema.required)?schema.required:[]);
  const tabs=schemaTabs(schema,fields);
  const detailLayout=document.createElement('div');
  detailLayout.className='account-detail-layout';
  const fieldPane=document.createElement('div');
  fieldPane.className='account-detail-fields';
  const tabBar=document.createElement('div');
  tabBar.className='account-detail-tabs';
  tabBar.setAttribute('role','tablist');
  if(tabs.length>1){
    tabs.forEach((tab,index)=>{
      const button=document.createElement('button');
      button.type='button';
      button.className=`account-detail-tab${index?'':' active'}`;
      button.dataset.accountDetailTab=tab.id;
      button.textContent=tab.label;
      button.addEventListener('click',()=>showAccountDetailTab(container,tab.id));
      tabBar.append(button);
    });
  }
  const byName=Object.fromEntries(fields);
  tabs.forEach((tab,index)=>{
    const panel=document.createElement('div');
    panel.className='account-detail-panel';
    panel.dataset.accountDetailPanel=tab.id;
    panel.hidden=index>0;
    tab.fields.forEach(name=>panel.append(renderDetailInput(name,byName[name],valueForDetailField(detail,byName[name],name),required.has(name))));
    fieldPane.append(panel);
  });
  if(tabs.length>1)detailLayout.append(tabBar);
  detailLayout.append(fieldPane);
  container.append(detailLayout);
}
function collectAccountDetail(){
  const container=$('account-detail-fields');
  const raw=container?.querySelector('[data-detail-raw]');
  if(raw){
    try{return JSON.parse(raw.value||'{}');}
    catch{throw new Error('Additional data JSON must be valid JSON');}
  }
  const schema=selectedAccountFamilySchema();
  const properties=schema?.properties||{};
  const detail={};
  container?.querySelectorAll('[data-detail-field]').forEach(input=>{
    const name=input.dataset.detailField;
    const field=properties[name]||{};
    if(input.type==='checkbox')detail[name]=input.checked;
    else if(field.type==='number')detail[name]=input.value===''?null:Number(input.value);
    else if(field.type==='integer')detail[name]=input.value===''?null:parseInt(input.value,10);
    else if(field.type==='object'||field.type==='array'){
      try{detail[name]=JSON.parse(input.value||null);}
      catch{throw new Error(`${field.title||pretty(name)} must be valid JSON`);}
    }else detail[name]=input.value;
  });
  return detail;
}
function openAccountEditor(account={}){
  $('account-form').hidden=false;
  $('account-form').reset();
  $('account-id').value=account.ledger_account_id||'';
  $('account-form-family').value=account.ledger_family_code||selectedLedgerFamilyCode||'gl';
  $('account-division').value=account.owner_division_id||'';
  $('account-code').value=account.account_code||'';
  $('account-name').value=account.account_name||'';
  $('account-legal-entity').value=account.legal_entity_id||'';
  $('account-requires-subledger').checked=!!account.requires_subledger;
  $('account-subledger-family').value=account.required_subledger_family_code||'';
  fillAccountTypes();
  $('account-type').value=account.account_type_id||'';
  renderAccountDetailFields(account.additional_data||{});
}
function addPanelCloseButtons(){
  [
    'organisation-form',
    'org-copy-panel',
    'org-delete-panel',
    'division-form',
    'fiscal-editor-panel',
    'fiscal-period-panel',
    'country-form',
    'currency-form',
    'ledger-family-form',
    'ledger-type-form',
    'transaction-group-form',
    'transaction-type-form',
    'role-form',
    'account-form',
    'legal-entity-form',
    'master-record-form'
  ].forEach(id=>{
    const panel=$(id);
    if(!panel||panel.querySelector(':scope > .panel-close'))return;
    const button=document.createElement('button');
    button.type='button';
    button.className='panel-close';
    button.textContent='x';
    button.setAttribute('aria-label','Close panel');
    button.addEventListener('click',()=>{panel.hidden=true;});
    panel.prepend(button);
  });
}
function renderDashboard(){
  const org=currentOrg();
  const summary=state.dashboardSummary;
  const pending=state.orgId&&!loadedSlices.dashboard;
  const metric=(key,fallback='-')=>summary?summary[key]:pending?'...':fallback;
  const cards=[
    ['Organisations',boot.organisations.length],
    ['Divisions',metric('divisions')],
    ['Legal Entities',metric('legal_entities')],
    ['GL Accounts',metric('gl_accounts')],
    ['Subledgers',metric('subledgers')],
    ['Periods',metric('periods')],
    ['Journals',metric('journals')]
  ];
  $('metrics').innerHTML=cards.map(([k,v])=>`<article class="metric"><span>${k}</span><strong>${v}</strong></article>`).join('');
  $('org-summary').innerHTML=org?`<p><b>${org.organisation_name}</b></p><p>Code: ${org.organisation_code}</p><p>Base currency: ${org.base_currency_code}</p><p>Status: ${pretty(org.workflow_status)}</p>`:'';
}
function renderOrganisations(){
  const rows=boot.organisations.filter(row=>rowMatches(row,searchTerm('organisation-search')));
  table($('organisation-list'),[['Code',r=>r.organisation_code],['Name',r=>r.organisation_name],['Currency',r=>r.base_currency_code],['Template',r=>r.is_template?'Yes':'No']],rows,r=>{
    $('organisation-form').hidden=false;
    $('org-id').value=r.organisation_id;$('org-code').value=r.organisation_code;$('org-name').value=r.organisation_name;$('org-currency').value=r.base_currency_code;$('org-template').checked=r.is_template;
    const source=boot.organisations.find(o=>o.is_template&&o.organisation_id!==r.organisation_id)||boot.organisations.find(o=>o.organisation_id!==r.organisation_id);
    $('org-copy-panel').hidden=true;
    $('org-delete-panel').hidden=true;
    $('org-copy-source').value=source?.organisation_id||'';
    $('org-copy-target').value=r.organisation_id;
    $('org-delete-target').value=r.organisation_id;
  });
}
function renderDivisions(){
  const rows=state.divisions.filter(row=>rowMatches(row,searchTerm('division-search')));
  table($('division-list'),[['Code',r=>`${'  '.repeat(Number(r.depth)||0)}${r.division_code}`],['Name',r=>r.division_name],['Status',r=>pretty(r.workflow_status)]],rows,r=>{
    $('division-form').hidden=false;
    $('division-id').value=r.division_id;$('division-parent').value=r.parent_division_id||'';$('division-code').value=r.division_code;$('division-name').value=r.division_name;$('division-status').value=r.workflow_status||'approved';
  });
}
function renderFiscal(){
  const target=$('fiscal-year-list');
  const term=searchTerm('fiscal-search');
  const matchingPeriodYearIds=new Set(state.periods.filter(period=>rowMatches(period,term)).map(period=>period.fiscal_year_id));
  const years=state.years.filter(year=>rowMatches(year,term)||matchingPeriodYearIds.has(year.fiscal_year_id));
  if(!years.length){target.innerHTML='<p class="empty">No fiscal years match the search.</p>';return;}
  const el=document.createElement('table');
  el.className='fiscal-table';
  el.innerHTML='<thead><tr><th></th><th>Fiscal Year</th><th>Start</th><th>End</th><th>Status</th></tr></thead>';
  const body=document.createElement('tbody');
  years.forEach(year=>{
    const row=document.createElement('tr');
    row.className='click-row fiscal-year-row';
    const expanded=expandedFiscalYears.has(year.fiscal_year_id);
    row.innerHTML=`<td><button type="button" class="mini-toggle" aria-label="${expanded?'Collapse':'Expand'} ${year.fiscal_year_code}">${expanded?'v':'>'}</button></td><td>${year.fiscal_year_code}</td><td>${dateOnly(year.start_date)}</td><td>${dateOnly(year.end_date)}</td><td>${pretty(year.status)}</td>`;
    row.querySelector('button').addEventListener('click',event=>{
      event.stopPropagation();
      if(expanded)expandedFiscalYears.delete(year.fiscal_year_id);
      else expandedFiscalYears.add(year.fiscal_year_id);
      renderFiscal();
    });
    row.addEventListener('click',()=>selectFiscalYear(year));
    body.append(row);
    if(expanded){
      const periodRow=document.createElement('tr');
      const cell=document.createElement('td');
      cell.colSpan=5;
      cell.className='period-cell';
      renderPeriodGrid(cell,year);
      periodRow.append(cell);
      body.append(periodRow);
    }
  });
  el.append(body);
  target.innerHTML='';
  target.append(el);
}
function renderCountries(){
  const rows=(state.countries||[]).filter(row=>rowMatches(row,searchTerm('country-search')));
  table($('country-list'),[['Alpha-2',r=>r.country_code],['Alpha-3',r=>r.alpha3_code||''],['Numeric',r=>r.numeric_code||''],['Name',r=>r.country_name],['Seeded',r=>r.is_seeded?'Yes':'No']],rows,r=>{
    $('country-form').hidden=false;
    $('country-code').value=r.country_code;
    $('country-alpha3').value=r.alpha3_code||'';
    $('country-numeric').value=r.numeric_code||'';
    $('country-name').value=r.country_name;
    $('country-official').value=r.official_name||r.country_name;
    $('country-region').value=r.region||'';
    $('country-subregion').value=r.subregion||'';
    $('country-currency').value=r.default_currency_code||'';
    $('country-calling-code').value=r.calling_code||'';
    $('country-postal-required').checked=!!r.postal_code_required;
    $('country-admin-label').value=r.administrative_level_label||'';
  });
}
function renderCurrencies(){
  const rows=(state.currencies||[]).filter(row=>rowMatches(row,searchTerm('currency-search')));
  table($('currency-list'),[['Code',r=>r.currency_code],['Name',r=>r.currency_name],['Decimals',r=>r.decimal_places],['Seeded',r=>r.is_seeded?'Yes':'No']],rows,r=>{
    $('currency-form').hidden=false;
    $('currency-code').value=r.currency_code;
    $('currency-name').value=r.currency_name;
    $('currency-decimals').value=r.decimal_places;
  });
}
function renderLedgerFamilies(){
  const term=searchTerm('ledgerfamily-search');
  const matchingTypeFamilies=new Set((state.ledgerTypes||[]).filter(type=>rowMatches(type,term)).map(type=>type.ledger_family_code));
  const rows=(state.ledgerFamilies||[]).filter(row=>rowMatches(row,term)||matchingTypeFamilies.has(row.ledger_family_code));
  const target=$('ledger-family-list');
  if(!rows.length){target.innerHTML='<p class="empty">No ledger families match the search.</p>';return;}
  const el=document.createElement('table');
  el.className='ledger-family-table';
  el.innerHTML='<thead><tr><th></th><th>Code</th><th>Name</th><th>Standard type</th><th>Active</th></tr></thead>';
  const body=document.createElement('tbody');
  rows.forEach(family=>{
    const row=document.createElement('tr');
    row.className='click-row';
    const expanded=expandedLedgerFamilies.has(family.ledger_family_code);
    row.innerHTML=`<td><button type="button" class="mini-toggle" aria-label="${expanded?'Collapse':'Expand'} ${family.ledger_family_code}">${expanded?'v':'>'}</button></td><td>${family.ledger_family_code}</td><td>${family.family_name}</td><td>${family.requires_standard_account_type?'Yes':'No'}</td><td>${family.is_active?'Yes':'No'}</td>`;
    row.querySelector('button').addEventListener('click',event=>{
      event.stopPropagation();
      if(expanded)expandedLedgerFamilies.delete(family.ledger_family_code);
      else expandedLedgerFamilies.add(family.ledger_family_code);
      renderLedgerFamilies();
    });
    row.addEventListener('click',()=>selectLedgerFamily(family));
    body.append(row);
    if(expanded){
      const typeRow=document.createElement('tr');
      const cell=document.createElement('td');
      cell.colSpan=5;
      cell.className='nested-cell';
      renderLedgerTypeGrid(cell,family);
      typeRow.append(cell);
      body.append(typeRow);
    }
  });
  el.append(body);
  target.innerHTML='';
  target.append(el);
}
function selectLedgerFamily(family){
  $('ledger-family-form').hidden=false;
  $('ledger-type-form').hidden=true;
  $('ledger-family-code').value=family.ledger_family_code;
  $('ledger-family-code').readOnly=true;
  $('ledger-family-name').value=family.family_name;
  $('ledger-family-standard-type').checked=!!family.requires_standard_account_type;
  $('ledger-family-schema').value=JSON.stringify(family.schema_json||{},null,2);
  $('ledger-family-active').checked=!!family.is_active;
}
function selectLedgerType(type){
  $('ledger-type-form').hidden=false;
  $('ledger-family-form').hidden=true;
  $('ledger-type-id').value=type.account_type_id;
  $('ledger-type-family').value=type.ledger_family_code;
  $('ledger-type-code').value=type.account_type_code;
  $('ledger-type-name').value=type.account_type_name;
  $('ledger-type-required').checked=!!type.is_required;
  $('ledger-type-active').checked=!!type.is_active;
}
function renderLedgerTypeGrid(target,family){
  const types=(state.ledgerTypes||[]).filter(type=>type.ledger_family_code===family.ledger_family_code);
  const toolbar=document.createElement('div');
  toolbar.className='period-toolbar';
  const add=document.createElement('button');
  add.type='button';
  add.className='add-record-button';
  add.textContent='+';
  add.setAttribute('aria-label',`Add ledger type to ${family.family_name}`);
  add.addEventListener('click',()=>openNewLedgerType(family.ledger_family_code));
  toolbar.append(add);
  target.innerHTML='';
  target.append(toolbar);
  if(!types.length){
    const empty=document.createElement('p');
    empty.className='empty';
    empty.textContent='No ledger types defined for this family.';
    target.append(empty);
    return;
  }
  const tableEl=document.createElement('table');
  tableEl.className='period-grid';
  tableEl.innerHTML='<thead><tr><th>Code</th><th>Name</th><th>Required</th><th>Active</th></tr></thead>';
  const body=document.createElement('tbody');
  types.forEach(type=>{
    const row=document.createElement('tr');
    row.className='click-row';
    row.innerHTML=`<td>${type.account_type_code}</td><td>${type.account_type_name}</td><td>${type.is_required?'Yes':'No'}</td><td>${type.is_active?'Yes':'No'}</td>`;
    row.addEventListener('click',()=>selectLedgerType(type));
    body.append(row);
  });
  tableEl.append(body);
  target.append(tableEl);
}
function renderPeriodGrid(target,year){
  const periods=state.periods.filter(p=>p.fiscal_year_id===year.fiscal_year_id).sort((a,b)=>a.period_number-b.period_number);
  const toolbar=document.createElement('div');
  toolbar.className='period-toolbar';
  const add=document.createElement('button');
  add.type='button';
  add.className='add-record-button';
  add.textContent='+';
  add.setAttribute('aria-label',`Add period to ${year.fiscal_year_code}`);
  add.addEventListener('click',()=>openNewFiscalPeriod(year));
  toolbar.append(add);
  target.innerHTML='';
  target.append(toolbar);
  if(!periods.length){
    const empty=document.createElement('p');
    empty.className='empty';
    empty.textContent='No fiscal periods defined for this year.';
    target.append(empty);
    return;
  }
  const tableEl=document.createElement('table');
  tableEl.className='period-grid';
  tableEl.innerHTML='<thead><tr><th>Number</th><th>Code</th><th>Start</th><th>End</th><th>Status</th></tr></thead>';
  const body=document.createElement('tbody');
  periods.forEach(period=>{
    const row=document.createElement('tr');
    row.className='click-row';
    row.innerHTML=`<td>${period.period_number}</td><td>${period.period_code}</td><td>${dateOnly(period.start_date)}</td><td>${dateOnly(period.end_date)}</td><td>${pretty(period.status)}</td>`;
    row.addEventListener('click',()=>selectFiscalPeriod(period));
    body.append(row);
  });
  tableEl.append(body);
  target.append(tableEl);
}
function nextPeriodNumber(yearId){
  const numbers=state.periods.filter(p=>p.fiscal_year_id===yearId).map(p=>Number(p.period_number)||0);
  return Math.max(0,...numbers)+1;
}
function showFiscalEditor(){
  $('fiscal-editor-panel').hidden=false;
  $('fiscal-period-panel').hidden=true;
}
function showFiscalPeriodEditor(){
  $('fiscal-period-panel').hidden=false;
  $('fiscal-editor-panel').hidden=true;
}
function hideFiscalPeriodEditor(){
  $('fiscal-period-panel').hidden=true;
}
function selectFiscalYear(year){
  showFiscalEditor();
  $('fiscal-year-id').value=year.fiscal_year_id;
  $('fiscal-code').value=year.fiscal_year_code;
  $('fiscal-start').value=dateOnly(year.start_date);
  $('fiscal-end').value=dateOnly(year.end_date);
  $('fiscal-status').value=year.status||'open';
  $('period-year-id').value=year.fiscal_year_id;
  hideFiscalPeriodEditor();
}
function selectFiscalPeriod(period){
  const year=state.years.find(y=>y.fiscal_year_id===period.fiscal_year_id);
  if(year)selectFiscalYear(year);
  $('fiscal-period-id').value=period.fiscal_period_id;
  $('period-year-id').value=period.fiscal_year_id;
  $('period-number').value=period.period_number;
  $('period-start').value=dateOnly(period.start_date);
  $('period-end').value=dateOnly(period.end_date);
  $('period-status').value=period.status||'open';
  showFiscalPeriodEditor();
}
function resetFiscalYearForm(){
  showFiscalEditor();
  $('fiscal-form').reset();
  $('fiscal-year-id').value='';
  $('fiscal-status').value='open';
  $('fiscal-periods').checked=true;
  hideFiscalPeriodEditor();
}
function resetFiscalPeriodForm(){
  showFiscalPeriodEditor();
  $('fiscal-period-form').reset();
  $('fiscal-period-id').value='';
  $('period-status').value='open';
  if(!$('period-year-id').value&&$('fiscal-year-id').value)$('period-year-id').value=$('fiscal-year-id').value;
}
function openNewFiscalPeriod(year){
  expandedFiscalYears.add(year.fiscal_year_id);
  selectFiscalYear(year);
  resetFiscalPeriodForm();
  $('period-year-id').value=year.fiscal_year_id;
  $('period-number').value=nextPeriodNumber(year.fiscal_year_id);
}
function renderAccounts(){
  const family=selectedLedgerFamilyCode||'gl';
  const term=searchTerm('account-search');
  const rows=state.accounts.filter(a=>a.ledger_family_code===family&&rowMatches(a,term));
  $('account-grid-title').textContent=labelForFamily(family);
  table($('account-list'),[['Code',r=>r.account_code],['Name',r=>r.account_name],['Type',r=>r.account_type_name||''],['Legal entity',r=>r.legal_entity_known_name||''],['Owner',r=>r.owner_division_name],['Requires subledger',r=>r.requires_subledger?`Yes ${r.required_subledger_family_code||''}`:'No']],rows,r=>{
    openAccountEditor(r);
  });
}
function addLegalIdentification(row={}){
  const target=$('legal-entity-identifications');
  const item=document.createElement('div');
  item.className='legal-entity-line identification-line';
  item.innerHTML='<input class="identification-type" placeholder="Type"><input class="identification-number" placeholder="Number"><input class="identification-authority" placeholder="Authority"><input class="identification-country" maxlength="2" placeholder="Country"><input class="identification-from" type="date"><input class="identification-to" type="date"><label class="check"><input class="identification-active" type="checkbox" checked> Active</label><button type="button" class="secondary">Remove</button>';
  target.append(item);
  item.querySelector('.identification-type').value=row.identification_type||'';
  item.querySelector('.identification-number').value=row.identification_number||'';
  item.querySelector('.identification-authority').value=row.issuing_authority||'';
  item.querySelector('.identification-country').value=row.country_code||'';
  item.querySelector('.identification-from').value=dateOnly(row.valid_from)||today();
  item.querySelector('.identification-to').value=dateOnly(row.valid_to);
  item.querySelector('.identification-active').checked=row.is_active!==false;
  item.querySelector('button').addEventListener('click',()=>item.remove());
}
function addLegalAddress(row={}){
  const target=$('legal-entity-addresses');
  const item=document.createElement('div');
  item.className='legal-entity-line address-line';
  item.innerHTML='<input class="address-type" placeholder="Type"><input class="address-line1" placeholder="Line 1"><input class="address-line2" placeholder="Line 2"><input class="address-city" placeholder="City"><input class="address-region" placeholder="Region"><input class="address-postal" placeholder="Postal code"><input class="address-country" maxlength="2" placeholder="Country"><input class="address-from" type="date"><input class="address-to" type="date"><label class="check"><input class="address-primary" type="checkbox"> Primary</label><button type="button" class="secondary">Remove</button>';
  target.append(item);
  item.querySelector('.address-type').value=row.address_type||'';
  item.querySelector('.address-line1').value=row.address_line1||'';
  item.querySelector('.address-line2').value=row.address_line2||'';
  item.querySelector('.address-city').value=row.city||'';
  item.querySelector('.address-region').value=row.region||'';
  item.querySelector('.address-postal').value=row.postal_code||'';
  item.querySelector('.address-country').value=row.country_code||'';
  item.querySelector('.address-from').value=dateOnly(row.valid_from)||today();
  item.querySelector('.address-to').value=dateOnly(row.valid_to);
  item.querySelector('.address-primary').checked=!!row.is_primary;
  item.querySelector('button').addEventListener('click',()=>item.remove());
}
function addLegalRelationship(row={}){
  const target=$('legal-entity-relationships');
  const item=document.createElement('div');
  item.className='legal-entity-line relationship-line';
  item.innerHTML='<select class="relationship-entity"></select><input class="relationship-type" placeholder="Type"><input class="relationship-title" placeholder="Role title"><input class="relationship-ownership" type="number" step="0.0001" placeholder="Ownership %"><input class="relationship-from" type="date"><input class="relationship-to" type="date"><label class="check"><input class="relationship-primary" type="checkbox"> Primary</label><button type="button" class="secondary">Remove</button>';
  target.append(item);
  option(item.querySelector('.relationship-entity'),state.legalEntities.filter(e=>e.legal_entity_id!==selectedLegalEntity),'legal_entity_id',e=>`${e.known_name} - ${e.legal_name}`,'Select legal entity');
  item.querySelector('.relationship-entity').value=row.to_legal_entity_id||'';
  item.querySelector('.relationship-type').value=row.relationship_type||'';
  item.querySelector('.relationship-title').value=row.role_title||'';
  item.querySelector('.relationship-ownership').value=row.ownership_percentage??'';
  item.querySelector('.relationship-from').value=dateOnly(row.valid_from)||today();
  item.querySelector('.relationship-to').value=dateOnly(row.valid_to);
  item.querySelector('.relationship-primary').checked=!!row.is_primary;
  item.querySelector('button').addEventListener('click',()=>item.remove());
}
function renderLegalEntityChildRows(identifications=[],addresses=[],relationships=[]){
  $('legal-entity-identifications').innerHTML='';
  $('legal-entity-addresses').innerHTML='';
  $('legal-entity-relationships').innerHTML='';
  identifications.forEach(addLegalIdentification);
  addresses.forEach(addLegalAddress);
  relationships.forEach(addLegalRelationship);
}
function collectLegalIdentifications(){
  return [...$('legal-entity-identifications').querySelectorAll('.identification-line')].map(row=>({
    identification_type:row.querySelector('.identification-type').value,
    identification_number:row.querySelector('.identification-number').value,
    issuing_authority:row.querySelector('.identification-authority').value,
    country_code:row.querySelector('.identification-country').value,
    valid_from:row.querySelector('.identification-from').value,
    valid_to:row.querySelector('.identification-to').value,
    is_active:row.querySelector('.identification-active').checked
  })).filter(row=>row.identification_type||row.identification_number);
}
function collectLegalAddresses(){
  return [...$('legal-entity-addresses').querySelectorAll('.address-line')].map(row=>({
    address_type:row.querySelector('.address-type').value,
    address_line1:row.querySelector('.address-line1').value,
    address_line2:row.querySelector('.address-line2').value,
    city:row.querySelector('.address-city').value,
    region:row.querySelector('.address-region').value,
    postal_code:row.querySelector('.address-postal').value,
    country_code:row.querySelector('.address-country').value,
    valid_from:row.querySelector('.address-from').value,
    valid_to:row.querySelector('.address-to').value,
    is_primary:row.querySelector('.address-primary').checked
  })).filter(row=>row.address_type||row.address_line1);
}
function collectLegalRelationships(){
  return [...$('legal-entity-relationships').querySelectorAll('.relationship-line')].map(row=>({
    to_legal_entity_id:row.querySelector('.relationship-entity').value,
    relationship_type:row.querySelector('.relationship-type').value,
    role_title:row.querySelector('.relationship-title').value,
    ownership_percentage:row.querySelector('.relationship-ownership').value,
    valid_from:row.querySelector('.relationship-from').value,
    valid_to:row.querySelector('.relationship-to').value,
    is_primary:row.querySelector('.relationship-primary').checked
  })).filter(row=>row.to_legal_entity_id||row.relationship_type);
}
function resetLegalEntityForm(){
  selectedLegalEntity=null;
  state.legalEntityDetail=null;
  $('legal-entity-form').hidden=false;
  showLegalEntityTab('details');
  $('legal-entity-form').reset();
  $('legal-entity-id').value='';
  $('legal-entity-type').value='company';
  $('legal-entity-status').value='draft';
  $('legal-entity-additional').value='{}';
  renderLegalEntityChildRows();
  renderLegalEntityAccounts([]);
}
async function openLegalEntityEditor(entity){
  selectedLegalEntity=entity.legal_entity_id;
  $('legal-entity-form').hidden=false;
  showLegalEntityTab('details');
  $('legal-entity-id').value=entity.legal_entity_id||'';
  $('legal-entity-type').value=entity.entity_type||'company';
  $('legal-entity-legal-name').value=entity.legal_name||'';
  $('legal-entity-known-name').value=entity.known_name||'';
  $('legal-entity-status').value=entity.workflow_status||'draft';
  $('legal-entity-effective-from').value=dateOnly(entity.effective_from)||today();
  $('legal-entity-effective-to').value=dateOnly(entity.effective_to);
  $('legal-entity-additional').value=JSON.stringify(entity.additional_data||{},null,2);
  const detail=await api(`legal-entities/detail?legal_entity_id=${encodeURIComponent(entity.legal_entity_id)}`);
  state.legalEntityDetail=detail;
  const identifications=(detail.identifications||[]).map(row=>({
    identification_type:row.identification_type,
    identification_number:row.identification_number,
    issuing_authority:row.issuing_authority,
    country_code:row.country_code,
    valid_from:dateOnly(row.valid_from),
    valid_to:dateOnly(row.valid_to),
    is_active:row.is_active
  }));
  const addresses=(detail.addresses||[]).map(row=>({
    address_type:row.address_type,
    address_line1:row.address_line1,
    address_line2:row.address_line2,
    city:row.city,
    region:row.region,
    postal_code:row.postal_code,
    country_code:row.country_code,
    valid_from:dateOnly(row.valid_from),
    valid_to:dateOnly(row.valid_to),
    is_primary:row.is_primary
  }));
  const relationships=(detail.relationships||[]).filter(row=>row.from_legal_entity_id===entity.legal_entity_id).map(row=>({
    to_legal_entity_id:row.to_legal_entity_id,
    relationship_type:row.relationship_type,
    role_title:row.role_title,
    ownership_percentage:row.ownership_percentage,
    valid_from:dateOnly(row.valid_from),
    valid_to:dateOnly(row.valid_to),
    is_primary:row.is_primary
  }));
  renderLegalEntityChildRows(identifications,addresses,relationships);
  renderLegalEntityAccounts(detail.accounts||[]);
}
function renderLegalEntities(){
  const rows=state.legalEntities.filter(row=>rowMatches(row,searchTerm('legal-entity-search')));
  table($('legal-entity-list'),[['Known name',r=>r.known_name],['Legal name',r=>r.legal_name],['Type',r=>pretty(r.entity_type)],['Status',r=>pretty(r.workflow_status)],['Accounts',r=>r.account_count||0],['Balance',r=>Number(r.total_balance||0).toFixed(2)]],rows,r=>{
    openLegalEntityEditor(r).catch(e=>alert(e.message));
  });
}
function renderLegalEntityAccounts(rows=[]){
  const total=rows.reduce((sum,row)=>sum+(Number(row.balance)||0),0);
  $('legal-entity-account-total').textContent=`Total balance: ${total.toFixed(2)}`;
  table($('legal-entity-account-list'),[['Family',r=>pretty(r.ledger_family_code)],['Code',r=>r.account_code],['Name',r=>r.account_name],['Type',r=>r.account_type_name||''],['Debits',r=>Number(r.debit_total||0).toFixed(2)],['Credits',r=>Number(r.credit_total||0).toFixed(2)],['Balance',r=>Number(r.balance||0).toFixed(2)]],rows);
}
function renderMasterTypes(){
  option($('master-type-select'),state.masterTypes,'master_data_type_id',t=>t.type_name);
  const type=state.masterTypes.find(t=>t.master_data_type_id===$('master-type-select').value)||state.masterTypes[0];
  if(type){
    $('master-type-select').value=type.master_data_type_id;$('master-type-id').value=type.master_data_type_id;$('master-type-code').value=type.type_code;$('master-type-name').value=type.type_name;$('master-family').value=type.ledger_family_code;$('master-schema').value=JSON.stringify(type.schema_json,null,2);$('master-ui-schema').value=JSON.stringify(type.ui_schema_json,null,2);
  }
}
function renderMasterRecords(){
  const rows=state.masterRecords.filter(row=>rowMatches(row,searchTerm('master-record-search')));
  table($('master-list'),[['Code',r=>r.record_code],['Name',r=>r.display_name],['Owner',r=>r.owner_division_name],['Status',r=>pretty(r.workflow_status)]],rows,r=>{
    selectedMasterRecord=r.master_data_record_id;$('master-record-id').value=r.master_data_record_id;$('master-division').value=r.owner_division_id;$('master-code').value=r.record_code;$('master-display').value=r.display_name;$('master-ledger-account').value=r.ledger_account_id||'';$('master-data').value=JSON.stringify(r.additional_data||{},null,2);
  });
}
function renderJournals(){
  const rows=selectedTransactionTypeId?state.journals.filter(journal=>journal.transaction_type_id===selectedTransactionTypeId):state.journals;
  $('journal-grid-title').textContent=selectedTransactionTypeId?labelForTransactionType(selectedTransactionTypeId):'Transactions';
  table($('journal-list'),[['Date',r=>r.journal_date],['Number',r=>r.journal_number||'(draft)'],['Description',r=>r.description],['Status',r=>pretty(r.workflow_status)],['Debits',r=>r.debit_total],['Credits',r=>r.credit_total]],rows,async r=>{
    const d=await api(`journals/detail?journal_id=${encodeURIComponent(r.journal_id)}`);
    selectedJournal=r.journal_id;$('journal-form').hidden=false;$('journal-id').value=r.journal_id;$('journal-type').value=r.transaction_type_id||'';$('journal-period').value=r.fiscal_period_id;$('journal-division').value=r.source_division_id;$('journal-date').value=r.journal_date;$('journal-description').value=r.description;renderJournalLines(d.lines);
    setJournalEditable(r.workflow_status==='draft');
  });
}
async function renderReport(){
  if($('view-reports').hidden)return;
  const yearId=$('report-year').value||state.years[0]?.fiscal_year_id;
  if(!yearId){
    $('report-result').innerHTML='<p class="empty">No fiscal years defined.</p>';
    return;
  }
  const division=$('report-division').value;
  const params=new URLSearchParams({organisation_id:state.orgId,fiscal_year_id:yearId,report:selectedReport});
  if(selectedReport==='ledger'&&division)params.set('division_id',division);
  const r=await api(`reports/financial?${params.toString()}`);
  const amountLabel=selectedReport==='ledger'?'Balance':'Amount';
  table($('report-result'),[['Account',row=>`${row.account_code} - ${row.account_name}`],['Type',row=>row.account_type_name||row.account_type_code],['Debits',row=>Number(row.debit_total||0).toFixed(2)],['Credits',row=>Number(row.credit_total||0).toFixed(2)],[amountLabel,row=>Number(row.balance||0).toFixed(2)]],r.rows||[]);
}
function setJournalEditable(editable){
  ['journal-type','journal-period','journal-division','journal-date','journal-description','add-journal-line','journal-save'].forEach(id=>{
    if($(id))$(id).disabled=!editable;
  });
  document.querySelectorAll('.journal-line input,.journal-line select,.journal-line button').forEach(control=>{control.disabled=!editable;});
}
function renderJournalLines(lines=[{},{}]){
  $('journal-lines').innerHTML='';
  lines.forEach(line=>addJournalLine(line));
}
function addJournalLine(line={}){
  const row=document.createElement('div');
  row.className='journal-line';
  row.innerHTML='<select class="line-division"></select><select class="line-gl"></select><select class="line-sub"></select><input class="line-description" placeholder="Description"><input class="line-debit" type="number" step="0.01" placeholder="Debit"><input class="line-credit" type="number" step="0.01" placeholder="Credit"><button type="button" class="secondary">Remove</button>';
  $('journal-lines').append(row);
  option(row.querySelector('.line-division'),state.divisions,'division_id',d=>d.division_name);
  fillAccountSelects();
  row.querySelector('.line-division').value=line.division_id||$('journal-division').value||'';
  row.querySelector('.line-gl').value=line.gl_account_id||'';
  row.querySelector('.line-sub').value=line.subledger_account_id||'';
  row.querySelector('.line-description').value=line.description||'';
  row.querySelector('.line-debit').value=Number(line.debit_amount)||'';
  row.querySelector('.line-credit').value=Number(line.credit_amount)||'';
  row.querySelector('button').addEventListener('click',()=>row.remove());
}
function renderTransactionGroups(){
  const term=searchTerm('transactiongroup-search');
  const groups=state.transactionGroups.filter(row=>rowMatches(row,term));
  table($('transaction-group-list'),[['Code',r=>r.group_code],['Name',r=>r.group_name],['Sort',r=>r.sort_order],['Active',r=>r.is_active?'Yes':'No']],groups,selectTransactionGroup);
}
function renderTransactionTypes(){
  const term=searchTerm('transactiontype-search');
  const types=state.transactionTypes.filter(row=>rowMatches(row,term));
  table($('transaction-reference'),[['Code',r=>r.type_code],['Name',r=>r.type_name],['Group',r=>r.group_name],['Financial',r=>r.is_financial?'Yes':'No'],['Lines',r=>state.postingRules.filter(rule=>rule.transaction_type_id===r.transaction_type_id).length],['Additional',r=>r.allow_additional_lines?'Yes':'No']],types,row=>selectTransactionType(row).catch(e=>alert(e.message)));
}
function resourceLabel(permission){
  if(permission.resource_kind==='master_data')return permission.ledger_family_name||labelForFamily(permission.resource_code);
  return [permission.transaction_group_name,permission.transaction_type_name||permission.transaction_type_code].filter(Boolean).join(': ')||permission.resource_code;
}
function renderRoles(){
  const term=searchTerm('permission-search');
  const matchingRoleIds=new Set([
    ...state.rolePermissions.filter(row=>rowMatches(row,term)||resourceLabel(row).toLowerCase().includes(term)).map(row=>row.role_id),
    ...state.roleUsers.filter(row=>rowMatches(row,term)).map(row=>row.role_id)
  ]);
  const roles=state.roles.filter(row=>rowMatches(row,term)||matchingRoleIds.has(row.role_id));
  table($('role-list'),[['Name',r=>r.role_name],['Description',r=>r.role_description||''],['Administrator',r=>r.is_admin?'Yes':'No'],['Users',r=>state.roleUsers.filter(u=>u.role_id===r.role_id).length],['Master rows',r=>state.rolePermissions.filter(p=>p.role_id===r.role_id&&p.resource_kind==='master_data').length],['Transaction rows',r=>state.rolePermissions.filter(p=>p.role_id===r.role_id&&p.resource_kind==='transaction').length],['Active',r=>r.is_active?'Yes':'No']],roles,selectRole);
}
function renderSetup(){
  renderTransactionGroups();
  renderTransactionTypes();
  renderRoles();
}
function selectTransactionGroup(group){
  $('transaction-group-form').hidden=false;
  $('transaction-type-form').hidden=true;
  $('transaction-group-id').value=group.transaction_group_id;
  $('transaction-group-code').value=group.group_code;
  $('transaction-group-name').value=group.group_name;
  $('transaction-group-sort').value=group.sort_order||0;
  $('transaction-group-active').checked=!!group.is_active;
}
function openNewTransactionGroup(){
  $('transaction-group-form').hidden=false;
  $('transaction-group-form').reset();
  $('transaction-group-id').value='';
  $('transaction-group-sort').value=0;
  $('transaction-group-active').checked=true;
}
async function selectTransactionType(type){
  $('transaction-type-form').hidden=false;
  $('transaction-group-form').hidden=true;
  await loadAccountsForFamily('gl');
  $('transaction-type-id').value=type.transaction_type_id;
  $('transaction-type-group').value=type.transaction_group_id;
  $('transaction-type-code').value=type.type_code;
  $('transaction-type-name').value=type.type_name;
  $('transaction-type-description').value=type.type_description||'';
  $('transaction-type-sort').value=type.sort_order||0;
  $('transaction-type-financial').checked=type.is_financial!==false;
  $('transaction-type-additional-lines').checked=!!type.allow_additional_lines;
  $('transaction-type-active').checked=!!type.is_active;
  renderTransactionTypeLines(state.postingRules.filter(rule=>rule.transaction_type_id===type.transaction_type_id));
  toggleTransactionLineEditor();
}
async function openNewTransactionType(){
  $('transaction-type-form').hidden=false;
  $('transaction-group-form').hidden=true;
  await loadAccountsForFamily('gl');
  $('transaction-type-form').reset();
  $('transaction-type-id').value='';
  $('transaction-type-group').value=state.transactionGroups[0]?.transaction_group_id||'';
  $('transaction-type-sort').value=0;
  $('transaction-type-financial').checked=true;
  $('transaction-type-additional-lines').checked=true;
  $('transaction-type-active').checked=true;
  renderTransactionTypeLines([{},{}]);
  toggleTransactionLineEditor();
}
function toggleTransactionLineEditor(){
  const financial=$('transaction-type-financial').checked;
  $('transaction-line-editor').hidden=!financial;
  if(financial&&document.querySelectorAll('.transaction-type-line').length===0)renderTransactionTypeLines([{},{}]);
  if(!financial)$('transaction-type-lines').innerHTML='';
}
function renderTransactionTypeLines(lines=[]){
  $('transaction-type-lines').innerHTML='<div class="transaction-type-line-grid"><div class="transaction-type-line transaction-type-line-head"><span>DR/CR</span><span>GL Account</span><span>Subledger</span><span>Subledger Family</span><span>Description</span><span>Actions</span></div></div>';
  lines.forEach(line=>addTransactionTypeLine(line));
}
function addTransactionTypeLine(line={}){
  const row=document.createElement('div');
  row.className='transaction-type-line';
  row.innerHTML='<select class="tx-line-drcr"><option value="debit">DR</option><option value="credit">CR</option></select><select class="tx-line-gl"></select><label class="check"><input type="checkbox" class="tx-line-requires-subledger"> Subledger</label><select class="tx-line-subledger"></select><input class="tx-line-description" placeholder="Line description"><button type="button" class="secondary">Remove</button>';
  let grid=$('transaction-type-lines').querySelector('.transaction-type-line-grid');
  if(!grid){
    renderTransactionTypeLines();
    grid=$('transaction-type-lines').querySelector('.transaction-type-line-grid');
  }
  grid.append(row);
  const glAccounts=state.accounts.filter(account=>account.ledger_family_code==='gl'&&account.workflow_status!=='deleted');
  const subledgerFamilies=state.ledgerFamilies.filter(family=>family.ledger_family_code!=='gl'&&family.is_active!==false);
  option(row.querySelector('.tx-line-gl'),glAccounts,'ledger_account_id',account=>`${account.account_code} - ${account.account_name}`,'Select GL account');
  option(row.querySelector('.tx-line-subledger'),subledgerFamilies,'ledger_family_code',family=>`${family.ledger_family_code} - ${family.family_name}`,'Select subledger family');
  row.querySelector('.tx-line-drcr').value=line.debit_credit||'debit';
  row.querySelector('.tx-line-gl').value=line.default_gl_account_id||'';
  row.querySelector('.tx-line-requires-subledger').checked=!!line.requires_subledger;
  row.querySelector('.tx-line-subledger').value=line.subledger_family_code||'';
  row.querySelector('.tx-line-description').value=line.line_description||'';
  row.querySelector('button').addEventListener('click',()=>row.remove());
}
function selectRole(role){
  $('role-form').hidden=false;
  $('role-id').value=role.role_id;
  $('role-name').value=role.role_name;
  $('role-description').value=role.role_description||'';
  $('role-admin').checked=!!role.is_admin;
  $('role-active').checked=!!role.is_active;
  renderPermissionLines('master',state.rolePermissions.filter(p=>p.role_id===role.role_id&&p.resource_kind==='master_data'));
  renderPermissionLines('transaction',state.rolePermissions.filter(p=>p.role_id===role.role_id&&p.resource_kind==='transaction'));
  renderRoleUserLines(state.roleUsers.filter(u=>u.role_id===role.role_id));
  showRoleTab('users');
}
function openNewRole(){
  $('role-form').hidden=false;
  $('role-form').reset();
  $('role-id').value='';
  $('role-active').checked=true;
  renderPermissionLines('master',[]);
  renderPermissionLines('transaction',[]);
  renderRoleUserLines([]);
  showRoleTab('users');
}
function showRoleTab(tab){
  ['master','transaction','users'].forEach(name=>{
    $(`role-tab-${name}`).hidden=name!==tab;
    document.querySelectorAll('[data-role-tab]').forEach(button=>button.classList.toggle('active',button.dataset.roleTab===tab));
  });
}
function workflowOptionHtml(values){
  return values.map(value=>`<option value="${value}">${value==='*'?'All workflow statuses':value==='view'?'View':pretty(value)}</option>`).join('');
}
function renderPermissionLines(kind,lines=[]){
  const target=$(kind==='master'?'master-permission-lines':'transaction-permission-lines');
  target.innerHTML=`<div class="permission-line-grid"><div class="permission-line permission-line-head"><span>Division</span><span>${kind==='master'?'Ledger Family':'Transaction Type'}</span><span>Workflow</span><span>Actions</span></div></div>`;
  lines.forEach(line=>addPermissionLine(kind,line));
}
function addPermissionLine(kind,line={}){
  const target=$(kind==='master'?'master-permission-lines':'transaction-permission-lines');
  let grid=target.querySelector('.permission-line-grid');
  if(!grid){
    renderPermissionLines(kind,[]);
    grid=target.querySelector('.permission-line-grid');
  }
  const row=document.createElement('div');
  row.className='permission-line';
  row.innerHTML=`<select class="permission-division"></select><select class="permission-resource"></select><select class="permission-workflow">${workflowOptionHtml(kind==='master'?masterWorkflowOptions:transactionWorkflowOptions)}</select><button type="button" class="secondary">Remove</button>`;
  grid.append(row);
  const divisionLabel=d=>`${'  '.repeat(Number(d.depth)||0)}${d.division_code} - ${d.division_name}`;
  option(row.querySelector('.permission-division'),state.divisions,'division_id',divisionLabel,'Select division');
  if(kind==='master'){
    option(row.querySelector('.permission-resource'),state.ledgerFamilies.filter(f=>f.is_active!==false),'ledger_family_code',f=>`${f.ledger_family_code} - ${f.family_name}`,'Select ledger family');
    prependOption(row.querySelector('.permission-resource'),'*','All ledger families');
    row.querySelector('.permission-resource').value=line.resource_code||line.ledger_family_code||'';
  }else{
    option(row.querySelector('.permission-resource'),state.transactionTypes.filter(t=>t.is_active!==false),'transaction_type_id',t=>`${t.group_name}: ${t.type_name}`,'Select transaction type');
    prependOption(row.querySelector('.permission-resource'),'*','All transaction types');
    row.querySelector('.permission-resource').value=line.resource_code||line.transaction_type_id||'';
  }
  row.querySelector('.permission-division').value=line.division_id||'';
  row.querySelector('.permission-workflow').value=line.workflow_status||'*';
  row.querySelector('button').addEventListener('click',()=>row.remove());
}
function renderRoleUserLines(lines=[]){
  $('role-user-lines').innerHTML='<div class="role-user-line-grid"><div class="role-user-line role-user-line-head"><span>Email</span><span>Valid From</span><span>Valid To</span><span>Actions</span></div></div>';
  lines.forEach(line=>addRoleUserLine(line));
}
function addRoleUserLine(line={}){
  let grid=$('role-user-lines').querySelector('.role-user-line-grid');
  if(!grid){
    renderRoleUserLines([]);
    grid=$('role-user-lines').querySelector('.role-user-line-grid');
  }
  const row=document.createElement('div');
  row.className='role-user-line';
  row.innerHTML='<input class="role-user-email" type="email" placeholder="user@example.com"><input class="role-user-from" type="date"><input class="role-user-to" type="date"><button type="button" class="secondary">Remove</button>';
  grid.append(row);
  row.querySelector('.role-user-email').value=line.email||'';
  row.querySelector('.role-user-from').value=dateOnly(line.valid_from)||today();
  row.querySelector('.role-user-to').value=dateOnly(line.valid_to);
  row.querySelector('button').addEventListener('click',()=>row.remove());
}
function resetOrgLoadedState(){
  loadedSlices={menu:false,dashboard:false,divisions:false,fiscal:false,countries:false,currencies:false,ledgerTypes:false,masterTypes:false,legalEntities:false,transactions:false,permissions:false};
  state.currencies=[];state.countries=[];state.divisions=[];state.years=[];state.periods=[];state.masterTypes=[];state.masterRecords=[];state.legalEntities=[];state.legalEntityDetail=null;state.journals=[];state.transactionGroups=[];state.transactionTypes=[];state.postingRules=[];state.ledgerFamilies=[];state.ledgerTypes=[];state.accountTypes=[];state.accounts=[];state.roles=[];state.rolePermissions=[];state.roleUsers=[];state.dashboardSummary=null;
  loadedAccountFamilies=new Set();
}
async function loadDashboardData(force=false){
  if(!state.orgId||loadedSlices.dashboard&&!force)return;
  const orgId=state.orgId;
  loadedSlices.dashboard=false;
  state.dashboardSummary=null;
  renderDashboard();
  const summary=await api(`dashboard/summary?organisation_id=${orgId}`);
  if(state.orgId!==orgId)return;
  state.dashboardSummary=summary;
  loadedSlices.dashboard=true;
  renderDashboard();
}
function invalidateDashboard(){
  loadedSlices.dashboard=false;
  state.dashboardSummary=null;
  if(!$('view-dashboard').hidden)loadDashboardData().catch(e=>alert(e.message));
}
async function loadMenuData(force=false){
  if(!state.orgId||loadedSlices.menu&&!force)return;
  const menu=await api(`setup/menu?organisation_id=${state.orgId}`);
  state.ledgerFamilies=menu.ledger_families||[];
  state.transactionGroups=menu.transaction_groups||[];
  state.transactionTypes=menu.transaction_types||[];
  loadedSlices.menu=true;
  buildDynamicMenu();
  fillSelects();
}
async function ensureDivisions(force=false){
  if(!state.orgId||loadedSlices.divisions&&!force)return;
  const divs=await api(`divisions/list?organisation_id=${state.orgId}`);
  state.divisions=divs.divisions||[];
  loadedSlices.divisions=true;
  fillDivisionSelects();
}
async function ensureFiscal(force=false){
  if(!state.orgId||loadedSlices.fiscal&&!force)return;
  const fiscal=await api(`fiscal/list?organisation_id=${state.orgId}`);
  state.years=fiscal.fiscal_years||[];
  state.periods=fiscal.fiscal_periods||[];
  loadedSlices.fiscal=true;
  fillSelects();
  patchDynamicSelects();
}
async function ensureCountries(force=false){
  if(!state.orgId||loadedSlices.countries&&!force)return;
  const countries=await api(`countries/list?organisation_id=${state.orgId}`);
  state.countries=countries.countries||[];
  loadedSlices.countries=true;
}
async function ensureCurrencies(force=false){
  if(!state.orgId||loadedSlices.currencies&&!force)return;
  const currencies=await api(`currencies/list?organisation_id=${state.orgId}`);
  state.currencies=currencies.currencies||[];
  loadedSlices.currencies=true;
  fillSelects();
}
async function ensureLedgerTypes(force=false){
  if(!state.orgId||loadedSlices.ledgerTypes&&!force)return;
  const ledgerTypes=await api(`ledger-types/list?organisation_id=${state.orgId}`);
  state.ledgerTypes=ledgerTypes.ledger_types||[];
  state.accountTypes=ledgerTypes.ledger_types||[];
  loadedSlices.ledgerTypes=true;
  fillSelects();
  fillAccountTypes();
}
async function ensureMasterTypes(force=false){
  if(!state.orgId||loadedSlices.masterTypes&&!force)return;
  const types=await api(`masterdata/types?organisation_id=${state.orgId}`);
  state.masterTypes=types.types||[];
  loadedSlices.masterTypes=true;
  renderMasterTypes();
}
async function ensureLegalEntities(force=false){
  if(!state.orgId||loadedSlices.legalEntities&&!force)return;
  const entities=await api(`legal-entities/list?organisation_id=${state.orgId}`);
  state.legalEntities=entities.legal_entities||[];
  loadedSlices.legalEntities=true;
  fillLegalEntitySelects();
}
async function ensureTransactionSetup(force=false){
  if(!state.orgId||loadedSlices.transactions&&!force)return;
  const tx=await api(`setup/reference?organisation_id=${state.orgId}`);
  state.transactionGroups=tx.transaction_groups||[];
  state.transactionTypes=tx.transaction_types||[];
  state.postingRules=tx.posting_rules||[];
  loadedSlices.transactions=true;
  loadedSlices.menu=true;
  buildDynamicMenu();
  fillSelects();
  patchDynamicSelects();
}
async function ensurePermissions(force=false){
  if(!state.orgId||loadedSlices.permissions&&!force)return;
  await Promise.all([ensureDivisions(),loadMenuData()]);
  const permissions=await api(`permissions/list?organisation_id=${state.orgId}`);
  state.roles=permissions.roles||[];
  state.rolePermissions=permissions.role_permissions||[];
  state.roleUsers=permissions.role_users||[];
  loadedSlices.permissions=true;
}
async function ensureViewData(view){
  if(!state.orgId)return;
  if(view==='divisions'){await ensureDivisions();renderDivisions();}
  else if(view==='fiscal'){await ensureFiscal();renderFiscal();}
  else if(view==='countries'){await ensureCountries();renderCountries();}
  else if(view==='currencies'){await ensureCurrencies();renderCurrencies();}
  else if(view==='ledgerfamilies'){await Promise.all([loadMenuData(),ensureLedgerTypes()]);renderLedgerFamilies();}
  else if(view==='transactiongroups'){await ensureTransactionSetup();renderTransactionGroups();}
  else if(view==='transactiontypes'){await ensureTransactionSetup();renderTransactionTypes();}
  else if(view==='permissions'){await ensurePermissions();renderRoles();}
  else if(view==='legalentities'){await ensureLegalEntities();renderLegalEntities();}
  else if(view==='masterdata'){await Promise.all([ensureMasterTypes(),ensureDivisions(),loadMenuData()]);renderMasterTypes();await loadMasterRecords();}
  else if(view==='reports'){await Promise.all([ensureFiscal(),ensureDivisions()]);}
}
async function loadOrgData(){
  resetOrgLoadedState();
  if(!state.orgId)return;
  await loadMenuData(true);
  renderDashboard();
  renderOrganisations();
}
async function loadAccountsForFamily(familyCode){
  if(!familyCode||loadedAccountFamilies.has(familyCode))return;
  const r=await api(`accounts/list?organisation_id=${state.orgId}&ledger_family_code=${familyCode}`);
  state.accounts=state.accounts.filter(account=>account.ledger_family_code!==familyCode).concat(r.accounts||[]);
  state.accountTypes=r.account_types||state.accountTypes;
  loadedAccountFamilies.add(familyCode);
}
async function loadAllAccounts(){
  const families=state.ledgerFamilies.length?state.ledgerFamilies.filter(f=>f.is_active!==false):boot.ledger_families;
  const missing=families.filter(family=>!loadedAccountFamilies.has(family.ledger_family_code));
  if(!missing.length)return;
  const results=await Promise.all(missing.map(family=>api(`accounts/list?organisation_id=${state.orgId}&ledger_family_code=${family.ledger_family_code}`)));
  missing.forEach((family,index)=>{
    state.accounts=state.accounts.filter(account=>account.ledger_family_code!==family.ledger_family_code).concat(results[index].accounts||[]);
    loadedAccountFamilies.add(family.ledger_family_code);
  });
  state.accountTypes=results.find(r=>Array.isArray(r.account_types))?.account_types||state.accountTypes;
}
async function loadJournalsForTransactionType(typeId){
  if(!typeId){state.journals=[];return;}
  const r=await api(`journals/list?organisation_id=${state.orgId}&transaction_type_id=${encodeURIComponent(typeId)}`);
  state.journals=r.journals||[];
}
async function loadMasterRecords(){
  const typeId=$('master-type-select').value||state.masterTypes[0]?.master_data_type_id;
  if(!state.orgId||!typeId){state.masterRecords=[];renderMasterRecords();return;}
  const r=await api(`masterdata/list?organisation_id=${state.orgId}&master_data_type_id=${typeId}`);
  state.masterRecords=r.records||[];
  renderMasterRecords();
}
function renderAll(){renderDashboard();renderOrganisations();renderDivisions();renderFiscal();renderCountries();renderCurrencies();renderLedgerFamilies();renderAccounts();renderLegalEntities();renderMasterTypes();renderJournals();renderTransactionGroups();renderTransactionTypes();renderRoles();}
function resetScreenState(){
  selectedMasterRecord=null;
  selectedJournal=null;
  selectedLegalEntity=null;
  expandedFiscalYears=new Set();
  expandedLedgerFamilies=new Set();
  expandedTransactionGroups=new Set();
  loadedAccountFamilies=new Set();
  [
    'organisation-form',
    'org-copy-panel',
    'org-delete-panel',
    'division-form',
    'country-form',
    'currency-form',
    'ledger-family-form',
    'ledger-type-form',
    'transaction-group-form',
    'transaction-type-form',
    'role-form',
    'account-form',
    'legal-entity-form',
    'journal-form',
    'fiscal-editor-panel',
    'fiscal-period-panel'
  ].forEach(id=>{if($(id))$(id).hidden=true;});
  ['account-form','master-record-form','legal-entity-form','journal-form','fiscal-form','fiscal-period-form'].forEach(id=>$(id)?.reset());
  $('account-id').value='';
  $('master-record-id').value='';
  $('journal-id').value='';
  $('fiscal-year-id').value='';
  $('fiscal-period-id').value='';
  if($('org-copy-result'))$('org-copy-result').hidden=true;
  if($('org-delete-result'))$('org-delete-result').hidden=true;
  renderJournalLines();
  $('journal-date').value=today();
}
async function load(){
  alert('');
  boot=await api('setup/bootstrap');
  state.orgId=resolveCurrentOrgId();
  storeCurrentOrg();
  fillSelects();
  if(state.orgId)await loadOrgData();
  else{
    resetOrgLoadedState();
    fillDivisionSelects();renderAll();
  }
  if(!$('view-dashboard').hidden)loadDashboardData().catch(e=>alert(e.message));
}
document.querySelectorAll('.nav[data-view]').forEach(b=>b.addEventListener('click',()=>openView(b.dataset.view).catch(e=>alert(e.message))));
[
  ['organisation-search',renderOrganisations],
  ['division-search',renderDivisions],
  ['fiscal-search',renderFiscal],
  ['country-search',renderCountries],
  ['currency-search',renderCurrencies],
  ['ledgerfamily-search',renderLedgerFamilies],
  ['account-search',renderAccounts],
  ['legal-entity-search',renderLegalEntities],
  ['master-record-search',renderMasterRecords],
  ['transactiongroup-search',renderTransactionGroups],
  ['transactiontype-search',renderTransactionTypes],
  ['permission-search',renderRoles]
].forEach(([id,render])=>$(id)?.addEventListener('input',render));
$('setup-toggle').addEventListener('click',()=>{
  const expanded=$('setup-toggle').getAttribute('aria-expanded')==='true';
  setSetupExpanded(!expanded);
});
$('master-toggle').addEventListener('click',()=>{
  const expanded=$('master-toggle').getAttribute('aria-expanded')==='true';
  setMenuExpanded('master-toggle','master-subnav',!expanded);
});
$('transaction-toggle').addEventListener('click',()=>{
  const expanded=$('transaction-toggle').getAttribute('aria-expanded')==='true';
  setMenuExpanded('transaction-toggle','transaction-subnav',!expanded);
});
$('reports-toggle').addEventListener('click',()=>{
  const expanded=$('reports-toggle').getAttribute('aria-expanded')==='true';
  setMenuExpanded('reports-toggle','reports-subnav',!expanded);
});
document.querySelectorAll('[data-report-view]').forEach(button=>button.addEventListener('click',()=>openReport(button.dataset.reportView).catch(e=>alert(e.message))));
$('run-report').addEventListener('click',()=>renderReport().catch(e=>alert(e.message)));
$('report-year').addEventListener('change',()=>renderReport().catch(e=>alert(e.message)));
$('report-division').addEventListener('change',()=>renderReport().catch(e=>alert(e.message)));
$('refresh').addEventListener('click',()=>load().catch(e=>alert(e.message)));
$('reset-erp').addEventListener('click',async()=>{
  if(!window.confirm('Reset this tenant ERP data? This deletes ERP organisations, divisions, fiscal years, ledger accounts, master data, journals, and custom setup. It will not reseed defaults.'))return;
  try{
    const r=await api('setup/reset',{method:'POST',body:JSON.stringify({})});
    state.orgId=null;
    await load();
    alert(`ERP reset complete. ${r.deleted} records removed.`);
  }catch(e){
    alert(e.message);
  }
});
$('init-template-org').addEventListener('click',async()=>{
  if(!window.confirm('Create or reset the TEMPLATE organisation with seeded defaults? Existing TEMPLATE data will be deleted and recreated.'))return;
  try{
    const r=await api('setup/init-template',{method:'POST',body:JSON.stringify({})});
    state.orgId=r.organisation?.organisation_id||state.orgId;
    storeCurrentOrg();
    await load();
    show('organisations');
    $('init-template-result').hidden=false;
    $('init-template-result').textContent='Template organisation initialised.';
  }catch(e){
    alert(e.message);
  }
});
$('organisation-select').addEventListener('change',async e=>{
  state.orgId=e.target.value;
  storeCurrentOrg();
  selectedLedgerFamilyCode='gl';
  selectedTransactionTypeId='';
  selectedReport='income';
  resetScreenState();
  await load();
  show('dashboard');
  loadDashboardData().catch(error=>alert(error.message));
});
function openNewOrganisation(){
  $('organisation-form').hidden=false;
  $('org-copy-panel').hidden=true;
  $('org-delete-panel').hidden=true;
  $('organisation-form').reset();
  $('org-id').value='';
  const template=boot.organisations.find(o=>o.is_template);
  $('org-copy-source').value=template?.organisation_id||'';
  $('org-copy-target').value='';
  $('org-delete-target').value='';
}
$('add-org').addEventListener('click',openNewOrganisation);
$('new-org').addEventListener('click',openNewOrganisation);
async function saveOrganisationForm(){
  const r=await api('organisations/save',{method:'POST',body:JSON.stringify({organisation_id:$('org-id').value,organisation_code:$('org-code').value,organisation_name:$('org-name').value,base_currency_code:$('org-currency').value,is_template:$('org-template').checked})});
  if(r.organisation?.organisation_id)$('org-id').value=r.organisation.organisation_id;
  return r.organisation;
}
$('organisation-form').addEventListener('submit',async e=>{
  e.preventDefault();
  try{
    const org=await saveOrganisationForm();
    if(org?.organisation_id){
      state.orgId=org.organisation_id;
      storeCurrentOrg();
    }
    $('organisation-form').hidden=true;
    await load();
    show('organisations');
  }catch(error){
    alert(error.message);
  }
});
function selectedOrganisationId(){
  return $('org-id').value||state.orgId||'';
}
function openOrgCopyPanel(){
  const targetId=selectedOrganisationId();
  const template=boot.organisations.find(o=>o.is_template&&o.organisation_id!==targetId)||boot.organisations.find(o=>o.organisation_id!==targetId);
  $('org-copy-panel').hidden=false;
  $('org-delete-panel').hidden=true;
  $('org-copy-result').hidden=true;
  $('org-copy-source').value=template?.organisation_id||'';
  $('org-copy-target').value=targetId;
}
function openOrgDeletePanel(){
  const targetId=selectedOrganisationId();
  $('org-delete-panel').hidden=false;
  $('org-copy-panel').hidden=true;
  $('org-delete-result').hidden=true;
  $('org-delete-target').value=targetId;
}
$('open-org-copy').addEventListener('click',openOrgCopyPanel);
$('open-org-delete').addEventListener('click',openOrgDeletePanel);
$('run-org-copy').addEventListener('click',async()=>{
  const sourceId=$('org-copy-source').value;
  const targetId=$('org-copy-target').value;
  if(!sourceId||!targetId)return alert('Select both source and target organisations');
  if(sourceId===targetId)return alert('Source and target organisations must be different');
  if(!window.confirm('Copy the selected setup data into the target organisation? Existing matching setup rows may be updated.'))return;
  const options={
    divisions:$('copy-divisions').checked,
    countries:$('copy-countries').checked,
    currencies:$('copy-currencies').checked,
    fiscal_years:$('copy-fiscal-years').checked,
    ledger_families:$('copy-ledger-families').checked,
    ledger_types:$('copy-ledger-types').checked,
    chart_of_accounts:$('copy-chart').checked,
    transaction_groups:$('copy-transaction-groups').checked,
    transaction_types:$('copy-transaction-types').checked,
    posting_rules:$('copy-posting-rules').checked,
    master_data_types:$('copy-master-types').checked,
    permissions:$('copy-permissions').checked
  };
  const r=await api('organisations/copy-seeding-data',{method:'POST',body:JSON.stringify({source_organisation_id:sourceId,target_organisation_id:targetId,options})});
  state.orgId=targetId;
  storeCurrentOrg();
  resetScreenState();
  await load();
  show('organisations');
  $('org-copy-panel').hidden=false;
  const detail=Object.entries(r.detail||{}).map(([name,count])=>`${pretty(name)}: ${count}`).join(' | ');
  $('org-copy-result').hidden=false;
  $('org-copy-result').textContent=`Copy complete. ${r.copied} records inserted or updated.${detail?` ${detail}`:''}`;
});
$('run-org-delete').addEventListener('click',async()=>{
  const orgId=$('org-delete-target').value;
  if(!orgId)return alert('Select an organisation first');
  const options={
    divisions:$('delete-divisions').checked,
    countries:$('delete-countries').checked,
    currencies:$('delete-currencies').checked,
    fiscal_years:$('delete-fiscal-years').checked,
    ledger_families:$('delete-ledger-families').checked,
    ledger_types:$('delete-ledger-types').checked,
    chart_of_accounts:$('delete-chart').checked,
    transaction_groups:$('delete-transaction-groups').checked,
    transaction_types:$('delete-transaction-types').checked,
    posting_rules:$('delete-posting-rules').checked,
    master_data_types:$('delete-master-types').checked,
    permissions:$('delete-permissions').checked
  };
  if(!Object.values(options).some(Boolean))return alert('Select at least one data option to delete');
  const org=boot.organisations.find(o=>o.organisation_id===orgId);
  const name=org?`${org.organisation_code} - ${org.organisation_name}`:'the selected organisation';
  if(!window.confirm(`Delete the selected data from ${name}? This cannot be undone.`))return;
  const r=await api('organisations/delete-data',{method:'POST',body:JSON.stringify({organisation_id:orgId,options})});
  state.orgId=orgId;
  storeCurrentOrg();
  resetScreenState();
  await load();
  show('organisations');
  $('org-delete-panel').hidden=false;
  const detail=Object.entries(r.detail||{}).map(([name,count])=>`${pretty(name)}: ${count}`).join(' | ');
  $('org-delete-result').hidden=false;
  $('org-delete-result').textContent=`Delete complete. ${r.deleted} records removed.${detail?` ${detail}`:''}`;
});
function openNewDivision(){
  $('division-form').hidden=false;
  $('division-form').reset();
  $('division-id').value='';
  $('division-status').value='approved';
}
$('add-division').addEventListener('click',openNewDivision);
$('new-division').addEventListener('click',openNewDivision);
$('division-form').addEventListener('submit',async e=>{e.preventDefault();await api('divisions/save',{method:'POST',body:JSON.stringify({division_id:$('division-id').value,organisation_id:state.orgId,parent_division_id:$('division-parent').value,division_code:$('division-code').value,division_name:$('division-name').value,workflow_status:$('division-status').value})});$('division-form').hidden=true;await ensureDivisions(true);renderDivisions();invalidateDashboard();});
$('add-fiscal-year').addEventListener('click',resetFiscalYearForm);
$('new-fiscal-year').addEventListener('click',resetFiscalYearForm);
$('new-fiscal-period').addEventListener('click',resetFiscalPeriodForm);
$('fiscal-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const r=await api('fiscal/save-year',{method:'POST',body:JSON.stringify({
    fiscal_year_id:$('fiscal-year-id').value,
    organisation_id:state.orgId,
    fiscal_year_code:$('fiscal-code').value,
    start_date:$('fiscal-start').value,
    end_date:$('fiscal-end').value,
    status:$('fiscal-status').value,
    create_periods:$('fiscal-periods').checked
  })});
  if(r.fiscal_year?.fiscal_year_id){
    expandedFiscalYears.add(r.fiscal_year.fiscal_year_id);
    $('period-year-id').value=r.fiscal_year.fiscal_year_id;
  }
  $('fiscal-editor-panel').hidden=true;
  await ensureFiscal(true);
  renderFiscal();
  invalidateDashboard();
});
$('fiscal-period-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const yearId=$('period-year-id').value||$('fiscal-year-id').value;
  if(!yearId)return alert('Select or save a fiscal year first');
  await api('fiscal/save-period',{method:'POST',body:JSON.stringify({
    fiscal_period_id:$('fiscal-period-id').value,
    organisation_id:state.orgId,
    fiscal_year_id:yearId,
    period_number:$('period-number').value,
    start_date:$('period-start').value,
    end_date:$('period-end').value,
    status:$('period-status').value
  })});
  expandedFiscalYears.add(yearId);
  $('fiscal-period-panel').hidden=true;
  await ensureFiscal(true);
  renderFiscal();
  invalidateDashboard();
});
$('account-form-family').addEventListener('change',()=>{
  let detail={};
  try{detail=collectAccountDetail();}catch{}
  selectedLedgerFamilyCode=$('account-form-family').value;
  fillAccountTypes();
  renderAccountDetailFields(detail);
});
$('add-account').addEventListener('click',()=>openAccountEditor());
$('new-account').addEventListener('click',()=>openAccountEditor());
$('account-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const family=$('account-form-family').value;
  let additionalData;
  try{additionalData=collectAccountDetail();}
  catch(error){alert(error.message);return;}
  await api('accounts/save',{method:'POST',body:JSON.stringify({
    ledger_account_id:$('account-id').value,
    organisation_id:state.orgId,
    owner_division_id:$('account-division').value,
    ledger_family_code:family,
    account_code:$('account-code').value,
    account_name:$('account-name').value,
    account_type_id:$('account-type').value,
    legal_entity_id:$('account-legal-entity').value,
    requires_subledger:$('account-requires-subledger').checked,
    required_subledger_family_code:$('account-subledger-family').value,
    additional_data:JSON.stringify(additionalData)
  })});
  loadedAccountFamilies.delete(family);
  await loadAccountsForFamily(family);
  renderAccounts();
  fillAccountSelects();
  $('account-form').hidden=true;
  invalidateDashboard();
});
$('add-legal-entity').addEventListener('click',resetLegalEntityForm);
$('new-legal-entity').addEventListener('click',resetLegalEntityForm);
$('add-legal-identification').addEventListener('click',()=>addLegalIdentification());
$('add-legal-address').addEventListener('click',()=>addLegalAddress());
$('add-legal-relationship').addEventListener('click',()=>addLegalRelationship());
$('legal-entity-form').addEventListener('submit',async e=>{
  e.preventDefault();
  let additionalData;
  let identifications;
  let addresses;
  let relationships;
  try{
    additionalData=JSON.parse($('legal-entity-additional').value||'{}');
    identifications=collectLegalIdentifications();
    addresses=collectLegalAddresses();
    relationships=collectLegalRelationships();
  }catch(error){
    alert(error.message);
    return;
  }
  await api('legal-entities/save',{method:'POST',body:JSON.stringify({
    legal_entity_id:$('legal-entity-id').value,
    organisation_id:state.orgId,
    entity_type:$('legal-entity-type').value,
    legal_name:$('legal-entity-legal-name').value,
    known_name:$('legal-entity-known-name').value,
    workflow_status:$('legal-entity-status').value,
    effective_from:$('legal-entity-effective-from').value,
    effective_to:$('legal-entity-effective-to').value,
    additional_data:JSON.stringify(additionalData),
    identifications:JSON.stringify(identifications),
    addresses:JSON.stringify(addresses),
    relationships:JSON.stringify(relationships)
  })});
  await ensureLegalEntities(true);
  renderLegalEntities();
  fillLegalEntitySelects();
});
$('master-type-select').addEventListener('change',()=>{renderMasterTypes();loadMasterRecords().catch(e=>alert(e.message));});
$('master-type-form').addEventListener('submit',async e=>{e.preventDefault();await api('masterdata/save-type',{method:'POST',body:JSON.stringify({master_data_type_id:$('master-type-id').value,organisation_id:state.orgId,ledger_family_code:$('master-family').value,type_code:$('master-type-code').value,type_name:$('master-type-name').value,schema_json:$('master-schema').value,ui_schema_json:$('master-ui-schema').value})});await ensureMasterTypes(true);renderMasterTypes();await loadMasterRecords();});
$('new-master').addEventListener('click',()=>{$('master-record-form').reset();$('master-record-id').value='';selectedMasterRecord=null;$('master-data').value='{}';});
$('master-record-form').addEventListener('submit',async e=>{e.preventDefault();await api('masterdata/save',{method:'POST',body:JSON.stringify({master_data_record_id:$('master-record-id').value,organisation_id:state.orgId,master_data_type_id:$('master-type-select').value,owner_division_id:$('master-division').value,ledger_account_id:$('master-ledger-account').value,record_code:$('master-code').value,display_name:$('master-display').value,additional_data:$('master-data').value})});await loadMasterRecords();});
document.querySelectorAll('[data-master-action]').forEach(b=>b.addEventListener('click',async()=>{if(!selectedMasterRecord)return alert('Select a master record first');await api('masterdata/workflow',{method:'POST',body:JSON.stringify({master_data_record_id:selectedMasterRecord,action:b.dataset.masterAction})});await loadMasterRecords();}));
$('journal-date').value=today();
option($('journal-period'),[],null,null);
$('add-journal-line').addEventListener('click',()=>addJournalLine());
$('add-journal').addEventListener('click',()=>{$('journal-form').hidden=false;$('journal-form').reset();$('journal-id').value='';selectedJournal=null;$('journal-type').value=selectedTransactionTypeId||'';$('journal-date').value=today();renderJournalLines();setJournalEditable(true);});
$('new-journal').addEventListener('click',()=>{$('journal-form').hidden=false;$('journal-form').reset();$('journal-id').value='';selectedJournal=null;$('journal-type').value=selectedTransactionTypeId||'';$('journal-date').value=today();renderJournalLines();setJournalEditable(true);});
$('journal-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const lines=[...document.querySelectorAll('.journal-line')].map(row=>({division_id:row.querySelector('.line-division').value,gl_account_id:row.querySelector('.line-gl').value,subledger_account_id:row.querySelector('.line-sub').value,description:row.querySelector('.line-description').value,debit_amount:row.querySelector('.line-debit').value,credit_amount:row.querySelector('.line-credit').value,currency_code:currentOrg()?.base_currency_code||'ZAR'}));
  await api('journals/save',{method:'POST',body:JSON.stringify({journal_id:$('journal-id').value,organisation_id:state.orgId,transaction_type_id:$('journal-type').value,fiscal_period_id:$('journal-period').value,source_division_id:$('journal-division').value,journal_date:$('journal-date').value,description:$('journal-description').value,currency_code:currentOrg()?.base_currency_code||'ZAR',lines})});
  await loadJournalsForTransactionType($('journal-type').value||selectedTransactionTypeId);
  renderJournals();
  invalidateDashboard();
});
document.querySelectorAll('[data-journal-action]').forEach(b=>b.addEventListener('click',async()=>{if(!$('journal-id').value)return alert('Select or save a journal first');await api('journals/workflow',{method:'POST',body:JSON.stringify({journal_id:$('journal-id').value,action:b.dataset.journalAction})});await loadJournalsForTransactionType($('journal-type').value||selectedTransactionTypeId);renderJournals();invalidateDashboard();}));
$('currency-form').addEventListener('submit',async e=>{e.preventDefault();await api('currencies/save',{method:'POST',body:JSON.stringify({organisation_id:state.orgId,currency_code:$('currency-code').value,currency_name:$('currency-name').value,decimal_places:$('currency-decimals').value})});$('currency-form').hidden=true;await ensureCurrencies(true);renderCurrencies();});
function openNewCurrency(){
  $('currency-form').hidden=false;
  $('currency-form').reset();
  $('currency-decimals').value=2;
}
function openNewCountry(){
  $('country-form').hidden=false;
  $('country-form').reset();
  $('country-currency').value='';
}
function openNewLedgerType(family='gl'){
  $('ledger-type-form').hidden=false;
  $('ledger-family-form').hidden=true;
  $('ledger-type-form').reset();
  $('ledger-type-id').value='';
  $('ledger-type-family').value=family;
  $('ledger-type-active').checked=true;
}
function openNewLedgerFamily(){
  $('ledger-family-form').hidden=false;
  $('ledger-type-form').hidden=true;
  $('ledger-family-form').reset();
  $('ledger-family-code').readOnly=false;
  $('ledger-family-schema').value='{}';
  $('ledger-family-active').checked=true;
}
$('add-currency').addEventListener('click',openNewCurrency);
$('new-currency').addEventListener('click',openNewCurrency);
$('add-country').addEventListener('click',openNewCountry);
$('new-country').addEventListener('click',openNewCountry);
$('country-form').addEventListener('submit',async e=>{e.preventDefault();await api('countries/save',{method:'POST',body:JSON.stringify({organisation_id:state.orgId,country_code:$('country-code').value,alpha3_code:$('country-alpha3').value,numeric_code:$('country-numeric').value,country_name:$('country-name').value,official_name:$('country-official').value,region:$('country-region').value,subregion:$('country-subregion').value,default_currency_code:$('country-currency').value,calling_code:$('country-calling-code').value,postal_code_required:$('country-postal-required').checked,administrative_level_label:$('country-admin-label').value})});$('country-form').hidden=true;await ensureCountries(true);renderCountries();});
$('add-ledger-family').addEventListener('click',openNewLedgerFamily);
$('new-ledger-family').addEventListener('click',openNewLedgerFamily);
$('ledger-family-form').addEventListener('submit',async e=>{e.preventDefault();await api('ledger-families/save',{method:'POST',body:JSON.stringify({organisation_id:state.orgId,ledger_family_code:$('ledger-family-code').value,family_name:$('ledger-family-name').value,requires_standard_account_type:$('ledger-family-standard-type').checked,schema_json:$('ledger-family-schema').value,is_active:$('ledger-family-active').checked})});$('ledger-family-form').hidden=true;await loadMenuData(true);await ensureLedgerTypes(true);renderLedgerFamilies();});
$('new-ledger-type').addEventListener('click',()=>openNewLedgerType($('ledger-type-family').value||'gl'));
$('ledger-type-form').addEventListener('submit',async e=>{e.preventDefault();await api('ledger-types/save',{method:'POST',body:JSON.stringify({account_type_id:$('ledger-type-id').value,organisation_id:state.orgId,ledger_family_code:$('ledger-type-family').value,account_type_code:$('ledger-type-code').value,account_type_name:$('ledger-type-name').value,is_required:$('ledger-type-required').checked,is_active:$('ledger-type-active').checked})});$('ledger-type-form').hidden=true;await ensureLedgerTypes(true);renderLedgerFamilies();});
$('add-transaction-group').addEventListener('click',openNewTransactionGroup);
$('new-transaction-group').addEventListener('click',openNewTransactionGroup);
$('transaction-group-form').addEventListener('submit',async e=>{e.preventDefault();await api('transaction-groups/save',{method:'POST',body:JSON.stringify({transaction_group_id:$('transaction-group-id').value,organisation_id:state.orgId,group_code:$('transaction-group-code').value,group_name:$('transaction-group-name').value,sort_order:$('transaction-group-sort').value,is_active:$('transaction-group-active').checked})});$('transaction-group-form').hidden=true;await ensureTransactionSetup(true);renderTransactionGroups();});
$('add-transaction-type').addEventListener('click',()=>openNewTransactionType().catch(e=>alert(e.message)));
$('new-transaction-type').addEventListener('click',()=>openNewTransactionType().catch(e=>alert(e.message)));
$('add-transaction-line').addEventListener('click',()=>addTransactionTypeLine());
$('transaction-type-financial').addEventListener('change',toggleTransactionLineEditor);
$('transaction-type-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const financial=$('transaction-type-financial').checked;
  const lines=financial?[...document.querySelectorAll('.transaction-type-line')].map(row=>({
    debit_credit:row.querySelector('.tx-line-drcr').value,
    default_gl_account_id:row.querySelector('.tx-line-gl').value,
    requires_subledger:row.querySelector('.tx-line-requires-subledger').checked,
    subledger_family_code:row.querySelector('.tx-line-subledger').value,
    line_description:row.querySelector('.tx-line-description').value
  })):[];
  if(financial&&lines.length<2)return alert('Financial transaction types require at least two transaction lines');
  await api('transaction-types/save',{method:'POST',body:JSON.stringify({
    transaction_type_id:$('transaction-type-id').value,
    organisation_id:state.orgId,
    transaction_group_id:$('transaction-type-group').value,
    type_code:$('transaction-type-code').value,
    type_name:$('transaction-type-name').value,
    type_description:$('transaction-type-description').value,
    is_financial:financial,
    allow_additional_lines:$('transaction-type-additional-lines').checked,
    sort_order:$('transaction-type-sort').value,
    is_active:$('transaction-type-active').checked,
    lines
  })});
  $('transaction-type-form').hidden=true;
  await ensureTransactionSetup(true);
  renderTransactionTypes();
});
$('add-role').addEventListener('click',openNewRole);
$('new-role').addEventListener('click',openNewRole);
$('add-master-permission').addEventListener('click',()=>addPermissionLine('master'));
$('add-transaction-permission').addEventListener('click',()=>addPermissionLine('transaction'));
$('add-role-user').addEventListener('click',()=>addRoleUserLine());
document.querySelectorAll('[data-role-tab]').forEach(button=>button.addEventListener('click',()=>showRoleTab(button.dataset.roleTab)));
$('role-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const master_permissions=[...$('master-permission-lines').querySelectorAll('.permission-line:not(.permission-line-head)')].map(row=>({
    division_id:row.querySelector('.permission-division').value,
    ledger_family_code:row.querySelector('.permission-resource').value,
    workflow_status:row.querySelector('.permission-workflow').value
  }));
  const transaction_permissions=[...$('transaction-permission-lines').querySelectorAll('.permission-line:not(.permission-line-head)')].map(row=>({
    division_id:row.querySelector('.permission-division').value,
    transaction_type_id:row.querySelector('.permission-resource').value,
    workflow_status:row.querySelector('.permission-workflow').value
  }));
  const role_users=[...$('role-user-lines').querySelectorAll('.role-user-line:not(.role-user-line-head)')].map(row=>({
    email:row.querySelector('.role-user-email').value,
    valid_from:row.querySelector('.role-user-from').value,
    valid_to:row.querySelector('.role-user-to').value
  }));
  await api('permissions/save',{method:'POST',body:JSON.stringify({
    organisation_id:state.orgId,
    role_id:$('role-id').value,
    role_name:$('role-name').value,
    role_description:$('role-description').value,
    is_admin:$('role-admin').checked,
    is_active:$('role-active').checked,
    master_permissions,
    transaction_permissions,
    role_users
  })});
  $('role-form').hidden=true;
  await ensurePermissions(true);
  renderRoles();
});
function patchDynamicSelects(){
  option($('journal-type'),state.transactionTypes,'transaction_type_id',t=>`${t.group_name}: ${t.type_name}`,'Manual / none');
  option($('journal-period'),state.periods.filter(p=>['open','soft_closed'].includes(p.status)),'fiscal_period_id',p=>`${p.period_code} (${p.status})`);
}
const originalRenderAll=renderAll;
renderAll=function(){originalRenderAll();patchDynamicSelects();};
setupLegalEntityTabs();
addPanelCloseButtons();
load().catch(e=>alert(e.message));
})();
