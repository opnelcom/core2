(()=>{
const $=id=>document.getElementById(id);
let boot={organisations:[],currencies:[],countries:[],ledger_families:[]};
let state={orgId:null,navigation:{roles:[],modules:[],permissions:[],is_administrator:false},modules:[],currencies:[],countries:[],taxTypes:[],taxRates:[],divisions:[],accounts:[],accountTypes:[],ledgerFamilies:[],ledgerTypes:[],masterTypes:[],masterRecords:[],accountingObjectTypes:[],accountingDimensionTypes:[],accountingObjects:[],accountingDimensions:[],legalEntities:[],legalEntityDetail:null,journals:[],years:[],periods:[],financialFormats:[],financialFormatLines:[],financialFormatMappings:[],transactionGroups:[],transactionTypes:[],postingRules:[],roles:[],rolePermissions:[],roleUsers:[],roleModules:[],dashboardSummary:null};
let selectedMasterRecord=null;
let selectedAccountingObject=null;
let selectedAccountingDimension=null;
let accountingObjectParentOptions=[];
let selectedJournal=null;
let selectedLegalEntity=null;
let selectedLedgerFamilyCode='gl';
let selectedAccountingObjectTypeId='';
let selectedAccountingDimensionTypeId='';
let selectedTransactionTypeId='';
let selectedReport='financial_statement';
let selectedFinancialFormatId='';
let currentIntakeDraft=null;
let expandedFiscalYears=new Set();
let expandedLedgerFamilies=new Set();
let expandedTransactionGroups=new Set();
let loadedAccountFamilies=new Set();
let loadedSlices={menu:false,dashboard:false,divisions:false,fiscal:false,countries:false,currencies:false,taxTypes:false,ledgerTypes:false,masterTypes:false,accountingObjectTypes:false,accountingDimensionTypes:false,legalEntities:false,financialFormats:false,transactions:false,permissions:false};
const today=()=>new Date().toISOString().slice(0,10);
const pretty=v=>String(v||'').replaceAll('_',' ');
const setupViews=new Set(['organisations','divisions','fiscal','countries','currencies','taxtypes','modules','ledgerfamilies','accountingobjecttypes','accountingdimensiontypes','financialformats','transactiongroups','transactiontypes','permissions']);
const masterWorkflowOptions=['view','*','draft','submitted','approved','rejected','blocked','archived','deleted'];
const transactionWorkflowOptions=['view','*','draft','submitted','approved','rejected','blocked','reversed','deleted'];

function sanitizedModuleSvg(value){
  if(!value)return '';
  const parsed=new DOMParser().parseFromString(String(value),'image/svg+xml');
  if(parsed.querySelector('parsererror')||parsed.documentElement.localName!=='svg')return '';
  const tags=new Set(['svg','g','path','circle','rect','line','polyline','polygon','ellipse']);
  const attrs=new Set(['viewBox','d','cx','cy','r','x','y','width','height','x1','y1','x2','y2','points','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','transform','opacity','rx','ry','aria-hidden','role']);
  const clone=node=>{
    if(!tags.has(node.localName))return null;
    const clean=document.createElementNS('http://www.w3.org/2000/svg',node.localName);
    for(const attribute of node.attributes||[]){
      if(attrs.has(attribute.name)&&!/(?:javascript:|url\s*\()/i.test(attribute.value))clean.setAttribute(attribute.name,attribute.value);
    }
    for(const child of node.children||[]){const safe=clone(child);if(safe)clean.appendChild(safe);}
    return clean;
  };
  return clone(parsed.documentElement)?.outerHTML||'';
}
function moduleIconMarkup(value){const svg=sanitizedModuleSvg(value);return svg?`<span class="module-menu-icon" aria-hidden="true">${svg}</span>`:'';}
function renderModuleIconPreview(){
  const preview=$('module-icon-preview');
  if(!preview)return;
  const svg=sanitizedModuleSvg($('module-icon-svg')?.value);
  preview.innerHTML=svg||'<span>No valid SVG preview</span>';
}
function installModuleIconEditor(){
  if($('module-icon-svg'))return;
  const description=$('module-description')?.closest('label');
  if(!description)return;
  const label=document.createElement('label');
  label.textContent='SVG icon';
  const textarea=document.createElement('textarea');
  textarea.id='module-icon-svg';textarea.rows=5;textarea.placeholder='<svg viewBox="0 0 24 24">...</svg>';
  textarea.addEventListener('input',renderModuleIconPreview);
  label.append(textarea);
  const preview=document.createElement('div');preview.id='module-icon-preview';preview.className='module-icon-preview';
  description.insertAdjacentElement('afterend',label);label.insertAdjacentElement('afterend',preview);
}

function panelTransparencyValue(value){
  const number=Number(value);
  if(!Number.isFinite(number))return 0;
  return Math.max(0,Math.min(100,Math.round(number)));
}

function setPanelGlass(enabled,transparency=enabled?60:0){
  const amount=enabled?panelTransparencyValue(transparency):0;
  document.body.classList.toggle('panels-glass',amount>0);
  document.body.style.setProperty('--panel-glass-alpha',String(1-(amount/100)));
}

const panelGlassParams=new URLSearchParams(location.search);
setPanelGlass(panelGlassParams.get('panel_glass')==='1',panelGlassParams.get('panel_transparency')||60);
window.addEventListener('message',event=>{
  if(event.origin!==location.origin)return;
  if(event.data&&event.data.type==='core-saas-panel-glass'){
    setPanelGlass(event.data.enabled,event.data.transparency);
  }
});

function initSidebarResize(){
  const shell=document.querySelector('.erp-shell');
  const handle=$('sidebar-resizer');
  if(!shell||!handle)return;
  const storageKey='erp.sidebarWidth';
  const desktopQuery=window.matchMedia('(min-width:981px)');
  const clampWidth=value=>{
    const max=Math.min(460,Math.max(220,window.innerWidth-420));
    return Math.max(190,Math.min(max,Math.round(value)));
  };
  const applyWidth=value=>{
    if(!desktopQuery.matches)return;
    document.documentElement.style.setProperty('--sidebar-width',`${clampWidth(value)}px`);
  };
  try{
    const saved=Number(window.localStorage.getItem(storageKey));
    if(Number.isFinite(saved))applyWidth(saved);
  }catch{}
  const resetWidth=()=>{
    document.documentElement.style.removeProperty('--sidebar-width');
    try{window.localStorage.removeItem(storageKey);}catch{}
  };
  handle.addEventListener('pointerdown',event=>{
    if(!desktopQuery.matches)return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add('sidebar-resizing');
    const onPointerMove=moveEvent=>applyWidth(moveEvent.clientX);
    const onPointerUp=upEvent=>{
      if(handle.hasPointerCapture?.(upEvent.pointerId))handle.releasePointerCapture(upEvent.pointerId);
      document.body.classList.remove('sidebar-resizing');
      try{
        const width=getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width').trim();
        window.localStorage.setItem(storageKey,String(parseInt(width,10)||250));
      }catch{}
      handle.removeEventListener('pointermove',onPointerMove);
      handle.removeEventListener('pointerup',onPointerUp);
      handle.removeEventListener('pointercancel',onPointerUp);
    };
    handle.addEventListener('pointermove',onPointerMove);
    handle.addEventListener('pointerup',onPointerUp);
    handle.addEventListener('pointercancel',onPointerUp);
  });
  handle.addEventListener('dblclick',resetWidth);
  handle.addEventListener('keydown',event=>{
    if(!desktopQuery.matches)return;
    if(!['ArrowLeft','ArrowRight','Home'].includes(event.key))return;
    event.preventDefault();
    if(event.key==='Home'){resetWidth();return;}
    const current=parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width'),10)||250;
    const next=current+(event.key==='ArrowRight'?16:-16);
    applyWidth(next);
    try{window.localStorage.setItem(storageKey,String(clampWidth(next)));}catch{}
  });
  desktopQuery.addEventListener('change',event=>{
    if(!event.matches)document.documentElement.style.removeProperty('--sidebar-width');
    else{
      try{
        const saved=Number(window.localStorage.getItem(storageKey));
        if(Number.isFinite(saved))applyWidth(saved);
      }catch{}
    }
  });
}

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
function timeOnly(value){
  if(!value)return '';
  const date=new Date(value);
  if(!Number.isNaN(date.getTime()))return date.toLocaleTimeString([],{
    hour:'2-digit',
    minute:'2-digit'
  });
  const match=String(value).match(/T(\d{2}:\d{2})/);
  return match?match[1]:'';
}
function journalDateTime(row){
  const time=timeOnly(row.created_at);
  return time?`${dateOnly(row.journal_date)} ${time}`:dateOnly(row.journal_date);
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
  $('alert-message').textContent=message||'';
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
function selectedModuleIds(id){return [...$(id).selectedOptions].map(option=>option.value);}
function fillModuleSelect(id,selected=[]){
  const select=$(id);if(!select)return;
  option(select,state.modules.filter(module=>module.is_active!==false),'module_id',module=>module.module_name);
  const wanted=new Set(selected||[]);
  [...select.options].forEach(item=>{item.selected=wanted.has(item.value);});
}
function installModuleField(formId,selectId){
  const form=$(formId);if(!form||$(selectId))return;
  const label=document.createElement('label');
  label.textContent='Modules';
  const select=document.createElement('select');
  select.id=selectId;select.multiple=true;select.required=true;select.size=5;
  label.append(select);
  const active=[...form.querySelectorAll('label')].find(item=>item.textContent.includes('Active'));
  form.insertBefore(label,active||form.querySelector('.actions'));
}
function moduleNames(row){
  const ids=new Set(row.module_ids||[]);
  return state.modules.filter(module=>ids.has(module.module_id)).map(module=>module.module_name).join(', ');
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
  el.className='data-grid';
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
  target.classList.add('grid-wrap');
  target.append(el);
}
function currentOrg(){return boot.organisations.find(o=>o.organisation_id===state.orgId)||boot.organisations[0];}
function currentOrganisationId(){
  return state.orgId||$('organisation-select')?.value||'';
}
function setSetupExpanded(expanded){
  $('setup-subnav').hidden=!expanded;
  $('setup-toggle').setAttribute('aria-expanded',expanded?'true':'false');
  $('setup-toggle').classList.toggle('active',expanded&&setupViews.has(document.querySelector('.view:not([hidden])')?.id?.replace('view-','')));
}
function setMenuExpanded(toggleId,subnavId,expanded){
  if(!$(toggleId)||!$(subnavId))return;
  $(subnavId).hidden=!expanded;
  $(toggleId).setAttribute('aria-expanded',expanded?'true':'false');
}
function collapseDynamicMenus(exceptToggleId=''){
  [
    ['subledger-toggle','subledger-subnav'],
    ['object-toggle','object-subnav'],
    ['dimension-toggle','dimension-subnav'],
    ['transaction-toggle','transaction-subnav'],
    ['reports-toggle','reports-subnav']
  ].forEach(([toggleId,subnavId])=>{
    if(toggleId!==exceptToggleId)setMenuExpanded(toggleId,subnavId,false);
  });
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
    collapseDynamicMenus();
    renderDashboard();
    loadDashboardData().catch(e=>alert(e.message));
    return;
  }
  await ensureViewData(view);
  show(view);
  if(view!=='reports'&&view!=='journals')collapseDynamicMenus();
}
function labelForFamily(code){
  const family=state.ledgerFamilies.find(row=>row.ledger_family_code===code);
  return family?.family_name||pretty(code);
}
function ledgerFamilyRequiresLegalEntity(code){
  return !!state.ledgerFamilies.find(row=>row.ledger_family_code===code)?.requires_legal_entity;
}
function labelForTransactionType(id){
  const type=state.transactionTypes.find(row=>row.transaction_type_id===id);
  return type?.type_name||'Transactions';
}
function buildDynamicMenu(){
  const accessibleModules=new Set(state.navigation.modules.map(module=>module.module_id));
  const permissions=state.navigation.permissions||[];
  const hasMaster=permissions.some(permission=>permission.resource_kind==='master_data');
  const hasTransactions=permissions.some(permission=>permission.resource_kind==='transaction');
  const linked=row=>(row.module_ids||[]).some(id=>accessibleModules.has(id));
  const masterAllowed=code=>permissions.some(permission=>permission.resource_kind==='master_data'&&(permission.resource_code==='*'||permission.resource_code===code));
  const transactionAllowed=id=>permissions.some(permission=>permission.resource_kind==='transaction'&&(permission.resource_code==='*'||permission.resource_code===id));
  const families=state.ledgerFamilies.filter(f=>f.is_active!==false&&linked(f)&&masterAllowed(f.ledger_family_code));
  $('subledger-subnav').innerHTML=families.map(f=>`<button type="button" class="nav subnav-item" data-ledger-family="${f.ledger_family_code}">${f.family_name}</button>`).join('');
  $('object-subnav').innerHTML=state.accountingObjectTypes.filter(type=>type.is_active!==false&&hasMaster&&linked(type)).map(type=>`<button type="button" class="nav subnav-item" data-accounting-master="object" data-accounting-type-id="${type.accounting_object_type_id}">${type.type_name}</button>`).join('');
  $('dimension-subnav').innerHTML=state.accountingDimensionTypes.filter(type=>type.is_active!==false&&hasMaster&&linked(type)).map(type=>`<button type="button" class="nav subnav-item" data-accounting-master="dimension" data-accounting-type-id="${type.accounting_dimension_type_id}">${type.type_name}</button>`).join('');
  document.querySelectorAll('[data-ledger-family]').forEach(button=>{
    button.onclick=()=>openLedgerFamily(button.dataset.ledgerFamily).catch(e=>alert(e.message));
  });
  document.querySelectorAll('[data-accounting-master]').forEach(button=>{
    button.onclick=()=>openAccountingMaster(button.dataset.accountingMaster,button.dataset.accountingTypeId).catch(e=>alert(e.message));
  });
  $('transaction-subnav').innerHTML=state.transactionGroups.filter(g=>g.is_active!==false).map(group=>{
    const types=state.transactionTypes.filter(type=>type.transaction_group_id===group.transaction_group_id&&type.is_active!==false&&linked(type)&&transactionAllowed(type.transaction_type_id));
    const expanded=expandedTransactionGroups.has(group.transaction_group_id);
    return `<div class="menu-group"><button type="button" class="nav subnav-item menu-group-toggle" aria-expanded="${expanded?'true':'false'}" data-transaction-group="${group.transaction_group_id}">${group.group_name}</button><div class="transaction-type-group" ${expanded?'':'hidden'}>${types.map(type=>`<button type="button" class="nav subnav-item subnav-depth" data-transaction-type="${type.transaction_type_id}">${type.type_name}</button>`).join('')}</div></div>`;
  }).join('');
  $('technical-menu').querySelector('[data-view="legalentities"]').hidden=!hasMaster;
  $('technical-menu').querySelector('[data-ledger-family="gl"]').hidden=!families.some(f=>f.ledger_family_code==='gl');
  $('subledger-toggle').hidden=!families.some(f=>f.ledger_family_code!=='gl');
  $('object-toggle').hidden=!$('object-subnav').children.length;
  $('dimension-toggle').hidden=!$('dimension-subnav').children.length;
  $('transaction-toggle').hidden=!hasTransactions||!$('transaction-subnav').querySelector('[data-transaction-type]');
  $('reports-toggle').hidden=!(hasMaster||hasTransactions);
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
function alternativeItem(label,attributes){return `<button type="button" class="nav subnav-item subnav-depth" ${attributes}>${label}</button>`;}
function resourcesForModules(moduleIds,{role=null}={}){
  const linked=row=>(row.module_ids||[]).some(id=>moduleIds.has(id));
  const permissions=role?state.navigation.permissions.filter(permission=>permission.role_id===role.role_id):[];
  const masterAllowed=family=>!role||permissions.some(permission=>permission.resource_kind==='master_data'&&(permission.resource_code==='*'||permission.resource_code===family.ledger_family_code));
  const anyMaster=!role||permissions.some(permission=>permission.resource_kind==='master_data');
  const transactionAllowed=type=>!role||permissions.some(permission=>permission.resource_kind==='transaction'&&(permission.resource_code==='*'||permission.resource_code===type.transaction_type_id));
  return [
    ...state.ledgerFamilies.filter(row=>row.is_active!==false&&linked(row)&&masterAllowed(row)).map(row=>alternativeItem(row.family_name,`data-ledger-family="${row.ledger_family_code}"`)),
    ...state.accountingObjectTypes.filter(row=>row.is_active!==false&&linked(row)&&anyMaster).map(row=>alternativeItem(row.type_name,`data-accounting-master="object" data-accounting-type-id="${row.accounting_object_type_id}"`)),
    ...state.accountingDimensionTypes.filter(row=>row.is_active!==false&&linked(row)&&anyMaster).map(row=>alternativeItem(row.type_name,`data-accounting-master="dimension" data-accounting-type-id="${row.accounting_dimension_type_id}"`)),
    ...state.transactionTypes.filter(row=>row.is_active!==false&&linked(row)&&transactionAllowed(row)).map(row=>alternativeItem(row.type_name,`data-transaction-type="${row.transaction_type_id}"`))
  ];
}
function bindAlternativeMenu(menu){
  menu.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>openView(button.dataset.view).catch(error=>alert(error.message)));
  menu.querySelectorAll('[data-ledger-family]').forEach(button=>button.onclick=()=>openLedgerFamily(button.dataset.ledgerFamily).catch(error=>alert(error.message)));
  menu.querySelectorAll('[data-accounting-master]').forEach(button=>button.onclick=()=>openAccountingMaster(button.dataset.accountingMaster,button.dataset.accountingTypeId).catch(error=>alert(error.message)));
  menu.querySelectorAll('[data-transaction-type]').forEach(button=>button.onclick=()=>openTransactionType(button.dataset.transactionType).catch(error=>alert(error.message)));
  menu.querySelectorAll('[data-alternate-group]').forEach(heading=>{
    const toggle=()=>{
      const content=$(heading.getAttribute('aria-controls'));
      const expanded=heading.getAttribute('aria-expanded')==='true';
      heading.setAttribute('aria-expanded',expanded?'false':'true');
      content.hidden=expanded;
      const key=`erp.menuExpanded:${state.orgId}:${heading.dataset.menuKind}`;
      const expandedGroups=expandedMenuGroups(heading.dataset.menuKind);
      if(expanded)expandedGroups.delete(heading.dataset.alternateGroup);else expandedGroups.add(heading.dataset.alternateGroup);
      localStorage.setItem(key,JSON.stringify([...expandedGroups]));
    };
    heading.onclick=toggle;
    heading.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();toggle();}};
  });
}
function expandedMenuGroups(kind){
  try{return new Set(JSON.parse(localStorage.getItem(`erp.menuExpanded:${state.orgId}:${kind}`)||'[]'));}
  catch{return new Set();}
}
function alternativeGroup(kind,id,label,items,iconSvg=''){
  if(!items.length)return '';
  const expanded=expandedMenuGroups(kind).has(id);
  const contentId=`${kind}-menu-group-${id}`;
  return `<div class="alternate-menu-group"><div class="alternate-menu-heading" role="button" tabindex="0" data-menu-kind="${kind}" data-alternate-group="${id}" aria-expanded="${expanded?'true':'false'}" aria-controls="${contentId}"><span class="alternate-menu-label">${moduleIconMarkup(iconSvg)}${label}</span></div><div id="${contentId}" class="alternate-menu-items" ${expanded?'':'hidden'}>${items.join('')}</div></div>`;
}
function buildAlternativeMenus(){
  const hasMaster=(state.navigation.permissions||[]).some(permission=>permission.resource_kind==='master_data');
  const common=`<button type="button" class="nav" data-view="dashboard">Dashboard</button>${hasMaster?'<button type="button" class="nav" data-view="legalentities">Legal Entities</button>':''}`;
  $('module-menu').innerHTML=common+state.navigation.modules.map(module=>{
    const items=resourcesForModules(new Set([module.module_id]));
    return alternativeGroup('module',module.module_id,module.module_name,items,module.module_icon_svg);
  }).join('');
  $('role-menu').innerHTML=common+state.navigation.roles.map(role=>{
    const moduleIds=new Set(role.module_ids||[]);
    const items=resourcesForModules(moduleIds,{role});
    return alternativeGroup('role',role.role_id,role.role_name,items);
  }).join('');
  bindAlternativeMenu($('module-menu'));bindAlternativeMenu($('role-menu'));
  syncSetupAccess();
  applyMenuMode(localStorage.getItem('erp.menuMode')||'module');
}
function syncSetupAccess(){
  const allowed=state.navigation?.is_administrator===true;
  $('sidebar-setup-footer').hidden=!allowed;
  if(!allowed)setSetupExpanded(false);
}
function applyMenuMode(mode){
  const selected=['technical','module','role'].includes(mode)?mode:'module';
  $('technical-menu').hidden=selected!=='technical';$('module-menu').hidden=selected!=='module';$('role-menu').hidden=selected!=='role';
  document.querySelectorAll('[data-menu-mode]').forEach(tab=>{const active=tab.dataset.menuMode===selected;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',active?'true':'false');});
  localStorage.setItem('erp.menuMode',selected);
  highlightDynamicMenu();
}
function highlightDynamicMenu(){
  document.querySelectorAll('[data-ledger-family]').forEach(button=>button.classList.toggle('active',button.dataset.ledgerFamily===selectedLedgerFamilyCode&&!$('view-accounts').hidden));
  document.querySelectorAll('[data-accounting-master]').forEach(button=>{
    const selectedType=button.dataset.accountingMaster==='object'?selectedAccountingObjectTypeId:selectedAccountingDimensionTypeId;
    button.classList.toggle('active',button.dataset.accountingTypeId===selectedType&&!$(`view-accounting${button.dataset.accountingMaster}s`).hidden);
  });
  document.querySelectorAll('[data-transaction-type]').forEach(button=>button.classList.toggle('active',button.dataset.transactionType===selectedTransactionTypeId&&!$('view-journals').hidden));
  document.querySelectorAll('[data-report-view]').forEach(button=>button.classList.toggle('active',button.dataset.reportView===selectedReport&&!$('view-reports').hidden));
  $('subledger-toggle').classList.toggle('active',!$('view-accounts').hidden&&selectedLedgerFamilyCode&&selectedLedgerFamilyCode!=='gl');
  $('object-toggle').classList.toggle('active',!$('view-accountingobjects').hidden);
  $('dimension-toggle').classList.toggle('active',!$('view-accountingdimensions').hidden);
  $('transaction-toggle').classList.toggle('active',!$('view-journals').hidden);
  $('reports-toggle')?.classList.toggle('active',!$('view-reports').hidden);
}
async function openAccountingMaster(kind,typeId=''){
  const view=kind==='object'?'accountingobjects':'accountingdimensions';
  selectedLedgerFamilyCode='';
  if(kind==='object')selectedAccountingObjectTypeId=typeId||selectedAccountingObjectTypeId;
  else selectedAccountingDimensionTypeId=typeId||selectedAccountingDimensionTypeId;
  selectedTransactionTypeId='';
  await ensureViewData(view);
  const config=accountingMasterConfig(kind);
  if(typeId)$(`${config.prefix}-type-select`).value=typeId;
  await loadAccountingMasterRecords(kind);
  show(view);
  setMenuExpanded(kind==='object'?'object-toggle':'dimension-toggle',kind==='object'?'object-subnav':'dimension-subnav',true);
  collapseDynamicMenus(kind==='object'?'object-toggle':'dimension-toggle');
  $('page-title').textContent=kind==='object'?'Accounting Objects':'Accounting Dimensions';
  highlightDynamicMenu();
}
async function openLedgerFamily(familyCode){
  await Promise.all([loadMenuData(),ensureDivisions(),ensureLedgerTypes(),ensureLegalEntities()]);
  selectedLedgerFamilyCode=familyCode;
  selectedAccountingObjectTypeId='';
  selectedAccountingDimensionTypeId='';
  selectedTransactionTypeId='';
  $('account-form-family').value=familyCode;
  $('account-form').hidden=true;
  show('accounts');
  if(familyCode==='gl')collapseDynamicMenus();
  else{
    setMenuExpanded('subledger-toggle','subledger-subnav',true);
    collapseDynamicMenus('subledger-toggle');
  }
  const title=familyCode==='gl'?'GL Accounts':labelForFamily(familyCode);
  $('page-title').textContent=title;
  $('account-grid-title').textContent=title;
  await loadAccountsForFamily(familyCode);
  renderAccounts();
  highlightDynamicMenu();
}
async function openTransactionType(typeId){
  await Promise.all([ensureTransactionSetup(),ensureDivisions(),ensureFiscal()]);
  selectedTransactionTypeId=typeId;
  selectedLedgerFamilyCode='';
  selectedAccountingObjectTypeId='';
  selectedAccountingDimensionTypeId='';
  const type=state.transactionTypes.find(row=>row.transaction_type_id===typeId);
  if(type?.transaction_group_id)expandedTransactionGroups.add(type.transaction_group_id);
  $('journal-form').hidden=true;
  show('journals');
  setMenuExpanded('transaction-toggle','transaction-subnav',true);
  collapseDynamicMenus('transaction-toggle');
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
  selectedAccountingObjectTypeId='';
  selectedAccountingDimensionTypeId='';
  selectedTransactionTypeId='';
  show('reports');
  setMenuExpanded('reports-toggle','reports-subnav',true);
  collapseDynamicMenus('reports-toggle');
  const titles={financial_statement:'Financial Statement',ledger:'Ledger Balances'};
  $('page-title').textContent=titles[report]||'Reports';
  $('report-title').textContent=titles[report]||'Reports';
  const financial=report==='financial_statement';
  ['report-format-label','report-period-from-label','report-period-to-label','report-compare-year-label','report-compare-period-from-label','report-compare-period-to-label'].forEach(id=>$(id).hidden=!financial);
  $('report-division-label').hidden=false;
  fillReportFormatSelect();
  fillReportPeriodSelects();
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
  option($('report-compare-year'),state.years,'fiscal_year_id',y=>y.fiscal_year_code,'None');
  [$('org-currency')].forEach(s=>option(s,currencies,'currency_code',c=>`${c.currency_code} - ${c.currency_name}`));
  [$('account-form-family'),$('master-family'),$('account-subledger-family'),$('ledger-type-family')].forEach(s=>option(s,families.filter(f=>f.is_active!==false),'ledger_family_code',f=>`${f.ledger_family_code} - ${f.family_name}`,s?.id==='account-subledger-family'?'None':''));
  if(!$('account-form-family').value||$('account-form-family').value==='bank')$('account-form-family').value='gl';
  $('account-form-family').disabled=true;
}
function fillDivisionSelects(){
  const label=d=>`${'  '.repeat(Number(d.depth)||0)}${d.division_code} - ${d.division_name}`;
  [$('division-parent'),$('account-division'),$('master-division'),$('journal-division'),$('accounting-object-division'),$('accounting-dimension-division')].forEach(s=>option(s,state.divisions,'division_id',label,s?.id==='division-parent'?'Root division':''));
  option($('report-division'),state.divisions,'division_id',label,'All divisions');
  document.querySelectorAll('.permission-division').forEach(s=>option(s,state.divisions,'division_id',label,'Select division'));
}
function periodsForYear(yearId){
  return state.periods.filter(period=>period.fiscal_year_id===yearId).sort((a,b)=>Number(a.period_number)-Number(b.period_number));
}
function fiscalPeriodForDate(dateValue){
  const date=dateOnly(dateValue);
  if(!date)return null;
  return state.periods.find(period=>date>=dateOnly(period.start_date)&&date<=dateOnly(period.end_date))||null;
}
function syncJournalPeriodToDate(){
  const period=fiscalPeriodForDate($('journal-date')?.value);
  if(period)$('journal-period').value=period.fiscal_period_id;
  else $('journal-period').value='';
}
function fillReportPeriodRange(yearSelectId,fromId,toId){
  const periods=periodsForYear($(yearSelectId)?.value);
  option($(fromId),periods,'fiscal_period_id',p=>`${p.period_number} - ${p.period_code}`,'Select period');
  option($(toId),periods,'fiscal_period_id',p=>`${p.period_number} - ${p.period_code}`,'Select period');
  if(periods[0]&&!$(fromId).value)$(fromId).value=periods[0].fiscal_period_id;
  if(periods.at(-1)&&!$(toId).value)$(toId).value=periods.at(-1).fiscal_period_id;
}
function fillReportPeriodSelects(){
  fillReportPeriodRange('report-year','report-period-from','report-period-to');
  fillReportPeriodRange('report-compare-year','report-compare-period-from','report-compare-period-to');
}
function fillReportFormatSelect(){
  const active=state.financialFormats.filter(format=>format.is_active!==false);
  option($('report-format'),active,'financial_statement_format_id',format=>`${format.format_name} (${pretty(format.statement_type)})`,'Select format');
  if(selectedFinancialFormatId&&active.some(format=>format.financial_statement_format_id===selectedFinancialFormatId))$('report-format').value=selectedFinancialFormatId;
  selectedFinancialFormatId=$('report-format').value||'';
}
function fillAccountSelects(){
  const gl=state.accounts.filter(a=>a.ledger_family_code==='gl');
  option($('master-ledger-account'),state.accounts.filter(a=>a.ledger_family_code!=='gl'),'ledger_account_id',a=>`${a.account_code} - ${a.account_name}`,'None');
  document.querySelectorAll('.line-gl').forEach(s=>{
    const value=s.value;
    option(s,gl,'ledger_account_id',a=>`${a.account_code} - ${a.account_name}`,'Select GL account');
    s.value=value;
  });
  document.querySelectorAll('.journal-line:not(.journal-line-head)').forEach(syncJournalLineSubledgerOptions);
}
function subledgerFamilyForJournalLine(row){
  const setupFamily=row.dataset.subledgerFamily||'';
  if(setupFamily)return setupFamily;
  const glAccount=state.accounts.find(account=>account.ledger_account_id===row.querySelector('.line-gl')?.value);
  if(glAccount?.requires_subledger&&glAccount.required_subledger_family_code)return glAccount.required_subledger_family_code;
  return '';
}
function syncJournalLineSubledgerOptions(row){
  const subledger=row.querySelector('.line-sub');
  if(!subledger)return;
  const value=subledger.value;
  const family=subledgerFamilyForJournalLine(row);
  const accounts=state.accounts.filter(account=>account.ledger_family_code!=='gl'&&(!family||account.ledger_family_code===family));
  option(subledger,accounts,'ledger_account_id',account=>`${account.account_name} (${account.account_code})`,'None');
  subledger.value=accounts.some(account=>account.ledger_account_id===value)?value:'';
}
function fillLegalEntitySelects(){
  option($('account-legal-entity'),state.legalEntities,'legal_entity_id',e=>`${e.known_name} - ${e.legal_name}`,'None');
  document.querySelectorAll('.relationship-entity').forEach(select=>option(select,state.legalEntities.filter(e=>e.legal_entity_id!==selectedLegalEntity),'legal_entity_id',e=>`${e.known_name} - ${e.legal_name}`,'Select legal entity'));
}
function setRequiredMarker(label,required){
  if(!label)return;
  let marker=label.querySelector(':scope > .required-marker');
  if(required&&!marker){
    marker=document.createElement('span');
    marker.className='required-marker';
    marker.textContent='*';
    const textNode=[...label.childNodes].find(node=>node.nodeType===Node.TEXT_NODE&&node.textContent.trim());
    if(textNode)textNode.after(marker);
    else label.prepend(marker);
  }else if(!required&&marker){
    marker.remove();
  }
}
function syncRequiredMarkers(root=document){
  root.querySelectorAll('label').forEach(label=>{
    const required=label.classList.contains('required')||!!label.querySelector('input[required],select[required],textarea[required]');
    setRequiredMarker(label,required);
  });
}
function updateAccountLegalEntityRequirement(){
  const required=ledgerFamilyRequiresLegalEntity($('account-form-family').value||selectedLedgerFamilyCode||'gl');
  $('account-legal-entity').required=required;
  $('account-legal-entity').closest('label')?.classList.toggle('required',required);
  syncRequiredMarkers($('account-form'));
}
function formatBytes(bytes){
  const size=Number(bytes)||0;
  if(size<1024)return `${size} B`;
  if(size<1024*1024)return `${Math.ceil(size/1024)} KB`;
  return `${(size/(1024*1024)).toFixed(1)} MB`;
}
function readFileDataUrl(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(reader.error||new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}
const documentTargets={
  account:{kind:'ledger_account',id:()=>$('account-id').value,list:'account-document-list',file:'account-document-file'},
  master:{kind:'master_data_record',id:()=>$('master-record-id').value,list:'master-document-list',file:'master-document-file'},
  journal:{kind:'journal',id:()=>$('journal-id').value,list:'journal-document-list',file:'journal-document-file'},
  legalEntity:{kind:'legal_entity',id:()=>$('legal-entity-id').value,list:'legal-entity-document-list',file:'legal-entity-document-file'}
};
async function loadEntityDocuments(targetKey){
  const target=documentTargets[targetKey];
  const list=$(target.list);
  const entityId=target.id();
  if(!entityId){
    list.innerHTML='<p class="empty">Save the record before uploading documents.</p>';
    return;
  }
  list.innerHTML='<p class="empty">Loading documents...</p>';
  const params=new URLSearchParams({organisation_id:state.orgId,entity_kind:target.kind,entity_id:entityId});
  const r=await api(`documents/list?${params.toString()}`);
  const docs=r.documents||[];
  if(!docs.length){
    list.innerHTML='<p class="empty">No documents uploaded.</p>';
    return;
  }
  list.innerHTML='';
  docs.forEach(doc=>{
    const row=document.createElement('article');
    row.className='document-row';
    const link=document.createElement('a');
    link.href=doc.data_url;
    link.download=doc.file_name;
    link.textContent=doc.file_name;
    const meta=document.createElement('small');
    meta.textContent=`${doc.document_type||'other'} - ${doc.mime_type} - ${formatBytes(doc.file_size)}`;
    const del=document.createElement('button');
    del.type='button';
    del.className='secondary document-delete';
    del.textContent='Delete';
    del.addEventListener('click',async()=>{
      if(!confirm(`Delete document "${doc.file_name}"?`))return;
      await api('documents/delete',{method:'POST',body:JSON.stringify({document_id:doc.document_id})});
      await loadEntityDocuments(targetKey);
    });
    row.append(link,meta,del);
    list.append(row);
  });
}
async function uploadEntityDocument(targetKey){
  const target=documentTargets[targetKey];
  const entityId=target.id();
  if(!entityId)return alert('Save the record before uploading documents.');
  const input=$(target.file);
  const file=input.files&&input.files[0];
  if(!file)return;
  try{
    if(file.size>10*1024*1024)throw new Error('Document must be 10MB or smaller');
    const dataUrl=await readFileDataUrl(file);
    await api('documents/upload',{method:'POST',body:JSON.stringify({
      organisation_id:state.orgId,
      entity_kind:target.kind,
      entity_id:entityId,
      document_type:'other',
      file_name:file.name,
      data_url:dataUrl
    })});
    input.value='';
    await loadEntityDocuments(targetKey);
  }catch(error){
    alert(error.message);
  }
}
function syncIntakeFieldsFromJson(){
  let draft;
  try{
    draft=JSON.parse($('intake-json').value||'{}');
  }catch{
    return;
  }
  draft.legal_entity=draft.legal_entity||{};
  draft.legal_entity.entity_type=$('intake-entity-type').value||'company';
  draft.legal_entity.legal_name=$('intake-legal-name').value;
  draft.legal_entity.known_name=$('intake-known-name').value;
  draft.legal_entity.effective_from=$('intake-effective-from').value||null;
  draft.legal_entity.effective_to=$('intake-effective-to').value||null;
  $('intake-json').value=JSON.stringify(draft,null,2);
  currentIntakeDraft=draft;
}
function populateIntakeReview(intake){
  const draft=intake.extracted_json||{};
  const entity=draft.legal_entity||{};
  currentIntakeDraft=draft;
  $('intake-id').value=intake.intake_id||'';
  $('intake-entity-type').value=entity.entity_type||'company';
  $('intake-legal-name').value=entity.legal_name||'';
  $('intake-known-name').value=entity.known_name||entity.legal_name||'';
  $('intake-effective-from').value=dateOnly(entity.effective_from);
  $('intake-effective-to').value=dateOnly(entity.effective_to);
  $('intake-confidence').value=`${Math.round((Number(draft.confidence)||0)*100)}%`;
  $('intake-json').value=JSON.stringify(draft,null,2);
  $('intake-review').hidden=false;
  const notes=(draft.notes||[]).filter(Boolean);
  $('intake-status').textContent=notes.length?notes.join(' '):'Review the extracted details before creating the legal entity.';
}
function closeDocumentIntake(){
  $('intake-modal').hidden=true;
}
function openDocumentIntake(target){
  const labels={
    legal_entity:'legal entity',
    ledger_account:`${labelForFamily(selectedLedgerFamilyCode||'gl')} entry`,
    journal:`${selectedTransactionTypeId?labelForTransactionType(selectedTransactionTypeId):'transaction'}`
  };
  $('intake-modal').hidden=false;
  $('intake-title').textContent=`Create ${labels[target]||'record'} from Document`;
  $('intake-subtitle').textContent=target==='legal_entity'
    ? 'Upload a source document, review the extracted draft, then create the legal entity.'
    : 'Document analysis for this target will use the same review flow in the next implementation slice.';
  $('intake-target-kind').value=target;
  $('intake-id').value='';
  $('intake-file').value='';
  $('intake-status').textContent=target==='legal_entity'?'Choose a document to analyse.':'Only legal entity intake is implemented in this step.';
  $('intake-review').hidden=true;
  currentIntakeDraft=null;
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
  option($('account-type'),state.accountTypes.filter(t=>t.ledger_family_code===family),'account_type_id',t=>`${t.account_type_code} - ${t.account_type_name}`,'Select type');
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
function detailFieldType(field={}){
  const type=field.type||field.uiType||field['x-ui-type']||'string';
  if(['text','short_text','long_text','textarea'].includes(type))return type;
  return type;
}
function detailFieldWidth(field={}){
  const width=field.uiWidth||field.width||field['x-width']||field['x-ui-width']||'medium';
  if(['short','medium','wide','full'].includes(width))return width;
  if(detailFieldType(field)==='short_text')return 'short';
  if(['long_text','textarea'].includes(detailFieldType(field)))return 'full';
  return 'medium';
}
function detailInputType(field){
  if(field.format==='date')return 'date';
  if(field.format==='date-time')return 'datetime-local';
  if(detailFieldType(field)==='number'||detailFieldType(field)==='integer')return 'number';
  return 'text';
}
function detailEnumOptions(field){
  if(Array.isArray(field.options))return field.options.map(item=>{
    if(typeof item==='object')return {
      value:item.code??item.value??'',
      label:item.description??item.label??item.name??item.code??item.value??''
    };
    return {value:item,label:String(item)};
  });
  if(Array.isArray(field.enum))return field.enum.map((item,index)=>({value:item,label:field.enumNames?.[index]||String(item)}));
  return [];
}
function renderDetailInput(name,field,value,required){
  const label=document.createElement('label');
  label.className=`detail-field detail-field--${detailFieldWidth(field)}`;
  label.textContent=field.title||pretty(name);
  if(field.description)label.title=field.description;
  const enumOptions=detailEnumOptions(field);
  if(enumOptions.length){
    const select=document.createElement('select');
    select.dataset.detailField=name;
    if(!required){
      const blank=document.createElement('option');
      blank.value='';
      blank.textContent='None';
      select.append(blank);
    }
    enumOptions.forEach(item=>{
      const option=document.createElement('option');
      option.value=String(item.value);
      option.textContent=item.label||String(item.value);
      select.append(option);
    });
    select.value=value??'';
    label.append(select);
    return label;
  }
  if(detailFieldType(field)==='boolean'){
    label.className=`check detail-field detail-field--${detailFieldWidth(field)}`;
    const input=document.createElement('input');
    input.type='checkbox';
    input.dataset.detailField=name;
    input.checked=!!value;
    label.prepend(input);
    return label;
  }
  const fieldType=detailFieldType(field);
  const input=(fieldType==='object'||fieldType==='array'||fieldType==='long_text'||fieldType==='textarea'||field.format==='textarea')?document.createElement('textarea'):document.createElement('input');
  input.dataset.detailField=name;
  if(input.tagName==='INPUT')input.type=detailInputType(field);
  if(fieldType==='integer')input.step='1';
  input.value=(fieldType==='object'||fieldType==='array')?JSON.stringify(value??(fieldType==='array'?[]:{}),null,2):(value??'');
  label.append(input);
  return label;
}
function showAccountDetailTab(container,id){
  container.querySelectorAll('[data-account-detail-tab]').forEach(button=>button.classList.toggle('active',button.dataset.accountDetailTab===id));
  container.querySelectorAll('[data-account-detail-panel]').forEach(panel=>{panel.hidden=panel.dataset.accountDetailPanel!==id;});
}
function showAccountFixedTab(id){
  document.querySelectorAll('[data-account-fixed-tab]').forEach(button=>button.classList.toggle('active',button.dataset.accountFixedTab===id));
  document.querySelectorAll('[data-account-fixed-panel]').forEach(panel=>{panel.hidden=panel.dataset.accountFixedPanel!==id;});
}
function renderSchemaDetailFields(containerId,schema,detail={}){
  const container=$(containerId);
  if(!container)return;
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
    syncRequiredMarkers(container);
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
  syncRequiredMarkers(container);
}
function renderAccountDetailFields(detail={}){
  renderSchemaDetailFields('account-detail-fields',selectedAccountFamilySchema(),detail);
}
function collectSchemaDetail(containerId,schema){
  const container=$(containerId);
  const raw=container?.querySelector('[data-detail-raw]');
  if(raw){
    try{return JSON.parse(raw.value||'{}');}
    catch{throw new Error('Additional data JSON must be valid JSON');}
  }
  const properties=schema?.properties||{};
  const detail={};
  container?.querySelectorAll('[data-detail-field]').forEach(input=>{
    const name=input.dataset.detailField;
    const field=properties[name]||{};
    const fieldType=detailFieldType(field);
    if(input.type==='checkbox')detail[name]=input.checked;
    else if(fieldType==='number')detail[name]=input.value===''?null:Number(input.value);
    else if(fieldType==='integer')detail[name]=input.value===''?null:parseInt(input.value,10);
    else if(fieldType==='object'||fieldType==='array'){
      try{detail[name]=JSON.parse(input.value||null);}
      catch{throw new Error(`${field.title||pretty(name)} must be valid JSON`);}
    }else detail[name]=input.value;
  });
  return detail;
}
function collectAccountDetail(){
  return collectSchemaDetail('account-detail-fields',selectedAccountFamilySchema());
}
function openAccountEditor(account={}){
  const family=selectedLedgerFamilyCode||account.ledger_family_code||'gl';
  $('account-form').hidden=false;
  $('account-form').reset();
  showAccountFixedTab('identification');
  $('account-id').value=account.ledger_account_id||'';
  $('account-form-family').value=family;
  $('account-form-family').disabled=true;
  $('account-division').value=account.owner_division_id||'';
  $('account-code').value=account.account_code||'';
  $('account-name').value=account.account_name||'';
  $('account-legal-entity').value=account.legal_entity_id||'';
  $('account-requires-subledger').checked=!!account.requires_subledger;
  $('account-subledger-family').value=account.required_subledger_family_code||'';
  fillAccountTypes();
  $('account-type').value=account.account_type_id||'';
  updateAccountLegalEntityRequirement();
  renderAccountDetailFields(account.additional_data||{});
  loadEntityDocuments('account').catch(e=>alert(e.message));
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
    'tax-type-form',
    'ledger-family-form',
    'ledger-type-form',
    'financial-format-form',
    'transaction-group-form',
    'transaction-type-form',
    'role-form',
    'account-form',
    'accounting-object-form',
    'accounting-dimension-form',
    'accounting-object-type-form',
    'accounting-dimension-type-form',
    'legal-entity-form',
    'master-record-form',
    'journal-form'
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
async function claimErpAdmin(){
  if(!state.orgId)return;
  if(!confirm('Assign your email to the Security Administrator role for this organisation?'))return;
  const result=await api('permissions/claim-admin',{method:'POST',body:JSON.stringify({organisation_id:state.orgId})});
  loadedSlices.permissions=false;
  await Promise.all([loadDashboardData(true),loadMenuData(true)]);
  alert(`Security Administrator access assigned to ${result.email}.`);
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
  const showClaimAdmin=org&&summary&&Number(summary.admin_users||0)===0;
  $('metrics').innerHTML=cards.map(([k,v])=>`<article class="metric"><span>${k}</span><strong>${v}</strong></article>`).join('');
  $('org-summary').innerHTML=org?`<p><b>${org.organisation_name}</b></p><p>Code: ${org.organisation_code}</p><p>Base currency: ${org.base_currency_code}</p><p>Status: ${pretty(org.workflow_status)}</p>${showClaimAdmin?'<div class="actions"><button type="button" id="claim-erp-admin">Assign Security Administrator</button></div>':''}`:'';
  $('claim-erp-admin')?.addEventListener('click',()=>claimErpAdmin().catch(e=>alert(e.message)));
}
function resetOrgOpenAIFields(){
  $('org-openai-model').value='gpt-4.1-mini';
  $('org-openai-key').value='';
  $('org-openai-clear').checked=false;
  $('org-openai-status').textContent='No API key saved.';
}
async function loadOrgOpenAISetting(orgId){
  resetOrgOpenAIFields();
  if(!orgId)return;
  try{
    const setting=await api(`setup/openai?organisation_id=${encodeURIComponent(orgId)}`);
    $('org-openai-model').value=setting.model||'gpt-4.1-mini';
    $('org-openai-status').textContent=setting.has_openai_api_key?'OpenAI API key saved.':'No API key saved.';
  }catch(error){
    $('org-openai-status').textContent=error.message;
  }
}
async function saveOrgOpenAISetting(orgId){
  if(!orgId)return;
  const apiKey=$('org-openai-key').value;
  const clear=$('org-openai-clear').checked;
  const model=$('org-openai-model').value||'gpt-4.1-mini';
  await api('setup/openai',{method:'POST',body:JSON.stringify({
    organisation_id:orgId,
    model,
    openai_api_key:apiKey,
    clear_openai_api_key:clear
  })});
  $('org-openai-key').value='';
  $('org-openai-clear').checked=false;
  await loadOrgOpenAISetting(orgId);
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
    loadOrgOpenAISetting(r.organisation_id);
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
function ratesForTaxType(taxTypeId){
  return (state.taxRates||[]).filter(rate=>rate.tax_type_id===taxTypeId).sort((a,b)=>dateOnly(b.valid_from).localeCompare(dateOnly(a.valid_from)));
}
function taxDirectionLabel(direction){
  return {output:'Output VAT',input:'Input VAT',none:'No VAT return amount'}[direction]||'No VAT return amount';
}
function renderTaxTypes(){
  const term=searchTerm('tax-type-search');
  const rows=(state.taxTypes||[]).filter(row=>rowMatches(row,term));
  const target=$('tax-type-list');
  if(!rows.length){target.innerHTML='<p class="empty">No tax types match the search.</p>';return;}
  const el=document.createElement('table');
  el.className='tax-type-table';
  el.innerHTML='<thead><tr><th>Code</th><th>Description</th><th>Direction</th><th>Current Rate</th><th>Active</th></tr></thead>';
  const body=document.createElement('tbody');
  rows.forEach(type=>{
    const row=document.createElement('tr');
    row.className='click-row';
    const current=ratesForTaxType(type.tax_type_id).find(rate=>rate.is_active!==false&&dateOnly(rate.valid_from)<=today()&&(!rate.valid_to||dateOnly(rate.valid_to)>=today()));
    row.innerHTML=`<td>${type.tax_type_code}</td><td>${type.tax_type_description}</td><td>${taxDirectionLabel(type.tax_direction)}</td><td>${current?`${Number(current.tax_rate).toFixed(2)}%`:''}</td><td>${type.is_active?'Yes':'No'}</td>`;
    row.addEventListener('click',()=>openTaxTypeEditor(type));
    body.append(row);
  });
  el.append(body);
  target.innerHTML='';
  target.append(el);
}
function renderTaxRateLines(rates=[]){
  const target=$('tax-rate-lines');
  target.innerHTML='<div class="tax-rate-line-grid"><div class="tax-rate-line tax-rate-line-head"><span>Rate %</span><span>Valid From</span><span>Valid To</span><span>Active</span><span></span></div></div>';
  rates.forEach(rate=>addTaxRateLine(rate));
}
function addTaxRateLine(rate={}){
  const grid=$('tax-rate-lines').querySelector('.tax-rate-line-grid');
  const row=document.createElement('div');
  row.className='tax-rate-line';
  row.dataset.taxRateId=rate.tax_rate_id||'';
  row.innerHTML='<input class="tax-rate-value" type="number" step="0.0001" min="0" required><input class="tax-rate-from" type="date" required><input class="tax-rate-to" type="date"><label class="check"><input class="tax-rate-active" type="checkbox" checked> Active</label><button type="button" class="secondary danger">Delete</button>';
  grid.append(row);
  row.querySelector('.tax-rate-value').value=rate.tax_rate??0;
  row.querySelector('.tax-rate-from').value=dateOnly(rate.valid_from)||today();
  row.querySelector('.tax-rate-to').value=dateOnly(rate.valid_to);
  row.querySelector('.tax-rate-active').checked=rate.is_active!==false;
  row.querySelector('button').addEventListener('click',async()=>{
    const id=row.dataset.taxRateId;
    if(id){
      if(!window.confirm('Delete this tax rate?'))return;
      await api('tax-types/delete-rate',{method:'POST',body:JSON.stringify({tax_rate_id:id})});
      await ensureTaxTypes(true);
      renderTaxTypes();
    }
    row.remove();
  });
}
function openTaxTypeEditor(type={}){
  $('tax-type-form').hidden=false;
  $('tax-type-form').reset();
  $('tax-type-id').value=type.tax_type_id||'';
  $('tax-type-code').value=type.tax_type_code||'';
  $('tax-type-description').value=type.tax_type_description||'';
  $('tax-type-direction').value=type.tax_direction||'none';
  $('tax-type-active').checked=type.is_active!==false;
  renderTaxRateLines(ratesForTaxType(type.tax_type_id));
}
function openNewTaxType(){
  openTaxTypeEditor({is_active:true});
  renderTaxRateLines([{tax_rate:0,valid_from:today(),is_active:true}]);
}
function collectTaxRateLines(){
  return [...document.querySelectorAll('.tax-rate-line:not(.tax-rate-line-head)')].map(row=>({
    tax_rate_id:row.dataset.taxRateId||'',
    tax_rate:row.querySelector('.tax-rate-value').value,
    valid_from:row.querySelector('.tax-rate-from').value,
    valid_to:row.querySelector('.tax-rate-to').value,
    is_active:row.querySelector('.tax-rate-active').checked
  }));
}
function renderLedgerFamilies(){
  const term=searchTerm('ledgerfamily-search');
  const matchingTypeFamilies=new Set((state.ledgerTypes||[]).filter(type=>rowMatches(type,term)).map(type=>type.ledger_family_code));
  const rows=(state.ledgerFamilies||[]).filter(row=>rowMatches(row,term)||matchingTypeFamilies.has(row.ledger_family_code));
  const target=$('ledger-family-list');
  if(!rows.length){target.innerHTML='<p class="empty">No subledger account types match the search.</p>';return;}
  const el=document.createElement('table');
  el.className='ledger-family-table';
  el.innerHTML='<thead><tr><th></th><th>Code</th><th>Name</th><th>Modules</th><th>Standard type</th><th>Legal entity</th><th>Active</th></tr></thead>';
  const body=document.createElement('tbody');
  rows.forEach(family=>{
    const row=document.createElement('tr');
    row.className='click-row';
    const expanded=expandedLedgerFamilies.has(family.ledger_family_code);
    row.innerHTML=`<td><button type="button" class="mini-toggle" aria-label="${expanded?'Collapse':'Expand'} ${family.ledger_family_code}">${expanded?'v':'>'}</button></td><td>${family.ledger_family_code}</td><td>${family.family_name}</td><td>${moduleNames(family)}</td><td>${family.requires_standard_account_type?'Yes':'No'}</td><td>${family.requires_legal_entity?'Required':'Optional'}</td><td>${family.is_active?'Yes':'No'}</td>`;
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
      cell.colSpan=7;
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
function renderModules(){
  const rows=state.modules.filter(row=>rowMatches(row,searchTerm('module-search')));
  table($('module-list'),[['Code',r=>r.module_code],['Name',r=>r.module_name],['Description',r=>r.module_description||''],['Active',r=>r.is_active?'Yes':'No']],rows,openModule);
}
function openModule(row={}){
  $('module-form').hidden=false;$('module-form').reset();
  $('module-id').value=row.module_id||'';$('module-code').value=row.module_code||'';$('module-code').readOnly=!!row.module_id;
  $('module-name').value=row.module_name||'';$('module-description').value=row.module_description||'';$('module-sort').value=row.sort_order||0;$('module-active').checked=row.is_active!==false;
  $('module-icon-svg').value=row.module_icon_svg||'';renderModuleIconPreview();
}
function selectLedgerFamily(family){
  $('ledger-family-form').hidden=false;
  $('ledger-type-form').hidden=true;
  $('ledger-family-code').value=family.ledger_family_code;
  $('ledger-family-code').readOnly=true;
  $('ledger-family-name').value=family.family_name;
  $('ledger-family-standard-type').checked=!!family.requires_standard_account_type;
  $('ledger-family-legal-entity').checked=!!family.requires_legal_entity;
  $('ledger-family-schema').value=JSON.stringify(family.schema_json||{},null,2);
  $('ledger-family-active').checked=!!family.is_active;
  fillModuleSelect('ledger-family-modules',family.module_ids);
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
function mappingsForLine(lineId){
  return state.financialFormatMappings.filter(mapping=>mapping.financial_statement_line_id===lineId);
}
function renderFinancialFormats(){
  const rows=state.financialFormats.filter(row=>rowMatches(row,searchTerm('financial-format-search')));
  table($('financial-format-list'),[['Code',r=>r.format_code],['Name',r=>r.format_name],['Type',r=>pretty(r.statement_type)],['Active',r=>r.is_active?'Yes':'No']],rows,openFinancialFormatEditor);
}
function openFinancialFormatEditor(format={}){
  selectedFinancialFormatId=format.financial_statement_format_id||'';
  $('financial-format-form').hidden=false;
  $('financial-format-form').reset();
  $('financial-format-id').value=format.financial_statement_format_id||'';
  $('financial-format-code').value=format.format_code||'';
  $('financial-format-name').value=format.format_name||'';
  $('financial-format-type').value=format.statement_type||'income';
  $('financial-format-active').checked=format.is_active!==false;
  const lines=state.financialFormatLines.filter(line=>line.financial_statement_format_id===format.financial_statement_format_id);
  renderFinancialFormatLines(lines.length?lines:[{line_code:'REV',line_label:'Revenue',line_type:'account_group',sort_order:100,is_active:true}]);
}
function financialLineKey(line={}){
  return line.financial_statement_line_id||`new_${Math.random().toString(16).slice(2)}`;
}
function refreshFinancialLineParents(){
  const rows=[...document.querySelectorAll('.financial-line:not(.financial-line-head)')];
  const options=rows.map(row=>({key:row.dataset.lineKey,label:row.querySelector('.financial-line-code').value||row.querySelector('.financial-line-label').value||'Line'}));
  rows.forEach(row=>{
    const current=row.querySelector('.financial-line-parent').value;
    row.querySelector('.financial-line-parent').innerHTML='<option value="">None</option>'+options.filter(option=>option.key!==row.dataset.lineKey).map(option=>`<option value="${option.key}">${option.label}</option>`).join('');
    row.querySelector('.financial-line-parent').value=current;
  });
}
function renderFinancialFormatLines(lines=[]){
  const target=$('financial-format-lines');
  target.innerHTML='<div class="financial-line-grid"><div class="financial-line financial-line-head"><span>Order</span><span>Code</span><span>Label</span><span>Type</span><span>Parent</span><span>Formula JSON</span><span>GL Accounts</span><span></span></div></div>';
  lines.forEach(line=>addFinancialFormatLine(line));
  refreshFinancialLineParents();
}
function addFinancialFormatLine(line={}){
  const row=document.createElement('div');
  row.className='financial-line';
  row.dataset.lineKey=financialLineKey(line);
  row.innerHTML='<input class="financial-line-order" type="number" step="10"><input class="financial-line-code" required><input class="financial-line-label" required><select class="financial-line-type"><option value="header">Header</option><option value="account_group">Account Group</option><option value="formula">Formula</option></select><select class="financial-line-parent"></select><textarea class="financial-line-formula" rows="2"></textarea><select class="financial-line-accounts" multiple></select><button type="button" class="secondary">Remove</button>';
  $('financial-format-lines').querySelector('.financial-line-grid').append(row);
  row.querySelector('.financial-line-order').value=line.sort_order??0;
  row.querySelector('.financial-line-code').value=line.line_code||'';
  row.querySelector('.financial-line-label').value=line.line_label||'';
  row.querySelector('.financial-line-type').value=line.line_type||'account_group';
  row.querySelector('.financial-line-formula').value=JSON.stringify(line.formula_json||{},null,2);
  option(row.querySelector('.financial-line-accounts'),state.accounts.filter(account=>account.ledger_family_code==='gl'),'ledger_account_id',account=>`${account.account_code} - ${account.account_name}`);
  mappingsForLine(line.financial_statement_line_id).forEach(mapping=>{
    const mapped=row.querySelector(`.financial-line-accounts option[value="${mapping.ledger_account_id}"]`);
    if(mapped)mapped.selected=true;
  });
  row.querySelector('.financial-line-code').addEventListener('input',refreshFinancialLineParents);
  row.querySelector('.financial-line-label').addEventListener('input',refreshFinancialLineParents);
  row.querySelector('button').addEventListener('click',()=>{row.remove();refreshFinancialLineParents();});
  refreshFinancialLineParents();
  row.querySelector('.financial-line-parent').value=line.parent_line_id||'';
}
function collectFinancialFormatLines(){
  const rows=[...document.querySelectorAll('.financial-line:not(.financial-line-head)')];
  const lineKeys=new Set(rows.map(row=>row.dataset.lineKey));
  return rows.map(row=>{
    const parent=row.querySelector('.financial-line-parent').value;
    return {
      client_key:row.dataset.lineKey,
      line_code:row.querySelector('.financial-line-code').value,
      line_label:row.querySelector('.financial-line-label').value,
      line_type:row.querySelector('.financial-line-type').value,
      parent_client_key:lineKeys.has(parent)?parent:'',
      sort_order:row.querySelector('.financial-line-order').value,
      formula_json:row.querySelector('.financial-line-formula').value||'{}',
      account_ids:[...row.querySelector('.financial-line-accounts').selectedOptions].map(option=>option.value),
      is_active:true
    };
  });
}
function openNewFinancialFormat(){
  openFinancialFormatEditor({statement_type:'income',is_active:true});
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
  loadEntityDocuments('legalEntity').catch(e=>alert(e.message));
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
  loadEntityDocuments('legalEntity').catch(e=>alert(e.message));
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
    loadEntityDocuments('master').catch(e=>alert(e.message));
  });
}
function openAccountingSetupType(kind,row={}){
  const prefix=kind==='object'?'accounting-object-type':'accounting-dimension-type';
  $(`${prefix}-form`).hidden=false;
  $(`${prefix}-id`).value=row.accounting_object_type_id||row.accounting_dimension_type_id||'';
  $(`${prefix}-code`).value=row.type_code||'';
  $(`${prefix}-code`).readOnly=!!(row.accounting_object_type_id||row.accounting_dimension_type_id);
  $(`${prefix}-name`).value=row.type_name||'';
  $(`${prefix}-schema`).value=JSON.stringify(row.schema_json||{type:'object',properties:{}},null,2);
  $(`${prefix}-ui-schema`).value=JSON.stringify(row.ui_schema_json||{sections:[]},null,2);
  $(`${prefix}-active`).checked=row.is_active!==false;
  fillModuleSelect(`${prefix}-modules`,row.module_ids);
}
function renderAccountingSetupTypes(kind){
  const isObject=kind==='object';
  const rows=(isObject?state.accountingObjectTypes:state.accountingDimensionTypes).filter(row=>rowMatches(row,searchTerm(isObject?'accounting-object-type-search':'accounting-dimension-type-search')));
  const target=$(isObject?'accounting-object-type-list':'accounting-dimension-type-list');
  table(target,[['Code',r=>r.type_code],['Name',r=>r.type_name],['Modules',moduleNames],['Active',r=>r.is_active?'Yes':'No'],['Seeded',r=>r.is_seeded?'Yes':'No']],rows,row=>openAccountingSetupType(kind,row));
}
function accountingMasterConfig(kind){
  const isObject=kind==='object';
  return {
    kind,
    isObject,
    recordsKey:isObject?'accountingObjects':'accountingDimensions',
    typesKey:isObject?'accountingObjectTypes':'accountingDimensionTypes',
    endpoint:isObject?'accounting-objects':'accounting-dimensions',
    viewId:isObject?'accountingobjects':'accountingdimensions',
    title:isObject?'Accounting Objects':'Accounting Dimensions',
    recordId:isObject?'accounting_object_id':'accounting_dimension_id',
    typeId:isObject?'accounting_object_type_id':'accounting_dimension_type_id',
    code:isObject?'object_code':'dimension_code',
    name:isObject?'object_name':'dimension_name',
    prefix:isObject?'accounting-object':'accounting-dimension',
    selected:()=>isObject?selectedAccountingObject:selectedAccountingDimension,
    setSelected:value=>{if(isObject)selectedAccountingObject=value;else selectedAccountingDimension=value;},
    selectedType:()=>isObject?selectedAccountingObjectTypeId:selectedAccountingDimensionTypeId,
    setSelectedType:value=>{if(isObject)selectedAccountingObjectTypeId=value;else selectedAccountingDimensionTypeId=value;}
  };
}
function fillAccountingMasterTypes(kind){
  const config=accountingMasterConfig(kind);
  option($(`${config.prefix}-type`),state[config.typesKey].filter(type=>type.is_active!==false),config.typeId,type=>`${type.type_code} - ${type.type_name}`,'Select type');
}
function accountingObjectParentLabel(row){
  if(!row)return '';
  const type=row.parent_type_name||row.type_name||pretty(row.parent_type_code||row.type_code||'');
  const code=row.parent_object_code||row.object_code||'';
  const name=row.parent_object_name||row.object_name||'';
  return [type,code,name].filter(Boolean).join(' - ');
}
function accountingObjectParentKey(row){
  return row?.accounting_object_id||row?.parent_accounting_object_id||'';
}
function renderAccountingObjectParentOptions(){
  const list=$('accounting-object-parent-options');
  if(!list)return;
  list.innerHTML='';
  accountingObjectParentOptions.forEach(row=>{
    const option=document.createElement('option');
    option.value=accountingObjectParentLabel(row);
    option.dataset.id=accountingObjectParentKey(row);
    list.append(option);
  });
}
async function loadAccountingObjectParentOptions(term='',currentId=''){
  const params=new URLSearchParams({organisation_id:state.orgId,search:term||''});
  if(currentId)params.set('exclude_accounting_object_id',currentId);
  const result=await api(`accounting-objects/search?${params.toString()}`);
  accountingObjectParentOptions=result.records||[];
  renderAccountingObjectParentOptions();
}
function syncAccountingObjectParentSelection(){
  const input=$('accounting-object-parent-search');
  const hidden=$('accounting-object-parent');
  if(!input||!hidden)return;
  const text=input.value.trim();
  if(!text){
    hidden.value='';
    input.dataset.selectedLabel='';
    return;
  }
  if(hidden.value&&input.dataset.selectedLabel===text)return;
  const matches=accountingObjectParentOptions.filter(row=>accountingObjectParentLabel(row)===text);
  const selected=matches.length===1?matches[0]:null;
  hidden.value=selected?.accounting_object_id||'';
  input.dataset.selectedLabel=selected?text:'';
}
function selectedAccountingMasterSchema(kind){
  const config=accountingMasterConfig(kind);
  const typeId=$(`${config.prefix}-type`)?.value||$(`${config.prefix}-type-select`)?.value||config.selectedType();
  return state[config.typesKey].find(type=>type[config.typeId]===typeId)?.schema_json||{};
}
function renderAccountingMasterDetailFields(kind,detail={}){
  const config=accountingMasterConfig(kind);
  renderSchemaDetailFields(`${config.prefix}-detail-fields`,selectedAccountingMasterSchema(kind),detail);
}
function collectAccountingMasterDetail(kind){
  const config=accountingMasterConfig(kind);
  return collectSchemaDetail(`${config.prefix}-detail-fields`,selectedAccountingMasterSchema(kind));
}
function openAccountingMasterRecord(kind,row={}){
  const config=accountingMasterConfig(kind);
  const id=row[config.recordId]||'';
  config.setSelected(id||null);
  $(`${config.prefix}-form`).hidden=false;
  $(`${config.prefix}-id`).value=id;
  $(`${config.prefix}-type`).value=row[config.typeId]||$(`${config.prefix}-type-select`).value||'';
  $(`${config.prefix}-division`).value=row.owner_division_id||state.divisions[0]?.division_id||'';
  if(config.isObject){
    accountingObjectParentOptions=[];
    if(row.parent_accounting_object_id){
      accountingObjectParentOptions=[{
        accounting_object_id:row.parent_accounting_object_id,
        object_code:row.parent_object_code,
        object_name:row.parent_object_name,
        type_code:row.parent_type_code,
        type_name:row.parent_type_name
      }];
      renderAccountingObjectParentOptions();
    }else renderAccountingObjectParentOptions();
    $('accounting-object-parent').value=row.parent_accounting_object_id||'';
    $('accounting-object-parent-search').value=accountingObjectParentLabel(accountingObjectParentOptions[0])||'';
    $('accounting-object-parent-search').dataset.selectedLabel=$('accounting-object-parent-search').value;
    loadAccountingObjectParentOptions('',id).catch(e=>alert(e.message));
  }
  $(`${config.prefix}-code`).value=row[config.code]||'';
  $(`${config.prefix}-name`).value=row[config.name]||'';
  $(`${config.prefix}-valid-from`).value=dateOnly(row.valid_from)||today();
  $(`${config.prefix}-valid-to`).value=dateOnly(row.valid_to);
  renderAccountingMasterDetailFields(kind,row.additional_data||{});
}
function renderAccountingMaster(kind){
  const config=accountingMasterConfig(kind);
  fillAccountingMasterTypes(kind);
  const typeSelect=$(`${config.prefix}-type-select`);
  const selectedType=typeSelect.value||config.selectedType();
  option(typeSelect,state[config.typesKey].filter(type=>type.is_active!==false),config.typeId,type=>`${type.type_code} - ${type.type_name}`,'Select type');
  if(selectedType)typeSelect.value=selectedType;
  if(!typeSelect.value&&state[config.typesKey][0])typeSelect.value=state[config.typesKey][0][config.typeId];
  const rows=state[config.recordsKey].filter(row=>rowMatches(row,searchTerm(`${config.prefix}-search`)));
  const columns=config.isObject
    ? [['Code',r=>r[config.code]],['Name',r=>r[config.name]],['Parent',r=>accountingObjectParentLabel({parent_type_name:r.parent_type_name,parent_object_code:r.parent_object_code,parent_object_name:r.parent_object_name})],['Owner',r=>r.owner_division_name],['Valid from',r=>dateOnly(r.valid_from)],['Valid to',r=>dateOnly(r.valid_to)]]
    : [['Code',r=>r[config.code]],['Name',r=>r[config.name]],['Type',r=>r.type_name],['Owner',r=>r.owner_division_name],['Valid from',r=>dateOnly(r.valid_from)],['Valid to',r=>dateOnly(r.valid_to)]];
  table($(`${config.prefix}-list`),columns,rows,row=>openAccountingMasterRecord(kind,row));
}
async function loadAccountingMasterRecords(kind){
  const config=accountingMasterConfig(kind);
  const typeId=$(`${config.prefix}-type-select`)?.value||state[config.typesKey][0]?.[config.typeId];
  if(!typeId){
    state[config.recordsKey]=[];
    config.setSelectedType('');
    renderAccountingMaster(kind);
    return;
  }
  config.setSelectedType(typeId);
  const records=await api(`${config.endpoint}/list?organisation_id=${state.orgId}&${config.typeId}=${encodeURIComponent(typeId)}`);
  state[config.recordsKey]=records.records||[];
  renderAccountingMaster(kind);
  highlightDynamicMenu();
}
function renderJournals(){
  const rows=selectedTransactionTypeId?state.journals.filter(journal=>journal.transaction_type_id===selectedTransactionTypeId):state.journals;
  $('journal-grid-title').textContent=selectedTransactionTypeId?labelForTransactionType(selectedTransactionTypeId):'Transactions';
  table($('journal-list'),[['Date/time',r=>journalDateTime(r)],['Number',r=>r.journal_number||'(draft)'],['Description',r=>r.description],['Status',r=>pretty(r.workflow_status)],['Debits',r=>r.debit_total],['Credits',r=>r.credit_total]],rows,async r=>{
    const d=await api(`journals/detail?journal_id=${encodeURIComponent(r.journal_id)}`);
    selectedJournal=r.journal_id;$('journal-form').hidden=false;$('journal-id').value=r.journal_id;$('journal-type').value=r.transaction_type_id||'';$('journal-period').value=r.fiscal_period_id;$('journal-division').value=r.source_division_id;$('journal-date').value=dateOnly(r.journal_date);$('journal-description').value=r.description;renderJournalLines(d.lines);
    setJournalEditable(r.workflow_status==='draft');
    loadEntityDocuments('journal').catch(e=>alert(e.message));
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
  const params=new URLSearchParams({organisation_id:state.orgId,report:selectedReport});
  if(selectedReport==='ledger')params.set('fiscal_year_id',yearId);
  if(selectedReport==='financial_statement'){
    const formatId=$('report-format').value;
    const periodFrom=$('report-period-from').value;
    const periodTo=$('report-period-to').value;
    if(!formatId){
      $('report-result').innerHTML='<p class="empty">Choose a financial statement format before running the report.</p>';
      return;
    }
    if(!periodFrom||!periodTo){
      $('report-result').innerHTML='<p class="empty">Choose a period range before running the report.</p>';
      return;
    }
    params.set('format_id',formatId);
    params.set('period_from_id',periodFrom);
    params.set('period_to_id',periodTo);
    if($('report-compare-year').value&&$('report-compare-period-from').value&&$('report-compare-period-to').value){
      params.set('compare_period_from_id',$('report-compare-period-from').value);
      params.set('compare_period_to_id',$('report-compare-period-to').value);
    }
  }
  if(division)params.set('division_id',division);
  const r=await api(`reports/financial?${params.toString()}`);
  if(selectedReport==='ledger'){
    table($('report-result'),[['Account',row=>`${row.account_code} - ${row.account_name}`],['Type',row=>row.account_type_name||row.account_type_code],['Debits',row=>Number(row.debit_total||0).toFixed(2)],['Credits',row=>Number(row.credit_total||0).toFixed(2)],['Balance',row=>Number(row.balance||0).toFixed(2)]],r.rows||[]);
    return;
  }
  renderFinancialStatementResult(r.rows||[]);
}
function renderFinancialStatementResult(rows){
  if(!rows.length){$('report-result').innerHTML='<p class="empty">No statement lines configured for this format.</p>';return;}
  const hasCompare=rows.some(row=>row.comparative_amount!==undefined);
  const tableEl=document.createElement('table');
  tableEl.className='financial-statement-table';
  tableEl.innerHTML=`<thead><tr><th>Line</th><th>Current</th>${hasCompare?'<th>Comparative</th><th>Variance</th><th>Variance %</th>':''}</tr></thead>`;
  const body=document.createElement('tbody');
  rows.forEach(row=>{
    const tr=document.createElement('tr');
    tr.className=`statement-line statement-line-${row.line_type}`;
    const amount=row.amount===null?'':Number(row.amount||0).toFixed(2);
    const compare=row.comparative_amount===null||row.comparative_amount===undefined?'':Number(row.comparative_amount||0).toFixed(2);
    const variance=row.variance===null||row.variance===undefined?'':Number(row.variance||0).toFixed(2);
    const variancePercent=row.variance_percent===null||row.variance_percent===undefined?'':`${Number(row.variance_percent||0).toFixed(2)}%`;
    tr.innerHTML=`<td style="padding-left:${10+(Number(row.depth)||0)*18}px">${row.line_label}</td><td>${amount}</td>${hasCompare?`<td>${compare}</td><td>${variance}</td><td>${variancePercent}</td>`:''}`;
    body.append(tr);
  });
  tableEl.append(body);
  $('report-result').innerHTML='';
  $('report-result').append(tableEl);
}
function setJournalEditable(editable){
  ['journal-type','journal-period','journal-division','journal-date','journal-description','add-journal-line','journal-save'].forEach(id=>{
    if($(id))$(id).disabled=!editable;
  });
  document.querySelectorAll('.journal-line input,.journal-line select,.journal-line button').forEach(control=>{control.disabled=!editable;});
}
function defaultJournalLinesForType(typeId){
  const rules=state.postingRules
    .filter(rule=>rule.transaction_type_id===typeId)
    .sort((a,b)=>Number(a.line_order||0)-Number(b.line_order||0));
  const lines=rules.map(rule=>({
    division_id:$('journal-division').value||'',
    gl_account_id:rule.default_gl_account_id||'',
    subledger_account_id:'',
    subledger_family_code:rule.requires_subledger?rule.subledger_family_code||'':'',
    description:rule.line_description||'',
    debit_credit:rule.debit_credit||'debit',
    debit_amount:'',
    credit_amount:''
  }));
  while(lines.length<2)lines.push({});
  return lines;
}
function renderJournalLines(lines=[{},{}]){
  $('journal-lines').innerHTML='<div class="journal-line-grid"><div class="journal-line journal-line-head"><span>Division</span><span>GL Account</span><span>Subledger</span><span>Description</span><span>DR/CR</span><span>Amount</span><span>Actions</span></div></div>';
  lines.forEach(line=>addJournalLine(line));
}
function addJournalLine(line={}){
  const row=document.createElement('div');
  row.className='journal-line';
  row.dataset.subledgerFamily=line.subledger_family_code||'';
  row.innerHTML='<select class="line-division"></select><select class="line-gl"></select><select class="line-sub"></select><input class="line-description" placeholder="Description"><select class="line-drcr"><option value="debit">DR</option><option value="credit">CR</option></select><input class="line-amount" type="number" min="0" step="0.01" placeholder="Amount"><button type="button" class="secondary">Remove</button>';
  let grid=$('journal-lines').querySelector('.journal-line-grid');
  if(!grid){
    $('journal-lines').innerHTML='<div class="journal-line-grid"><div class="journal-line journal-line-head"><span>Division</span><span>GL Account</span><span>Subledger</span><span>Description</span><span>DR/CR</span><span>Amount</span><span>Actions</span></div></div>';
    grid=$('journal-lines').querySelector('.journal-line-grid');
  }
  grid.append(row);
  option(row.querySelector('.line-division'),state.divisions,'division_id',d=>d.division_name);
  fillAccountSelects();
  row.querySelector('.line-division').value=line.division_id||$('journal-division').value||'';
  row.querySelector('.line-gl').value=line.gl_account_id||'';
  syncJournalLineSubledgerOptions(row);
  row.querySelector('.line-sub').value=line.subledger_account_id||'';
  row.querySelector('.line-gl').addEventListener('change',()=>syncJournalLineSubledgerOptions(row));
  row.querySelector('.line-description').value=line.description||'';
  const debit=Number(line.debit_amount)||0;
  const credit=Number(line.credit_amount)||0;
  row.querySelector('.line-drcr').value=debit>0?'debit':credit>0?'credit':line.debit_credit||'debit';
  row.querySelector('.line-amount').value=debit||credit||'';
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
  table($('transaction-reference'),[['Code',r=>r.type_code],['Name',r=>r.type_name],['Group',r=>r.group_name],['Modules',moduleNames],['Financial',r=>r.is_financial?'Yes':'No'],['Lines',r=>state.postingRules.filter(rule=>rule.transaction_type_id===r.transaction_type_id).length],['Additional',r=>r.allow_additional_lines?'Yes':'No']],types,row=>selectTransactionType(row).catch(e=>alert(e.message)));
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
  table($('role-list'),[['Name',r=>r.role_name],['Description',r=>r.role_description||''],['Modules',r=>state.roleModules.filter(link=>link.role_id===r.role_id).map(link=>link.module_name).join(', ')],['Setup administrator',r=>r.is_admin?'Yes':'No'],['Users',r=>state.roleUsers.filter(u=>u.role_id===r.role_id).length],['Master rows',r=>state.rolePermissions.filter(p=>p.role_id===r.role_id&&p.resource_kind==='master_data').length],['Transaction rows',r=>state.rolePermissions.filter(p=>p.role_id===r.role_id&&p.resource_kind==='transaction').length],['Active',r=>r.is_active?'Yes':'No']],roles,selectRole);
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
  fillModuleSelect('transaction-type-modules',type.module_ids);
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
  fillModuleSelect('transaction-type-modules');
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
  option(row.querySelector('.tx-line-subledger'),subledgerFamilies,'ledger_family_code',family=>family.family_name,'Select subledger account type');
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
  fillModuleSelect('role-modules',state.roleModules.filter(link=>link.role_id===role.role_id).map(link=>link.module_id));
  syncRoleModuleRequirement();
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
  fillModuleSelect('role-modules');
  syncRoleModuleRequirement();
  renderPermissionLines('master',[]);
  renderPermissionLines('transaction',[]);
  renderRoleUserLines([]);
  showRoleTab('users');
}
function syncRoleModuleRequirement(){$('role-modules').required=!$('role-admin').checked;}
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
  target.innerHTML=`<div class="permission-line-grid"><div class="permission-line permission-line-head"><span>Division</span><span>${kind==='master'?'Subledger Account Type':'Transaction Type'}</span><span>Workflow</span><span>Actions</span></div></div>`;
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
    option(row.querySelector('.permission-resource'),state.ledgerFamilies.filter(f=>f.is_active!==false),'ledger_family_code',f=>`${f.ledger_family_code} - ${f.family_name}`,'Select subledger account type');
    prependOption(row.querySelector('.permission-resource'),'*','All subledger account types');
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
  loadedSlices={menu:false,dashboard:false,divisions:false,fiscal:false,countries:false,currencies:false,taxTypes:false,ledgerTypes:false,masterTypes:false,accountingObjectTypes:false,accountingDimensionTypes:false,legalEntities:false,financialFormats:false,transactions:false,permissions:false};
  state.navigation={roles:[],modules:[],permissions:[],is_administrator:false};state.modules=[];state.currencies=[];state.countries=[];state.taxTypes=[];state.taxRates=[];state.divisions=[];state.years=[];state.periods=[];state.masterTypes=[];state.masterRecords=[];state.accountingObjectTypes=[];state.accountingDimensionTypes=[];state.accountingObjects=[];state.accountingDimensions=[];state.legalEntities=[];state.legalEntityDetail=null;state.journals=[];state.financialFormats=[];state.financialFormatLines=[];state.financialFormatMappings=[];state.transactionGroups=[];state.transactionTypes=[];state.postingRules=[];state.ledgerFamilies=[];state.ledgerTypes=[];state.accountTypes=[];state.accounts=[];state.roles=[];state.rolePermissions=[];state.roleUsers=[];state.dashboardSummary=null;
  syncSetupAccess();
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
  const [menu,objectTypes,dimensionTypes,navigation]=await Promise.all([
    api(`setup/menu?organisation_id=${state.orgId}`),
    api(`accounting-objects/types?organisation_id=${state.orgId}`),
    api(`accounting-dimensions/types?organisation_id=${state.orgId}`),
    api(`navigation/menu?organisation_id=${state.orgId}`)
  ]);
  state.ledgerFamilies=menu.ledger_families||[];
  state.modules=menu.modules||[];
  state.transactionGroups=menu.transaction_groups||[];
  state.transactionTypes=menu.transaction_types||[];
  state.accountingObjectTypes=objectTypes.types||[];
  state.accountingDimensionTypes=dimensionTypes.types||[];
  state.navigation=navigation;
  loadedSlices.menu=true;
  loadedSlices.accountingObjectTypes=true;
  loadedSlices.accountingDimensionTypes=true;
  buildDynamicMenu();
  buildAlternativeMenus();
  fillSelects();
  ['ledger-family-modules','accounting-object-type-modules','accounting-dimension-type-modules','transaction-type-modules'].forEach(id=>fillModuleSelect(id));
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
async function ensureTaxTypes(force=false){
  if(!state.orgId||loadedSlices.taxTypes&&!force)return;
  const taxes=await api(`tax-types/list?organisation_id=${state.orgId}`);
  state.taxTypes=taxes.tax_types||[];
  state.taxRates=taxes.tax_rates||[];
  loadedSlices.taxTypes=true;
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
async function ensureAccountingObjectTypes(force=false){
  if(!state.orgId||loadedSlices.accountingObjectTypes&&!force)return;
  const types=await api(`accounting-objects/types?organisation_id=${state.orgId}`);
  state.accountingObjectTypes=types.types||[];
  loadedSlices.accountingObjectTypes=true;
}
async function ensureAccountingDimensionTypes(force=false){
  if(!state.orgId||loadedSlices.accountingDimensionTypes&&!force)return;
  const types=await api(`accounting-dimensions/types?organisation_id=${state.orgId}`);
  state.accountingDimensionTypes=types.types||[];
  loadedSlices.accountingDimensionTypes=true;
}
async function ensureLegalEntities(force=false){
  if(!state.orgId||loadedSlices.legalEntities&&!force)return;
  const entities=await api(`legal-entities/list?organisation_id=${state.orgId}`);
  state.legalEntities=entities.legal_entities||[];
  loadedSlices.legalEntities=true;
  fillLegalEntitySelects();
}
async function ensureFinancialFormats(force=false){
  if(!state.orgId||loadedSlices.financialFormats&&!force)return;
  const data=await api(`financial-formats/list?organisation_id=${state.orgId}`);
  state.financialFormats=data.formats||[];
  state.financialFormatLines=data.lines||[];
  state.financialFormatMappings=data.mappings||[];
  loadedSlices.financialFormats=true;
  fillReportFormatSelect();
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
  state.roleModules=permissions.role_modules||[];
  loadedSlices.permissions=true;
}
async function ensureViewData(view){
  if(!state.orgId)return;
  if(view==='modules'){await loadMenuData();renderModules();}
  else if(view==='divisions'){await ensureDivisions();renderDivisions();}
  else if(view==='fiscal'){await ensureFiscal();renderFiscal();}
  else if(view==='countries'){await ensureCountries();renderCountries();}
  else if(view==='currencies'){await ensureCurrencies();renderCurrencies();}
  else if(view==='taxtypes'){await ensureTaxTypes();renderTaxTypes();}
  else if(view==='ledgerfamilies'){await Promise.all([loadMenuData(),ensureLedgerTypes()]);renderLedgerFamilies();}
  else if(view==='accountingobjecttypes'){await ensureAccountingObjectTypes();renderAccountingSetupTypes('object');}
  else if(view==='accountingdimensiontypes'){await ensureAccountingDimensionTypes();renderAccountingSetupTypes('dimension');}
  else if(view==='accountingobjects'){await Promise.all([ensureAccountingObjectTypes(),ensureDivisions()]);renderAccountingMaster('object');await loadAccountingMasterRecords('object');}
  else if(view==='accountingdimensions'){await Promise.all([ensureAccountingDimensionTypes(),ensureDivisions()]);renderAccountingMaster('dimension');await loadAccountingMasterRecords('dimension');}
  else if(view==='financialformats'){await Promise.all([ensureFinancialFormats(),loadAccountsForFamily('gl')]);renderFinancialFormats();}
  else if(view==='transactiongroups'){await ensureTransactionSetup();renderTransactionGroups();}
  else if(view==='transactiontypes'){await ensureTransactionSetup();renderTransactionTypes();}
  else if(view==='permissions'){await ensurePermissions();renderRoles();}
  else if(view==='legalentities'){await ensureLegalEntities();renderLegalEntities();}
  else if(view==='masterdata'){await Promise.all([ensureMasterTypes(),ensureDivisions(),loadMenuData()]);renderMasterTypes();await loadMasterRecords();}
  else if(view==='reports'){await Promise.all([ensureFiscal(),ensureDivisions(),ensureFinancialFormats()]);}
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
  const r=await api(`journals/list?organisation_id=${currentOrganisationId()}&transaction_type_id=${encodeURIComponent(typeId)}`);
  state.journals=r.journals||[];
}
async function loadMasterRecords(){
  const typeId=$('master-type-select').value||state.masterTypes[0]?.master_data_type_id;
  if(!state.orgId||!typeId){state.masterRecords=[];renderMasterRecords();return;}
  const r=await api(`masterdata/list?organisation_id=${state.orgId}&master_data_type_id=${typeId}`);
  state.masterRecords=r.records||[];
  renderMasterRecords();
}
function renderAll(){renderDashboard();renderOrganisations();renderDivisions();renderFiscal();renderCountries();renderCurrencies();renderTaxTypes();renderLedgerFamilies();renderFinancialFormats();renderAccounts();renderLegalEntities();renderMasterTypes();renderJournals();renderTransactionGroups();renderTransactionTypes();renderRoles();}
function resetScreenState(){
  selectedMasterRecord=null;
  selectedJournal=null;
  selectedLegalEntity=null;
  selectedFinancialFormatId='';
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
    'tax-type-form',
    'ledger-family-form',
    'ledger-type-form',
    'financial-format-form',
    'transaction-group-form',
    'transaction-type-form',
    'role-form',
    'account-form',
    'legal-entity-form',
    'journal-form',
    'fiscal-editor-panel',
    'fiscal-period-panel'
  ].forEach(id=>{if($(id))$(id).hidden=true;});
  ['account-form','master-record-form','accounting-object-form','accounting-dimension-form','legal-entity-form','journal-form','fiscal-form','fiscal-period-form','financial-format-form'].forEach(id=>$(id)?.reset());
  $('account-id').value='';
  $('master-record-id').value='';
  if($('accounting-object-id'))$('accounting-object-id').value='';
  if($('accounting-dimension-id'))$('accounting-dimension-id').value='';
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
  ['tax-type-search',renderTaxTypes],
  ['ledgerfamily-search',renderLedgerFamilies],
  ['financial-format-search',renderFinancialFormats],
  ['account-search',renderAccounts],
  ['accounting-object-search',()=>renderAccountingMaster('object')],
  ['accounting-dimension-search',()=>renderAccountingMaster('dimension')],
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
[
  ['subledger-toggle','subledger-subnav'],
  ['object-toggle','object-subnav'],
  ['dimension-toggle','dimension-subnav']
].forEach(([toggleId,subnavId])=>{
  $(toggleId).addEventListener('click',()=>{
    const expanded=$(toggleId).getAttribute('aria-expanded')==='true';
    setMenuExpanded(toggleId,subnavId,!expanded);
    if(!expanded)collapseDynamicMenus(toggleId);
  });
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
$('report-format').addEventListener('change',()=>{selectedFinancialFormatId=$('report-format').value;renderReport().catch(e=>alert(e.message));});
$('report-year').addEventListener('change',()=>{fillReportPeriodRange('report-year','report-period-from','report-period-to');renderReport().catch(e=>alert(e.message));});
$('report-period-from').addEventListener('change',()=>renderReport().catch(e=>alert(e.message)));
$('report-period-to').addEventListener('change',()=>renderReport().catch(e=>alert(e.message)));
$('report-compare-year').addEventListener('change',()=>{fillReportPeriodRange('report-compare-year','report-compare-period-from','report-compare-period-to');renderReport().catch(e=>alert(e.message));});
$('report-compare-period-from').addEventListener('change',()=>renderReport().catch(e=>alert(e.message)));
$('report-compare-period-to').addEventListener('change',()=>renderReport().catch(e=>alert(e.message)));
$('report-division').addEventListener('change',()=>renderReport().catch(e=>alert(e.message)));
$('alert-close').addEventListener('click',()=>alert(''));
$('refresh').addEventListener('click',()=>load().catch(e=>alert(e.message)));
async function createExampleOrg(){
  if(!window.confirm('Create or reset Example (PTY) LTD using the Template Organisation setup and approved sample transactions? Existing EXAMPLE data will be deleted.'))return;
  try{
    const r=await api('setup/example-org',{method:'POST',body:JSON.stringify({access_organisation_id:state.orgId})});
    boot=await api('setup/bootstrap');
    state.orgId=r.organisation?.organisation_id||state.orgId;
    storeCurrentOrg();
    selectedLedgerFamilyCode='gl';
    selectedTransactionTypeId='';
    selectedReport='financial_statement';
    resetScreenState();
    await load();
    show('dashboard');
    alert(`Example organisation ready. Created ${r.fiscal_years} financial years, ${r.fiscal_periods} periods, ${r.journals} journals and ${r.lines} journal lines.`);
  }catch(e){
    alert(e.message);
  }
}
document.querySelectorAll('.create-example-org').forEach(button=>button.addEventListener('click',createExampleOrg));
$('init-schema').addEventListener('click',async()=>{
  if(!window.confirm('Initialise or repair the ERP database schema now?'))return;
  try{
    await api('setup/schema',{method:'POST',body:JSON.stringify({})});
    await load();
    show('organisations');
    $('init-template-result').hidden=false;
    $('init-template-result').textContent='Schema initialised.';
  }catch(e){
    alert(e.message);
  }
});
$('reset-erp').addEventListener('click',async()=>{
  if(!window.confirm('Reset this tenant ERP data? This deletes ERP organisations, divisions, fiscal years, ledger accounts, master data, journals, and custom setup. It will not reseed defaults.'))return;
  try{
    const r=await api('setup/reset',{method:'POST',body:JSON.stringify({access_organisation_id:state.orgId})});
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
    await ensureTaxTypes(true);
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
  selectedReport='financial_statement';
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
  resetOrgOpenAIFields();
  const template=boot.organisations.find(o=>o.is_template);
  $('org-copy-source').value=template?.organisation_id||'';
  $('org-copy-target').value='';
  $('org-delete-target').value='';
}
$('add-org').addEventListener('click',openNewOrganisation);
$('new-org').addEventListener('click',openNewOrganisation);
async function saveOrganisationForm(){
  const r=await api('organisations/save',{method:'POST',body:JSON.stringify({organisation_id:$('org-id').value,access_organisation_id:state.orgId,organisation_code:$('org-code').value,organisation_name:$('org-name').value,base_currency_code:$('org-currency').value,is_template:$('org-template').checked})});
  if(r.organisation?.organisation_id)$('org-id').value=r.organisation.organisation_id;
  if(r.organisation?.organisation_id)await saveOrgOpenAISetting(r.organisation.organisation_id);
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
function ensureDeleteTransactionsOption(){
  if(document.getElementById('delete-transactions'))return;
  const fiscalOption=document.getElementById('delete-fiscal-years')?.closest('label');
  if(!fiscalOption)return;
  const label=document.createElement('label');
  label.className='check';
  const checkbox=document.createElement('input');
  checkbox.type='checkbox';
  checkbox.id='delete-transactions';
  label.appendChild(checkbox);
  label.appendChild(document.createTextNode(' Transactions and journals'));
  fiscalOption.insertAdjacentElement('afterend',label);
}
function ensureDeleteModulesOption(){
  if(document.getElementById('delete-modules'))return;
  const options=$('org-delete-panel')?.querySelector('.copy-options');
  if(!options)return;
  const label=document.createElement('label');label.className='check';
  const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.id='delete-modules';
  label.append(checkbox,document.createTextNode(' Modules (also removes module links)'));
  options.append(label);
}
function openOrgDeletePanel(){
  const targetId=selectedOrganisationId();
  ensureDeleteTransactionsOption();
  ensureDeleteModulesOption();
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
    tax_types:$('copy-tax-types').checked,
    fiscal_years:$('copy-fiscal-years').checked,
    ledger_families:$('copy-ledger-families').checked,
    ledger_types:$('copy-ledger-types').checked,
    chart_of_accounts:$('copy-chart').checked,
    financial_statement_formats:$('copy-financial-formats').checked,
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
  ensureDeleteTransactionsOption();
  ensureDeleteModulesOption();
  const options={
    divisions:$('delete-divisions').checked,
    countries:$('delete-countries').checked,
    currencies:$('delete-currencies').checked,
    tax_types:$('delete-tax-types').checked,
    fiscal_years:$('delete-fiscal-years').checked,
    transactions:$('delete-transactions').checked,
    ledger_families:$('delete-ledger-families').checked,
    ledger_types:$('delete-ledger-types').checked,
    chart_of_accounts:$('delete-chart').checked,
    financial_statement_formats:$('delete-financial-formats').checked,
    transaction_groups:$('delete-transaction-groups').checked,
    transaction_types:$('delete-transaction-types').checked,
    posting_rules:$('delete-posting-rules').checked,
    master_data_types:$('delete-master-types').checked,
    permissions:$('delete-permissions').checked,
    modules:$('delete-modules').checked
  };
  if(!Object.values(options).some(Boolean))return alert('Select at least one data option to delete');
  const org=boot.organisations.find(o=>o.organisation_id===orgId);
  const name=org?`${org.organisation_code} - ${org.organisation_name}`:'the selected organisation';
  const deletesTransactions=options.transactions||options.fiscal_years||options.divisions||options.chart_of_accounts||options.ledger_types||options.ledger_families;
  const transactionWarning=deletesTransactions?' Captured transactions/journals will also be deleted.':'';
  const moduleWarning=options.modules?' Module links from roles and setup object types will also be removed; those linked records will remain.':'';
  if(!window.confirm(`Delete the selected data from ${name}?${transactionWarning}${moduleWarning} This cannot be undone.`))return;
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
  fillAccountTypes();
  updateAccountLegalEntityRequirement();
  renderAccountDetailFields(detail);
});
document.querySelectorAll('[data-account-fixed-tab]').forEach(button=>button.addEventListener('click',()=>showAccountFixedTab(button.dataset.accountFixedTab)));
$('add-account').addEventListener('click',()=>openAccountEditor());
$('new-account').addEventListener('click',()=>openAccountEditor());
$('intake-account-document').addEventListener('click',()=>openDocumentIntake('ledger_account'));
$('close-intake').addEventListener('click',closeDocumentIntake);
$('analyse-intake').addEventListener('click',async()=>{
  const targetKind=$('intake-target-kind').value;
  const input=$('intake-file');
  const file=input.files&&input.files[0];
  if(targetKind!=='legal_entity')return alert('Only legal entity intake is implemented in this step.');
  if(!file)return alert('Choose a source document first.');
  try{
    if(file.size>10*1024*1024)throw new Error('Document must be 10MB or smaller');
    $('intake-status').textContent='Analysing document...';
    $('intake-review').hidden=true;
    const dataUrl=await readFileDataUrl(file);
    const result=await api('intake/analyse',{method:'POST',body:JSON.stringify({
      organisation_id:state.orgId,
      target_kind:targetKind,
      file_name:file.name,
      data_url:dataUrl
    })});
    populateIntakeReview(result.intake);
  }catch(error){
    $('intake-status').textContent='';
    alert(error.message);
  }
});
['intake-entity-type','intake-legal-name','intake-known-name','intake-effective-from','intake-effective-to'].forEach(id=>$(id).addEventListener('input',syncIntakeFieldsFromJson));
$('intake-review').addEventListener('submit',async e=>{
  e.preventDefault();
  try{
    syncIntakeFieldsFromJson();
    const draft=JSON.parse($('intake-json').value||'{}');
    if(!draft.legal_entity?.legal_name||!draft.legal_entity?.known_name)throw new Error('Legal name and known name are required');
    $('intake-status').textContent='Creating legal entity...';
    const saved=await api('intake/confirm',{method:'POST',body:JSON.stringify({
      intake_id:$('intake-id').value,
      extracted_json:JSON.stringify(draft)
    })});
    selectedLegalEntity=saved.legal_entity?.legal_entity_id||selectedLegalEntity;
    closeDocumentIntake();
    await ensureLegalEntities(true);
    renderLegalEntities();
    fillLegalEntitySelects();
    if(saved.legal_entity)await openLegalEntityEditor(saved.legal_entity);
  }catch(error){
    alert(error.message);
  }
});
$('upload-account-document').addEventListener('click',()=>$('account-document-file').click());
$('account-document-file').addEventListener('change',()=>uploadEntityDocument('account'));
$('account-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const family=selectedLedgerFamilyCode||$('account-form-family').value;
  $('account-form-family').value=family;
  let additionalData;
  try{additionalData=collectAccountDetail();}
  catch(error){alert(error.message);return;}
  const saved=await api('accounts/save',{method:'POST',body:JSON.stringify({
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
  $('account-id').value=saved.account?.ledger_account_id||$('account-id').value;
  loadedAccountFamilies.delete(family);
  await loadAccountsForFamily(family);
  renderAccounts();
  fillAccountSelects();
  await loadEntityDocuments('account');
  $('account-form').hidden=true;
  invalidateDashboard();
});
function resetAccountingMasterForm(kind){
  const config=accountingMasterConfig(kind);
  $(`${config.prefix}-form`).reset();
  $(`${config.prefix}-id`).value='';
  $(`${config.prefix}-type`).value=$(`${config.prefix}-type-select`).value||state[config.typesKey][0]?.[config.typeId]||'';
  $(`${config.prefix}-division`).value=state.divisions[0]?.division_id||'';
  if(config.isObject){
    accountingObjectParentOptions=[];
    renderAccountingObjectParentOptions();
    $('accounting-object-parent').value='';
    $('accounting-object-parent-search').value='';
    $('accounting-object-parent-search').dataset.selectedLabel='';
    loadAccountingObjectParentOptions('', '').catch(e=>alert(e.message));
  }
  $(`${config.prefix}-valid-from`).value=today();
  $(`${config.prefix}-valid-to`).value='';
  renderAccountingMasterDetailFields(kind,{});
  config.setSelected(null);
}
['object','dimension'].forEach(kind=>{
  const config=accountingMasterConfig(kind);
  $(`${config.prefix}-type-select`)?.addEventListener('change',()=>loadAccountingMasterRecords(kind).catch(e=>alert(e.message)));
  $(`${config.prefix}-type`)?.addEventListener('change',()=>renderAccountingMasterDetailFields(kind,{}));
  $(`add-${config.prefix}`)?.addEventListener('click',()=>{
    $(`${config.prefix}-form`).hidden=false;
    resetAccountingMasterForm(kind);
  });
  $(`new-${config.prefix}`)?.addEventListener('click',()=>resetAccountingMasterForm(kind));
  $(`${config.prefix}-form`)?.addEventListener('submit',async e=>{
    e.preventDefault();
    let additionalData;
    try{additionalData=collectAccountingMasterDetail(kind);}
    catch(error){alert(error.message);return;}
    const body={
      organisation_id:state.orgId,
      owner_division_id:$(`${config.prefix}-division`).value,
      valid_from:$(`${config.prefix}-valid-from`).value,
      valid_to:$(`${config.prefix}-valid-to`).value,
      additional_data:JSON.stringify(additionalData)
    };
    if(config.isObject){
      syncAccountingObjectParentSelection();
      if($('accounting-object-parent-search').value.trim()&&!$('accounting-object-parent').value)return alert('Choose a parent object from the search results, or clear the parent object field.');
      body.parent_accounting_object_id=$('accounting-object-parent').value;
    }
    body[config.recordId]=$(`${config.prefix}-id`).value;
    body[config.typeId]=$(`${config.prefix}-type`).value;
    body[config.code]=$(`${config.prefix}-code`).value;
    body[config.name]=$(`${config.prefix}-name`).value;
    const saved=await api(`${config.endpoint}/save`,{method:'POST',body:JSON.stringify(body)});
    config.setSelected(saved.record?.[config.recordId]||config.selected());
    $(`${config.prefix}-id`).value=config.selected()||'';
    $(`${config.prefix}-type-select`).value=body[config.typeId];
    await loadAccountingMasterRecords(kind);
    alert(`${config.isObject?'Accounting object':'Accounting dimension'} saved.`);
  });
});
let accountingObjectParentSearchTimer=null;
$('accounting-object-parent-search')?.addEventListener('input',()=>{
  clearTimeout(accountingObjectParentSearchTimer);
  syncAccountingObjectParentSelection();
  const term=$('accounting-object-parent-search').value.trim();
  const currentId=$('accounting-object-id').value;
  accountingObjectParentSearchTimer=setTimeout(()=>{
    loadAccountingObjectParentOptions(term,currentId).then(syncAccountingObjectParentSelection).catch(e=>alert(e.message));
  },180);
});
$('accounting-object-parent-search')?.addEventListener('change',syncAccountingObjectParentSelection);
$('add-legal-entity').addEventListener('click',resetLegalEntityForm);
$('new-legal-entity').addEventListener('click',resetLegalEntityForm);
$('intake-legal-entity-document').addEventListener('click',()=>openDocumentIntake('legal_entity'));
$('upload-legal-entity-document').addEventListener('click',()=>$('legal-entity-document-file').click());
$('legal-entity-document-file').addEventListener('change',()=>uploadEntityDocument('legalEntity'));
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
  const saved=await api('legal-entities/save',{method:'POST',body:JSON.stringify({
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
  selectedLegalEntity=saved.legal_entity?.legal_entity_id||selectedLegalEntity;
  $('legal-entity-id').value=selectedLegalEntity||'';
  await ensureLegalEntities(true);
  renderLegalEntities();
  fillLegalEntitySelects();
  await loadEntityDocuments('legalEntity');
});
$('master-type-select').addEventListener('change',()=>{renderMasterTypes();loadMasterRecords().catch(e=>alert(e.message));});
$('master-type-form').addEventListener('submit',async e=>{e.preventDefault();await api('masterdata/save-type',{method:'POST',body:JSON.stringify({master_data_type_id:$('master-type-id').value,organisation_id:state.orgId,ledger_family_code:$('master-family').value,type_code:$('master-type-code').value,type_name:$('master-type-name').value,schema_json:$('master-schema').value,ui_schema_json:$('master-ui-schema').value})});await ensureMasterTypes(true);renderMasterTypes();await loadMasterRecords();});
$('new-master').addEventListener('click',()=>{$('master-record-form').reset();$('master-record-id').value='';selectedMasterRecord=null;$('master-data').value='{}';loadEntityDocuments('master').catch(e=>alert(e.message));});
$('upload-master-document').addEventListener('click',()=>$('master-document-file').click());
$('master-document-file').addEventListener('change',()=>uploadEntityDocument('master'));
$('master-record-form').addEventListener('submit',async e=>{e.preventDefault();const saved=await api('masterdata/save',{method:'POST',body:JSON.stringify({master_data_record_id:$('master-record-id').value,organisation_id:state.orgId,master_data_type_id:$('master-type-select').value,owner_division_id:$('master-division').value,ledger_account_id:$('master-ledger-account').value,record_code:$('master-code').value,display_name:$('master-display').value,additional_data:$('master-data').value})});selectedMasterRecord=saved.record?.master_data_record_id||selectedMasterRecord;$('master-record-id').value=selectedMasterRecord||'';await loadMasterRecords();await loadEntityDocuments('master');});
document.querySelectorAll('[data-master-action]').forEach(b=>b.addEventListener('click',async()=>{if(!selectedMasterRecord)return alert('Select a master record first');await api('masterdata/workflow',{method:'POST',body:JSON.stringify({master_data_record_id:selectedMasterRecord,action:b.dataset.masterAction})});await loadMasterRecords();}));
$('journal-date').value=today();
option($('journal-period'),[],null,null);
$('add-journal-line').addEventListener('click',()=>addJournalLine());
function openNewJournal(){
  $('journal-form').hidden=false;
  $('journal-form').reset();
  $('journal-id').value='';
  selectedJournal=null;
  $('journal-type').value=selectedTransactionTypeId||'';
  $('journal-date').value=today();
  syncJournalPeriodToDate();
  renderJournalLines(defaultJournalLinesForType($('journal-type').value));
  setJournalEditable(true);
  loadEntityDocuments('journal').catch(e=>alert(e.message));
}
$('add-journal').addEventListener('click',openNewJournal);
$('new-journal').addEventListener('click',openNewJournal);
$('journal-date').addEventListener('change',syncJournalPeriodToDate);
$('journal-type').addEventListener('change',()=>{
  if(!$('journal-id').value)renderJournalLines(defaultJournalLinesForType($('journal-type').value));
});
$('intake-journal-document').addEventListener('click',()=>openDocumentIntake('journal'));
$('upload-journal-document').addEventListener('click',()=>$('journal-document-file').click());
$('journal-document-file').addEventListener('change',()=>uploadEntityDocument('journal'));
$('journal-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const saveButton=$('journal-save');
  saveButton.disabled=true;
  try{
    const organisationId=currentOrganisationId();
    const transactionTypeId=$('journal-type').value;
    const fiscalPeriodId=$('journal-period').value;
    const sourceDivisionId=$('journal-division').value;
    const missing=[
      [organisationId,'organisation'],
      [transactionTypeId,'transaction type'],
      [fiscalPeriodId,'fiscal period'],
      [sourceDivisionId,'source division']
    ].filter(([value])=>!value).map(([,label])=>label);
    if(missing.length)throw new Error(`Choose ${missing.join(', ')} before saving`);
    const lines=[...document.querySelectorAll('.journal-line:not(.journal-line-head)')].map(row=>{
      const side=row.querySelector('.line-drcr').value;
      const amount=row.querySelector('.line-amount').value;
      return {
        division_id:row.querySelector('.line-division').value,
        gl_account_id:row.querySelector('.line-gl').value,
        subledger_account_id:row.querySelector('.line-sub').value,
        description:row.querySelector('.line-description').value,
        debit_amount:side==='debit'?amount:'',
        credit_amount:side==='credit'?amount:'',
        currency_code:currentOrg()?.base_currency_code||'ZAR'
      };
    });
    if(lines.some(line=>!line.gl_account_id))throw new Error('Choose a GL account for every journal line');
    const invalidLineIndex=lines.findIndex(line=>{
      const debit=Number(line.debit_amount)||0;
      const credit=Number(line.credit_amount)||0;
      return (debit>0&&credit>0)||(debit<=0&&credit<=0);
    });
    if(invalidLineIndex>=0)throw new Error(`Line ${invalidLineIndex+1} needs either a debit or a credit amount`);
    const saved=await api('journals/save',{method:'POST',body:JSON.stringify({journal_id:$('journal-id').value,organisation_id:organisationId,transaction_type_id:transactionTypeId,fiscal_period_id:fiscalPeriodId,source_division_id:sourceDivisionId,journal_date:$('journal-date').value,description:$('journal-description').value,currency_code:currentOrg()?.base_currency_code||'ZAR',lines})});
    const debitTotal=lines.reduce((sum,line)=>sum+(Number(line.debit_amount)||0),0);
    const creditTotal=lines.reduce((sum,line)=>sum+(Number(line.credit_amount)||0),0);
    selectedJournal=saved.journal?.journal_id||selectedJournal;
    $('journal-id').value=selectedJournal||'';
    state.orgId=organisationId;
    await loadJournalsForTransactionType(transactionTypeId||selectedTransactionTypeId);
    if(saved.journal&&!state.journals.some(journal=>journal.journal_id===saved.journal.journal_id)){
      state.journals=[{
        ...saved.journal,
        transaction_type_name:labelForTransactionType(transactionTypeId),
        debit_total:debitTotal.toFixed(2),
        credit_total:creditTotal.toFixed(2)
      },...state.journals];
    }
    $('journal-form').hidden=true;
    renderJournals();
    invalidateDashboard();
    alert('Draft saved.');
  }catch(error){
    alert(error.message);
  }finally{
    saveButton.disabled=false;
  }
});
document.querySelectorAll('[data-journal-action]').forEach(b=>b.addEventListener('click',async()=>{
  try{
    if(!$('journal-id').value)return alert('Select or save a journal first');
    await api('journals/workflow',{method:'POST',body:JSON.stringify({journal_id:$('journal-id').value,action:b.dataset.journalAction})});
    await loadJournalsForTransactionType($('journal-type').value||selectedTransactionTypeId);
    renderJournals();
    invalidateDashboard();
    alert(`${pretty(b.dataset.journalAction)} complete.`);
  }catch(error){
    alert(error.message);
  }
}));
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
  $('ledger-family-legal-entity').checked=false;
  $('ledger-family-schema').value='{}';
  $('ledger-family-active').checked=true;
  fillModuleSelect('ledger-family-modules');
}
$('add-currency').addEventListener('click',openNewCurrency);
$('new-currency').addEventListener('click',openNewCurrency);
$('add-module').addEventListener('click',()=>openModule({is_active:true}));
$('new-module').addEventListener('click',()=>openModule({is_active:true}));
$('module-search').addEventListener('input',renderModules);
$('module-form').addEventListener('submit',async e=>{
  e.preventDefault();
  await api('modules/save',{method:'POST',body:JSON.stringify({module_id:$('module-id').value,organisation_id:state.orgId,module_code:$('module-code').value,module_name:$('module-name').value,module_description:$('module-description').value,module_icon_svg:$('module-icon-svg').value,sort_order:$('module-sort').value,is_active:$('module-active').checked})});
  $('module-form').hidden=true;await loadMenuData(true);renderModules();
});
$('add-tax-type').addEventListener('click',openNewTaxType);
$('new-tax-type').addEventListener('click',openNewTaxType);
$('add-tax-rate').addEventListener('click',()=>addTaxRateLine());
$('tax-type-form').addEventListener('submit',async e=>{
  e.preventDefault();
  await api('tax-types/save',{method:'POST',body:JSON.stringify({
    tax_type_id:$('tax-type-id').value,
    organisation_id:state.orgId,
    tax_type_code:$('tax-type-code').value,
    tax_type_description:$('tax-type-description').value,
    tax_direction:$('tax-type-direction').value,
    is_active:$('tax-type-active').checked,
    rates:collectTaxRateLines()
  })});
  $('tax-type-form').hidden=true;
  await ensureTaxTypes(true);
  renderTaxTypes();
});
$('add-country').addEventListener('click',openNewCountry);
$('new-country').addEventListener('click',openNewCountry);
$('country-form').addEventListener('submit',async e=>{e.preventDefault();await api('countries/save',{method:'POST',body:JSON.stringify({organisation_id:state.orgId,country_code:$('country-code').value,alpha3_code:$('country-alpha3').value,numeric_code:$('country-numeric').value,country_name:$('country-name').value,official_name:$('country-official').value,region:$('country-region').value,subregion:$('country-subregion').value,default_currency_code:$('country-currency').value,calling_code:$('country-calling-code').value,postal_code_required:$('country-postal-required').checked,administrative_level_label:$('country-admin-label').value})});$('country-form').hidden=true;await ensureCountries(true);renderCountries();});
$('add-ledger-family').addEventListener('click',openNewLedgerFamily);
$('new-ledger-family').addEventListener('click',openNewLedgerFamily);
$('ledger-family-form').addEventListener('submit',async e=>{e.preventDefault();await api('ledger-families/save',{method:'POST',body:JSON.stringify({organisation_id:state.orgId,ledger_family_code:$('ledger-family-code').value,family_name:$('ledger-family-name').value,module_ids:selectedModuleIds('ledger-family-modules'),requires_standard_account_type:$('ledger-family-standard-type').checked,requires_legal_entity:$('ledger-family-legal-entity').checked,schema_json:$('ledger-family-schema').value,is_active:$('ledger-family-active').checked})});$('ledger-family-form').hidden=true;await loadMenuData(true);await ensureLedgerTypes(true);renderLedgerFamilies();});
$('new-ledger-type').addEventListener('click',()=>openNewLedgerType($('ledger-type-family').value||state.ledgerFamilies[0]?.ledger_family_code||''));
$('ledger-type-form').addEventListener('submit',async e=>{e.preventDefault();await api('ledger-types/save',{method:'POST',body:JSON.stringify({account_type_id:$('ledger-type-id').value,organisation_id:state.orgId,ledger_family_code:$('ledger-type-family').value,account_type_code:$('ledger-type-code').value,account_type_name:$('ledger-type-name').value,is_required:$('ledger-type-required').checked,is_active:$('ledger-type-active').checked})});$('ledger-type-form').hidden=true;await ensureLedgerTypes(true);renderLedgerFamilies();});
$('add-accounting-object-type').addEventListener('click',()=>openAccountingSetupType('object'));
$('new-accounting-object-type').addEventListener('click',()=>openAccountingSetupType('object'));
$('accounting-object-type-search').addEventListener('input',()=>renderAccountingSetupTypes('object'));
$('accounting-object-type-form').addEventListener('submit',async e=>{
  e.preventDefault();
  await api('accounting-objects/save-type',{method:'POST',body:JSON.stringify({
    accounting_object_type_id:$('accounting-object-type-id').value,
    organisation_id:state.orgId,
    type_code:$('accounting-object-type-code').value,
    type_name:$('accounting-object-type-name').value,
    module_ids:selectedModuleIds('accounting-object-type-modules'),
    schema_json:$('accounting-object-type-schema').value,
    ui_schema_json:$('accounting-object-type-ui-schema').value,
    is_active:$('accounting-object-type-active').checked
  })});
  $('accounting-object-type-form').hidden=true;
  await ensureAccountingObjectTypes(true);
  renderAccountingSetupTypes('object');
});
$('add-accounting-dimension-type').addEventListener('click',()=>openAccountingSetupType('dimension'));
$('new-accounting-dimension-type').addEventListener('click',()=>openAccountingSetupType('dimension'));
$('accounting-dimension-type-search').addEventListener('input',()=>renderAccountingSetupTypes('dimension'));
$('accounting-dimension-type-form').addEventListener('submit',async e=>{
  e.preventDefault();
  await api('accounting-dimensions/save-type',{method:'POST',body:JSON.stringify({
    accounting_dimension_type_id:$('accounting-dimension-type-id').value,
    organisation_id:state.orgId,
    type_code:$('accounting-dimension-type-code').value,
    type_name:$('accounting-dimension-type-name').value,
    module_ids:selectedModuleIds('accounting-dimension-type-modules'),
    schema_json:$('accounting-dimension-type-schema').value,
    ui_schema_json:$('accounting-dimension-type-ui-schema').value,
    is_active:$('accounting-dimension-type-active').checked
  })});
  $('accounting-dimension-type-form').hidden=true;
  await ensureAccountingDimensionTypes(true);
  renderAccountingSetupTypes('dimension');
});
$('add-financial-format').addEventListener('click',openNewFinancialFormat);
$('new-financial-format').addEventListener('click',openNewFinancialFormat);
$('add-financial-line').addEventListener('click',()=>addFinancialFormatLine({sort_order:(document.querySelectorAll('.financial-line:not(.financial-line-head)').length+1)*100,line_type:'account_group',is_active:true}));
$('financial-format-form').addEventListener('submit',async e=>{
  e.preventDefault();
  await api('financial-formats/save',{method:'POST',body:JSON.stringify({
    financial_statement_format_id:$('financial-format-id').value,
    organisation_id:state.orgId,
    format_code:$('financial-format-code').value,
    format_name:$('financial-format-name').value,
    statement_type:$('financial-format-type').value,
    is_active:$('financial-format-active').checked,
    lines:collectFinancialFormatLines()
  })});
  $('financial-format-form').hidden=true;
  await ensureFinancialFormats(true);
  renderFinancialFormats();
});
$('delete-financial-format').addEventListener('click',async()=>{
  const id=$('financial-format-id').value;
  if(!id)return alert('Select a financial statement format first');
  if(!window.confirm('Delete this financial statement format?'))return;
  await api('financial-formats/delete',{method:'POST',body:JSON.stringify({financial_statement_format_id:id})});
  $('financial-format-form').hidden=true;
  await ensureFinancialFormats(true);
  renderFinancialFormats();
});
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
    module_ids:selectedModuleIds('transaction-type-modules'),
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
$('role-admin').addEventListener('change',syncRoleModuleRequirement);
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
    module_ids:selectedModuleIds('role-modules'),
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
  const selectedPeriod=$('journal-period')?.value||'';
  option($('journal-period'),state.periods,'fiscal_period_id',p=>`${p.period_code} (${p.status})`);
  if(selectedPeriod)$('journal-period').value=selectedPeriod;
  if(!$('journal-period').value)syncJournalPeriodToDate();
}
const originalRenderAll=renderAll;
renderAll=function(){originalRenderAll();patchDynamicSelects();};
installModuleField('ledger-family-form','ledger-family-modules');
installModuleField('accounting-object-type-form','accounting-object-type-modules');
installModuleField('accounting-dimension-type-form','accounting-dimension-type-modules');
installModuleField('transaction-type-form','transaction-type-modules');
installModuleField('role-form','role-modules');
installModuleIconEditor();
$('role-admin').closest('label').lastChild.textContent=' Setup administrator';
document.querySelectorAll('[data-menu-mode]').forEach(tab=>{
  tab.addEventListener('click',()=>applyMenuMode(tab.dataset.menuMode));
  tab.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();applyMenuMode(tab.dataset.menuMode);}});
});
setupLegalEntityTabs();
addPanelCloseButtons();
syncRequiredMarkers();
initSidebarResize();
load().catch(e=>alert(e.message));
})();
