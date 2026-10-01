(()=>{
const $=id=>document.getElementById(id);
const rememberedKey='coreSaasRememberedDevice';
const panelGlassKey='coreSaasPanelGlassTransparency';
const defaultTenantIconPreset='organisation';
const tenantIconPresets=[
  {key:'personal',label:'Personal'},
  {key:'family',label:'Family'},
  {key:'organisation',label:'Organisation'},
  {key:'team',label:'Team'},
  {key:'partnership',label:'Partnership'},
  {key:'department',label:'Department'},
  {key:'ideas',label:'Ideas and innovation'},
  {key:'design',label:'Design'},
  {key:'testing',label:'Testing'}
];
const tenantIconPresetKeys=new Set(tenantIconPresets.map(preset=>preset.key));
const tenantIconAllowedTags=new Set(['svg','g','path','rect','circle','ellipse','line','polyline','polygon','title','desc','defs','lineargradient','radialgradient','stop','clippath','mask']);
const tenantIconGlobalAttributes=new Set(['id','transform','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-miterlimit','fill-rule','clip-rule','opacity','clip-path','mask','vector-effect']);
const tenantIconTagAttributes={
  svg:new Set(['xmlns','viewbox','width','height','role','aria-label','focusable','preserveaspectratio']),
  path:new Set(['d','pathlength']),rect:new Set(['x','y','width','height','rx','ry']),circle:new Set(['cx','cy','r']),
  ellipse:new Set(['cx','cy','rx','ry']),line:new Set(['x1','y1','x2','y2']),polyline:new Set(['points']),polygon:new Set(['points']),
  lineargradient:new Set(['x1','y1','x2','y2','gradientunits','gradienttransform']),radialgradient:new Set(['cx','cy','r','fx','fy','gradientunits','gradienttransform']),
  stop:new Set(['offset','stop-color','stop-opacity']),clippath:new Set(['clippathunits']),mask:new Set(['x','y','width','height','maskunits','maskcontentunits'])
};
let currentUser=null;
let currentApplications=[];
let currentTenants=[];
let currentThemes=[];
let activeApplication=null;
let activeLauncher='home';
let panelGlassTransparency=readPanelGlassPrefs();
let managedTenantId=null;
let managedTenantDetail=null;
let tenantEditorId=null;
let tenantEditorTab='tenant';
let selectedApplicationUsersId=null;
let tenantDetails=new Map();
let expandedTenantIds=new Set();
let tenantActiveTabs=new Map();
let expandedTenantApplicationIds=new Set();
let newTenantUserRows=new Set();
let profilePhotoDraft;
let newTenantIcon={tenant_icon_preset:defaultTenantIconPreset,tenant_icon_svg:null};

async function api(path,options={}){
  const r=await fetch('/api/'+path,{headers:{'content-type':'application/json'},...options});
  const j=await r.json();
  if(!r.ok)throw new Error(j.error||'Request failed');
  return j;
}

function msg(x,type='error'){
  const message=$('message');
  message.textContent=typeof x==='string'?x:JSON.stringify(x,null,2);
  message.classList.toggle('success',type==='success');
}

function clearMsg(){
  $('message').textContent='';
  $('message').classList.remove('success');
}

function initials(user){
  const name=(user&&user.known_name)||'User';
  return name.trim().slice(0,1).toUpperCase()||'U';
}

function closeMenus(){
  $('profile-menu').hidden=true;
  closeTenantPicker();
}

function toggleProfileMenu(){
  closeTenantPicker();
  const menu=$('profile-menu');
  menu.hidden=!menu.hidden;
}

function createAppIcon(app,className=''){
  if(!app.application_icon_svg)return null;
  const icon=document.createElement('span');
  icon.className=['app-icon',className].filter(Boolean).join(' ');
  icon.innerHTML=app.application_icon_svg;
  return icon;
}

function createTenantIcon(tenant,className=''){
  const icon=document.createElement('span');
  icon.className=['tenant-icon',className].filter(Boolean).join(' ');
  icon.setAttribute('aria-hidden','true');
  if(tenant?.tenant_icon_svg){
    icon.innerHTML=tenant.tenant_icon_svg;
  }else{
    const preset=tenantIconPresetKeys.has(tenant?.tenant_icon_preset)?tenant.tenant_icon_preset:defaultTenantIconPreset;
    icon.dataset.tenantIconPreset=preset;
  }
  return icon;
}

function replaceTenantIcon(target,tenant){
  if(!target)return;
  const icon=createTenantIcon(tenant,[...target.classList].filter(name=>name!=='tenant-icon').join(' '));
  target.replaceChildren(...icon.childNodes);
  if(icon.dataset.tenantIconPreset)target.dataset.tenantIconPreset=icon.dataset.tenantIconPreset;
  else delete target.dataset.tenantIconPreset;
}

async function readTenantIconSvg(file){
  if(!file)return null;
  if(file.size>32768)throw new Error('Tenant icon SVG must be 32 KB or smaller.');
  if(file.type&&file.type!=='image/svg+xml'&&!file.name.toLowerCase().endsWith('.svg'))throw new Error('Choose an SVG file.');
  const source=(await file.text()).trim();
  const documentNode=new DOMParser().parseFromString(source,'image/svg+xml');
  const root=documentNode.documentElement;
  if(!root||root.localName!=='svg'||documentNode.querySelector('parsererror'))throw new Error('Choose a valid SVG file.');
  const nodes=[root,...root.querySelectorAll('*')];
  const unsafe=nodes.some(node=>{
    const tag=node.localName.toLowerCase();
    if(!tenantIconAllowedTags.has(tag))return true;
    return [...node.attributes].some(attribute=>{
      const name=attribute.name.toLowerCase();
      const allowed=tenantIconGlobalAttributes.has(name)||(tenantIconTagAttributes[tag]&&tenantIconTagAttributes[tag].has(name));
      return !allowed||/^on/i.test(name)||/^(?:href|xlink:href|style|class)$/i.test(name)||(/url\s*\(/i.test(attribute.value)&&!/^url\(#[A-Za-z_][A-Za-z0-9_.:-]*\)$/.test(attribute.value));
    });
  });
  if(unsafe)throw new Error('Tenant icon contains unsupported or unsafe SVG content.');
  return new XMLSerializer().serializeToString(root);
}

function createTenantIconEditor(initialIcon,disabled,onChange){
  let value=initialIcon?.tenant_icon_svg
    ? {tenant_icon_preset:null,tenant_icon_svg:initialIcon.tenant_icon_svg}
    : {tenant_icon_preset:tenantIconPresetKeys.has(initialIcon?.tenant_icon_preset)?initialIcon.tenant_icon_preset:defaultTenantIconPreset,tenant_icon_svg:null};
  const editor=document.createElement('div');
  editor.className='tenant-icon-editor';
  const preview=createTenantIcon(value,'tenant-icon-preview');
  const controls=document.createElement('div');
  controls.className='tenant-icon-editor-controls';
  const heading=document.createElement('span');
  heading.className='tenant-icon-editor-label';
  heading.textContent='Tenant icon';
  const presetGrid=document.createElement('div');
  presetGrid.className='tenant-icon-preset-grid';
  presetGrid.setAttribute('role','listbox');
  presetGrid.setAttribute('aria-label','Standard tenant icons');
  const presetButtons=new Map();
  tenantIconPresets.forEach(preset=>{
    const button=document.createElement('button');
    button.type='button';
    button.className='tenant-icon-preset-option';
    button.disabled=disabled;
    button.dataset.preset=preset.key;
    button.setAttribute('role','option');
    button.setAttribute('aria-label',preset.label);
    button.title=preset.label;
    button.append(createTenantIcon({tenant_icon_preset:preset.key},'tenant-icon-preset-glyph'));
    presetButtons.set(preset.key,button);
    presetGrid.append(button);
  });
  const customLabel=document.createElement('label');
  customLabel.className='tenant-icon-custom-upload';
  customLabel.textContent='Custom SVG';
  const input=document.createElement('input');
  input.type='file';
  input.accept='.svg,image/svg+xml';
  input.disabled=disabled;
  const customState=document.createElement('small');
  customState.className='tenant-icon-custom-state';
  customState.textContent='Custom SVG selected';

  function setValue(nextValue,notify=true){
    value=nextValue;
    replaceTenantIcon(preview,value);
    presetButtons.forEach((button,key)=>{
      const selected=!value.tenant_icon_svg&&value.tenant_icon_preset===key;
      button.classList.toggle('selected',selected);
      button.setAttribute('aria-selected',selected?'true':'false');
    });
    customState.hidden=!value.tenant_icon_svg;
    if(notify)onChange({...value});
  }

  presetButtons.forEach((button,key)=>button.addEventListener('click',()=>{
    input.value='';
    setValue({tenant_icon_preset:key,tenant_icon_svg:null});
  }));
  input.addEventListener('change',async ()=>{
    try{
      const tenantIconSvg=await readTenantIconSvg(input.files?.[0]);
      if(!tenantIconSvg)return;
      setValue({tenant_icon_preset:null,tenant_icon_svg:tenantIconSvg});
    }catch(error){
      input.value='';
      msg(error.message);
    }
  });
  customLabel.append(input);
  controls.append(heading,presetGrid,customLabel,customState);
  editor.append(preview,controls);
  setValue(value,false);
  return editor;
}

function createHomeLauncherButton(){
  const button=document.createElement('button');
  button.id='home-button';
  button.className='home-action';
  button.type='button';
  button.setAttribute('role','option');
  button.setAttribute('aria-selected','false');
  button.setAttribute('aria-label','Return to application list');
  button.title='Application list';
  button.innerHTML=`<span class="home-icon toolbar" aria-hidden="true">
    <svg viewBox="0 0 48 48" focusable="false">
      <path class="app-icon-stroke" d="M11 22.5 24 11l13 11.5V39H11z"></path>
      <path class="app-icon-line" d="M18 39V27h12v12M9 24l15-13 15 13"></path>
    </svg>
  </span>
  <span class="home-label">Home</span>`;
  button.addEventListener('click',showApplicationHome);
  return button;
}

function applicationKey(app){
  return app.application_code||app.route_prefix||app.application_id;
}

function readPanelGlassPrefs(){
  try{
    const saved=localStorage.getItem(panelGlassKey);
    if(saved!==null)return clampTransparency(saved);
    const legacy=JSON.parse(localStorage.getItem('coreSaasPanelGlassByApplication')||'{}')||{};
    const first=Object.values(legacy).find(value=>Number.isFinite(Number(value))||value===true||value===false);
    return first===true?60:first===false?0:clampTransparency(first);
  }catch{
    return 0;
  }
}

function savePanelGlassPrefs(){
  localStorage.setItem(panelGlassKey,String(clampTransparency(panelGlassTransparency)));
}

function clampTransparency(value){
  const number=Number(value);
  if(!Number.isFinite(number))return 0;
  return Math.max(0,Math.min(100,Math.round(number)));
}

function transparencyAlpha(transparency){
  return Math.max(0,Math.min(1,1-(clampTransparency(transparency)/100)));
}

function routeWithPanelGlass(route,transparency){
  try{
    const url=new URL(route,location.origin);
    const amount=clampTransparency(transparency);
    if(amount>0){
      url.searchParams.set('panel_glass','1');
      url.searchParams.set('panel_transparency',String(amount));
    }else{
      url.searchParams.delete('panel_glass');
      url.searchParams.delete('panel_transparency');
    }
    return url.pathname+url.search+url.hash;
  }catch{
    return route;
  }
}

function applyPanelGlassState(transparency){
  const amount=clampTransparency(transparency);
  const enabled=amount>0;
  const shell=$('app');
  const slider=$('panel-transparency-slider');
  const value=$('panel-transparency-value');
  shell.classList.toggle('panels-glass',enabled);
  shell.style.setProperty('--panel-glass-alpha',String(transparencyAlpha(amount)));
  if(slider){
    slider.value=String(amount);
    slider.setAttribute('aria-valuetext',`${amount}% transparent`);
  }
  if(value){
    value.textContent=`${amount}%`;
  }
  const frame=$('application-frame');
  if(frame&&frame.contentWindow){
    frame.contentWindow.postMessage({type:'core-saas-panel-glass',enabled,transparency:amount},location.origin);
  }
}

function renderTenantHomeList(){
  const list=$('tenant-home-list');
  if(!list)return;
  list.innerHTML='';
  if(!currentTenants.length){
    const empty=document.createElement('p');
    empty.className='empty-state';
    empty.textContent='No tenants are available.';
    list.append(empty);
    return;
  }
  const currentTenantId=$('tenants').value;
  currentTenants.forEach(tenant=>{
    const button=document.createElement('button');
    const selected=tenant.tenant_id===currentTenantId;
    button.type='button';
    button.className='application-home-item tenant-home-item';
    button.classList.toggle('current',selected);
    button.setAttribute('aria-pressed',selected?'true':'false');
    button.addEventListener('click',()=>selectTenant(tenant.tenant_id));
    button.append(createTenantIcon(tenant,'tenant-icon-tile'));
    const copy=document.createElement('span');
    copy.className='application-home-copy';
    const title=document.createElement('strong');
    title.textContent=tenant.tenant_name||'Tenant';
    const description=document.createElement('span');
    description.className='tenant-home-description';
    description.textContent=tenant.tenant_description||'';
    const detail=document.createElement('small');
    const type=tenant.tenant_type==='personal_tenant'?'Personal workspace':'Shared workspace';
    detail.textContent=selected?`${type} - Current tenant`:type;
    copy.append(title);
    if(description.textContent)copy.append(description);
    copy.append(detail);
    button.append(copy);
    list.append(button);
  });
}

function renderApplicationHomeList(){
  const list=$('application-home-list');
  if(!list)return;
  list.innerHTML='';
  if(!currentApplications.length){
    const empty=document.createElement('p');
    empty.className='empty-state';
    empty.textContent='No applications are available for this tenant.';
    list.append(empty);
    return;
  }
  currentApplications.forEach(app=>{
    const button=document.createElement('button');
    button.type='button';
    button.className='application-home-item';
    button.addEventListener('click',()=>openApplication(app));

    const icon=createAppIcon(app,'small');
    if(!icon)button.classList.add('without-icon');

    const copy=document.createElement('span');
    copy.className='application-home-copy';
    const title=document.createElement('strong');
    title.textContent=app.application_name||app.application_code||'Application';
    copy.append(title);
    if(app.application_description){
      const description=document.createElement('small');
      description.textContent=app.application_description;
      copy.append(description);
    }

    if(icon)button.append(icon);
    button.append(copy);
    list.append(button);
  });
}

function tenantRoleMeta(role){
  return {
    owner:{label:'*',icon:'*'},
    tenant_administrator:{label:'*',icon:'*'},
    tenant_user:{label:'User',icon:'●'}
  }[role]||{label:roleLabel(role),icon:'●'};
}

function renderApplications(applications){
  currentApplications=applications||[];
  const list=$('application-icons');
  list.innerHTML='';
  list.append(createHomeLauncherButton());

  if(!currentApplications.length){
    const empty=document.createElement('span');
    empty.className='application-icon-empty';
    empty.textContent='No apps';
    list.append(empty);
    return;
  }

  currentApplications.forEach(app=>{
    const button=document.createElement('button');
    button.type='button';
    button.className='application-icon-button';
    button.dataset.applicationKey=applicationKey(app);
    button.setAttribute('role','option');
    button.setAttribute('aria-label',app.application_name||app.application_code||'Application');
    button.setAttribute('aria-selected','false');
    button.title=app.application_name||app.application_code||'Application';
    const icon=createAppIcon(app,'toolbar');
    if(icon){
      button.append(icon);
    }else{
      const fallback=document.createElement('span');
      fallback.className='application-icon-fallback';
      fallback.textContent=(app.application_name||app.application_code||'A').trim().slice(0,1).toUpperCase();
      button.append(fallback);
    }
    const label=document.createElement('span');
    label.className='application-icon-label';
    label.textContent=app.application_name||app.application_code||'Application';
    button.append(label);
    button.addEventListener('click',()=>openApplication(app));
    list.append(button);
  });
  updateApplicationIconSelection();
  renderApplicationHomeList();
}

function updateApplicationIconSelection(){
  const activeKey=activeApplication?applicationKey(activeApplication):'';
  const homeButton=$('home-button');
  if(homeButton){
    const selected=activeLauncher==='home';
    homeButton.classList.toggle('active',selected);
    homeButton.setAttribute('aria-selected',selected?'true':'false');
  }
  document.querySelectorAll('.application-icon-button').forEach(button=>{
    const selected=button.dataset.applicationKey===activeKey;
    button.classList.toggle('active',selected);
    button.setAttribute('aria-selected',selected?'true':'false');
  });
}

function renderProfile(user){
  currentUser=user;
  const known=user.known_name||user.full_name||user.email.split('@')[0];
  renderAvatar($('profile-avatar'),known,user.profile_photo_data_url);
  renderAvatar($('profile-menu-avatar'),known,user.profile_photo_data_url);
  $('profile-known-name').textContent=known;
  $('profile-email').textContent=user.email;
  $('landing-welcome').textContent=`Welcome ${known}`;
  $('landing-context').textContent='';
  try{
    const remembered=JSON.parse(localStorage.getItem(rememberedKey)||'{}');
    localStorage.setItem(rememberedKey,JSON.stringify({
      ...remembered,
      email:user.email,
      known_name:user.known_name||'',
      full_name:user.full_name||'',
      profile_photo_data_url:user.profile_photo_data_url||'',
      user_type:user.user_type,
      last_seen_at:new Date().toISOString()
    }));
  }catch{}
}

function renderAvatar(el,name,photoDataUrl){
  if(!el)return;
  el.textContent=initials({known_name:name});
  el.classList.toggle('has-photo',!!photoDataUrl);
  el.style.backgroundImage=photoDataUrl?`url("${photoDataUrl}")`:'';
}

function renderProfilePhotoPreview(){
  const known=$('profile-known-input')?.value||currentUser?.known_name||currentUser?.full_name||currentUser?.email?.split('@')[0]||'User';
  const photo=profilePhotoDraft===undefined?currentUser?.profile_photo_data_url:profilePhotoDraft;
  renderAvatar($('profile-photo-preview'),known,photo);
}

function themeHref(cssFile){
  if(!cssFile)return '';
  const clean=String(cssFile).replace(/^\/+/,'');
  if(!/^[a-zA-Z0-9._/-]+$/.test(clean))return '';
  return clean.includes('/')?`/${clean}`:`/themes/${clean}`;
}

function applyTenantTheme(tenant){
  let link=document.getElementById('tenant-theme');
  const href=themeHref(tenant&&tenant.css_file);
  if(!href){
    if(link)link.remove();
    return;
  }
  if(!link){
    link=document.createElement('link');
    link.id='tenant-theme';
    link.rel='stylesheet';
    document.head.append(link);
  }
  if(link.getAttribute('href')!==href)link.href=href;
}

function closeTenantPicker(){
  const menu=$('tenant-picker-menu');
  const trigger=$('tenant-picker-trigger');
  if(menu)menu.hidden=true;
  if(trigger)trigger.setAttribute('aria-expanded','false');
}

function openTenantPicker(focusSelected=false){
  const menu=$('tenant-picker-menu');
  const trigger=$('tenant-picker-trigger');
  if(!menu||!trigger||trigger.disabled)return;
  menu.hidden=false;
  trigger.setAttribute('aria-expanded','true');
  if(focusSelected){
    const selected=menu.querySelector('[aria-selected="true"]')||menu.querySelector('.tenant-picker-option');
    selected?.focus();
  }
}

function toggleTenantPicker(){
  $('profile-menu').hidden=true;
  if($('tenant-picker-menu').hidden)openTenantPicker();
  else closeTenantPicker();
}

async function selectTenant(tenantId){
  closeTenantPicker();
  if(!tenantId||tenantId===$('tenants').value)return;
  await switchTenant(tenantId);
}

function moveTenantPickerFocus(current,direction){
  const options=[...$('tenant-picker-menu').querySelectorAll('.tenant-picker-option')];
  if(!options.length)return;
  const index=Math.max(0,options.indexOf(current));
  options[(index+direction+options.length)%options.length].focus();
}

function renderTenantSelector(tenants,selectedTenantId){
  const selectedInput=$('tenants');
  const trigger=$('tenant-picker-trigger');
  const menu=$('tenant-picker-menu');
  const preferred=selectedTenantId&&tenants.some(tenant=>tenant.tenant_id===selectedTenantId)
    ? selectedTenantId
    : tenants[0]?.tenant_id;
  selectedInput.value=preferred||'';
  trigger.disabled=!tenants.length;
  menu.innerHTML='';
  tenants.forEach(tenant=>{
    const option=document.createElement('button');
    option.type='button';
    option.className='tenant-picker-option';
    option.dataset.tenantId=tenant.tenant_id;
    option.setAttribute('role','option');
    option.setAttribute('aria-selected',tenant.tenant_id===preferred?'true':'false');
    option.append(createTenantIcon(tenant,'tenant-icon-option'));
    const name=document.createElement('span');
    name.textContent=tenant.tenant_name||'Tenant';
    option.append(name);
    option.addEventListener('click',()=>selectTenant(tenant.tenant_id));
    option.addEventListener('keydown',event=>{
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){
        event.preventDefault();
        moveTenantPickerFocus(option,event.key==='ArrowDown'?1:-1);
      }else if(event.key==='Home'||event.key==='End'){
        event.preventDefault();
        const options=[...menu.querySelectorAll('.tenant-picker-option')];
        (event.key==='Home'?options[0]:options.at(-1))?.focus();
      }else if(event.key==='Escape'){
        event.preventDefault();
        closeTenantPicker();
        trigger.focus();
      }
    });
    menu.append(option);
  });
  const selected=tenants.find(tenant=>tenant.tenant_id===preferred)||tenants[0];
  $('tenant-picker-label').textContent=selected?.tenant_name||'No tenants';
  replaceTenantIcon($('tenant-picker-icon'),selected||{});
  applyTenantTheme(selected);
  closeTenantPicker();
  renderTenantHomeList();
}

async function refreshTenantSelector(preferredTenantId){
  const t=await api('tenant/list');
  currentTenants=t.tenants||[];
  renderTenantSelector(currentTenants,preferredTenantId||t.current_tenant);
  return t;
}

function openApplication(app){
  closeMenus();
  clearMsg();
  activeApplication=app;
  activeLauncher='application';
  $('app').classList.add('application-open');
  const isErp=String(app.application_code||'').toLowerCase()==='core-erp';
  $('application-workspace').classList.toggle('application-erp',isErp);
  $('app').classList.toggle('erp-open',isErp);
  const route=app.route_prefix||'/';
  const transparency=panelGlassTransparency;
  updateApplicationIconSelection();
  $('active-application-title').textContent=app.application_name||'Application';
  applyPanelGlassState(transparency);
  $('application-frame').src=routeWithPanelGlass(route,transparency);
  $('core-about').hidden=true;
  $('landing-home').hidden=true;
  $('application-workspace').hidden=false;
  $('tenant-management').hidden=true;
  history.replaceState(null,'','#app='+encodeURIComponent(app.application_code||route));
}

function showApplicationHome(){
  activeApplication=null;
  activeLauncher='home';
  $('app').classList.remove('application-open');
  $('app').classList.remove('erp-open');
  $('application-workspace').classList.remove('application-erp');
  applyPanelGlassState(false);
  updateApplicationIconSelection();
  $('application-frame').removeAttribute('src');
  $('core-about').hidden=true;
  $('application-workspace').hidden=true;
  $('tenant-management').hidden=true;
  $('landing-home').hidden=false;
  renderTenantHomeList();
  renderApplicationHomeList();
  history.replaceState(null,'',location.pathname);
}

function showTenantManagement(){
  clearMsg();
  activeApplication=null;
  activeLauncher='tenant-management';
  $('app').classList.remove('application-open');
  $('app').classList.remove('erp-open');
  $('application-workspace').classList.remove('application-erp');
  applyPanelGlassState(false);
  updateApplicationIconSelection();
  $('application-frame').removeAttribute('src');
  $('core-about').hidden=true;
  $('landing-home').hidden=true;
  $('application-workspace').hidden=true;
  $('tenant-management').hidden=false;
  history.replaceState(null,'','#tenants');
  loadTenantManagement($('tenants').value);
}

function showCoreAbout(){
  clearMsg();
  activeApplication=null;
  activeLauncher='about';
  $('app').classList.remove('application-open');
  $('app').classList.remove('erp-open');
  $('application-workspace').classList.remove('application-erp');
  applyPanelGlassState(false);
  updateApplicationIconSelection();
  $('application-frame').removeAttribute('src');
  $('landing-home').hidden=true;
  $('application-workspace').hidden=true;
  $('tenant-management').hidden=true;
  $('core-about').hidden=false;
  history.replaceState(null,'','#about');
}

function toggleNewTenantPanel(){
  const panel=$('new-tenant-panel');
  panel.hidden=!panel.hidden;
  if(!panel.hidden)$('new-tenant-name').focus();
}

function showTenantTab(panelId){
  document.querySelectorAll('.tenant-tab').forEach(button=>{
    button.classList.toggle('active',button.dataset.tenantTab===panelId);
  });
  document.querySelectorAll('.tenant-tab-panel').forEach(panel=>{
    panel.classList.toggle('active',panel.id===panelId);
  });
}

function closeDialog(id){
  $(id).close();
}

function openProfileDialog(){
  closeMenus();
  profilePhotoDraft=undefined;
  $('profile-known-input').value=currentUser?.known_name||'';
  $('profile-full-input').value=currentUser?.full_name||'';
  $('profile-photo-input').value='';
  renderProfilePhotoPreview();
  $('profile-dialog').showModal();
}

function openPasswordDialog(){
  closeMenus();
  $('current-password').value='';
  $('change-password').value='';
  $('password-dialog').showModal();
}

async function logout(){
  await api('auth/logout',{method:'POST'});
  localStorage.removeItem(rememberedKey);
  localStorage.removeItem('coreSaasDeviceId');
  location.href='/';
}

async function load(){
  try{
    const me=await api('user/me');
    renderProfile(me.user);
    await refreshTenantSelector();
    const apps=await api('application/list');
    renderApplications(apps.applications);
    const selectedCode=new URLSearchParams(location.hash.slice(1)).get('app');
    if(selectedCode){
      const selected=(apps.applications||[]).find(app=>app.application_code===selectedCode);
      if(selected)openApplication(selected);
    }else if(location.hash==='#tenants'){
      showTenantManagement();
    }else if(location.hash==='#about'){
      showCoreAbout();
    }
  }catch(e){
    location.href='/';
  }
}

async function switchTenant(tenantId=$('tenants').value){
  clearMsg();
  try{
    $('tenants').value=tenantId;
    await api('tenant/switchtenant',{method:'POST',body:JSON.stringify({tenant_id:tenantId})});
    msg('Tenant switched.','success');
    await refreshTenantSelector(tenantId);
    const apps=await api('application/list');
    renderApplications(apps.applications);
    showApplicationHome();
  }catch(e){msg(e.message)}
}

async function saveProfile(){
  clearMsg();
  try{
    const payload={known_name:$('profile-known-input').value,full_name:$('profile-full-input').value};
    if(profilePhotoDraft!==undefined)payload.profile_photo_data_url=profilePhotoDraft;
    const j=await api('user/profile',{method:'PATCH',body:JSON.stringify(payload)});
    renderProfile(j.user);
    closeDialog('profile-dialog');
    msg('Profile updated.','success');
  }catch(e){msg(e.message)}
}

function resizeProfilePhoto(file){
  return new Promise((resolve,reject)=>{
    if(!/^image\/(png|jpeg|webp)$/.test(file.type))return reject(new Error('Choose a PNG, JPEG, or WebP image.'));
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('Could not read image.'));
    reader.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error('Could not load image.'));
      img.onload=()=>{
        const size=256;
        const canvas=document.createElement('canvas');
        canvas.width=size;
        canvas.height=size;
        const ctx=canvas.getContext('2d');
        const scale=Math.max(size/img.width,size/img.height);
        const width=img.width*scale;
        const height=img.height*scale;
        ctx.drawImage(img,(size-width)/2,(size-height)/2,width,height);
        resolve(canvas.toDataURL('image/jpeg',0.86));
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function changePassword(){
  clearMsg();
  try{
    const j=await api('user/changepassword',{method:'POST',body:JSON.stringify({current_password:$('current-password').value,new_password:$('change-password').value})});
    closeDialog('password-dialog');
    msg(j.message||'Password changed.','success');
  }catch(e){msg(e.message)}
}

async function loadTenantManagement(preferredTenantId){
  const r=await api('tenant/manage/list');
  currentTenants=r.tenants||[];
  currentThemes=r.themes||[];
  populateThemeSelect('new-tenant-theme');
  const selected=preferredTenantId||managedTenantId||currentTenants[0]?.tenant_id;
  if(selected){
    expandedTenantIds.add(selected);
    await loadTenantDetail(selected,{render:false});
  }
  renderTenantGrid();
}

async function loadTenantDetail(tenantId,options={}){
  managedTenantId=tenantId;
  selectedApplicationUsersId=null;
  const r=await api('tenant/manage/detail?tenant_id='+encodeURIComponent(tenantId));
  const listedTenant=currentTenants.find(tenant=>tenant.tenant_id===tenantId);
  if(listedTenant&&listedTenant.theme_id&&!r.tenant.theme_id){
    r.tenant.theme_id=listedTenant.theme_id;
    r.tenant.theme_name=listedTenant.theme_name;
    r.tenant.css_file=listedTenant.css_file;
  }
  managedTenantDetail=r;
  tenantDetails.set(tenantId,r);
  currentThemes=r.themes||currentThemes;
  expandedTenantIds.add(tenantId);
  if(options.render!==false)renderTenantGrid();
}

function renderTenantGrid(){
  const grid=$('tenant-management-grid');
  if(!grid)return;
  grid.innerHTML='';
  if(!currentTenants.length){
    tenantEditorId=null;
    grid.innerHTML='<p class="empty-state">No tenants are available.</p>';
    renderTenantEditPanel();
    return;
  }
  const header=document.createElement('div');
  header.className='tenant-grid-row tenant-grid-head';
  ['','Tenant name','Status','Theme',''].forEach(label=>{
    const cell=document.createElement('span');
    cell.textContent=label;
    header.append(cell);
  });
  grid.append(header);
  currentTenants.forEach(listTenant=>{
    const tenantId=listTenant.tenant_id;
    const detail=tenantDetails.get(tenantId);
    const tenant=detail?.tenant||listTenant;
    tenant.tenant_id=tenant.tenant_id||tenantId;
    const canManage=detail?detail.can_manage:tenant.can_manage;
    const row=document.createElement('div');
    row.className='tenant-grid-row';
    row.classList.toggle('selected',tenantEditorId===tenant.tenant_id);
    const open=document.createElement('button');
    open.type='button';
    open.className='grid-expand';
    open.textContent='>';
    open.setAttribute('aria-label',`Edit ${tenant.tenant_name||'tenant'}`);
    open.addEventListener('click',()=>openTenantEditPanel(tenant.tenant_id));
    const nameCell=document.createElement('div');
    nameCell.className='tenant-name-cell';
    const name=document.createElement('strong');
    name.className='tenant-name-summary';
    name.textContent=tenant.tenant_name||'Tenant';
    const id=document.createElement('small');
    id.className='tenant-id-footnote';
    id.textContent=tenant.tenant_id;
    nameCell.append(name,id);
    const status=document.createElement('span');
    status.className='tenant-summary-text';
    status.textContent=roleLabel(tenant.status);
    const theme=document.createElement('span');
    theme.className='tenant-summary-text';
    theme.textContent=tenant.theme_name||currentThemes.find(x=>String(x.theme_id)===String(tenant.theme_id))?.theme_name||'';
    const edit=document.createElement('button');
    edit.type='button';
    edit.className='secondary-form-action table-action';
    edit.textContent=canManage?'Edit':'View';
    edit.addEventListener('click',()=>openTenantEditPanel(tenant.tenant_id));
    row.addEventListener('dblclick',()=>openTenantEditPanel(tenant.tenant_id));
    row.append(open,nameCell,status,theme,edit);
    grid.append(row);
  });
  renderTenantEditPanel();
}

async function openTenantEditPanel(tenantId,tab='tenant'){
  tenantEditorId=tenantId;
  tenantEditorTab=tab;
  await loadTenantDetail(tenantId);
}

function closeTenantEditPanel(){
  tenantEditorId=null;
  renderTenantGrid();
}

function setTenantEditorTab(tab){
  tenantEditorTab=tab;
  renderTenantEditPanel();
}

function renderTenantEditPanel(){
  const panel=$('tenant-edit-panel');
  if(!panel)return;
  if(!tenantEditorId){
    panel.hidden=true;
    panel.innerHTML='';
    return;
  }
  const detail=tenantDetails.get(tenantEditorId);
  const listTenant=currentTenants.find(tenant=>tenant.tenant_id===tenantEditorId);
  if(!listTenant&&!detail){
    tenantEditorId=null;
    panel.hidden=true;
    panel.innerHTML='';
    return;
  }
  panel.hidden=false;
  panel.innerHTML='';
  const tenant=detail?.tenant||listTenant||{tenant_id:tenantEditorId,tenant_name:'Tenant'};
  const close=document.createElement('button');
  close.type='button';
  close.className='tenant-panel-close';
  close.textContent='x';
  close.setAttribute('aria-label','Close tenant editor');
  close.addEventListener('click',closeTenantEditPanel);
  const title=document.createElement('h2');
  title.textContent='Manage Tenant';
  const tabs=document.createElement('div');
  tabs.className='tenant-editor-tabs';
  tabs.setAttribute('role','tablist');
  [['tenant','Tenant'],['users','Users'],['applications','Applications']].forEach(([key,label])=>{
    const button=document.createElement('button');
    button.type='button';
    button.className='tenant-editor-tab';
    button.classList.toggle('active',tenantEditorTab===key);
    button.setAttribute('role','tab');
    button.setAttribute('aria-selected',tenantEditorTab===key?'true':'false');
    button.textContent=label;
    button.addEventListener('click',()=>setTenantEditorTab(key));
    tabs.append(button);
  });
  const body=document.createElement('div');
  body.className='tenant-editor-body';
  if(!detail){
    body.innerHTML='<p class="empty-state">Loading tenant details...</p>';
    loadTenantDetail(tenantEditorId).catch(e=>msg(e.message));
  }else if(tenantEditorTab==='tenant'){
    body.append(renderTenantEditorTenantTab(tenantEditorId,detail,tenant));
  }else if(tenantEditorTab==='users'){
    body.append(renderTenantUsersGrid(tenantEditorId,detail));
  }else{
    body.append(renderTenantApplicationsGrid(tenantEditorId,detail));
  }
  panel.append(close,title,tabs,body);
}

function renderTenantEditorTenantTab(tenantId,detail,tenant){
  const form=document.createElement('div');
  form.className='tenant-editor-form';
  let tenantIcon={tenant_icon_preset:tenant.tenant_icon_preset||defaultTenantIconPreset,tenant_icon_svg:tenant.tenant_icon_svg||null};
  const nameLabel=document.createElement('label');
  nameLabel.textContent='Tenant name';
  const name=document.createElement('input');
  name.value=tenant.tenant_name||'';
  name.disabled=!detail.can_manage;
  const id=document.createElement('small');
  id.className='tenant-id-footnote';
  id.textContent=tenant.tenant_id||tenantId;
  nameLabel.append(name,id);
  const descriptionLabel=document.createElement('label');
  descriptionLabel.textContent='Description';
  const description=document.createElement('textarea');
  description.value=tenant.tenant_description||'';
  description.rows=6;
  description.maxLength=2000;
  description.placeholder='Describe this tenant workspace';
  description.disabled=!detail.can_manage;
  descriptionLabel.append(description);
  const themeLabel=document.createElement('label');
  themeLabel.textContent='Theme';
  const theme=createThemeSelect(tenant.theme_id);
  theme.disabled=!detail.can_manage;
  themeLabel.append(theme);
  const statusWrap=document.createElement('div');
  statusWrap.className='tenant-editor-status';
  const statusLabel=document.createElement('span');
  statusLabel.textContent='Status';
  const status=createStatusToggle(tenant.status,!detail.can_manage);
  statusWrap.append(statusLabel,status);
  const iconEditor=createTenantIconEditor(tenantIcon,!detail.can_manage,value=>{tenantIcon=value});
  const actions=document.createElement('div');
  actions.className='tenant-editor-actions';
  const save=document.createElement('button');
  save.type='button';
  save.className='primary-action compact';
  save.textContent='Save Tenant';
  save.disabled=!detail.can_manage;
  save.addEventListener('click',()=>saveTenantGrid(tenantId,{tenant_name:name.value,tenant_description:description.value,theme_id:theme.value,status:status.dataset.status,...tenantIcon}));
  actions.append(save);
  form.append(nameLabel,descriptionLabel,themeLabel,iconEditor,statusWrap,actions);
  return form;
}

function createThemeSelect(selectedThemeId){
  const select=document.createElement('select');
  const selected=selectedThemeId?String(selectedThemeId):'';
  currentThemes.forEach(theme=>{
    const option=document.createElement('option');
    option.value=theme.theme_id;
    option.textContent=theme.theme_name;
    option.selected=String(theme.theme_id)===selected;
    select.append(option);
  });
  if(selected&&currentThemes.some(theme=>String(theme.theme_id)===selected))select.value=selected;
  else if(currentThemes.length)select.value=(currentThemes.find(theme=>theme.theme_name==='Core Default')||currentThemes[0]).theme_id;
  return select;
}

function renderTenantExpanded(tenantId,detail){
  const wrap=document.createElement('div');
  wrap.className='tenant-grid-expanded';
  if(!detail){
    wrap.innerHTML='<p class="empty-state">Loading tenant details...</p>';
    loadTenantDetail(tenantId).catch(e=>msg(e.message));
    return wrap;
  }
  const tabs=document.createElement('div');
  tabs.className='tenant-grid-tabs';
  const active=tenantActiveTabs.get(tenantId)||'users';
  [['users','Users'],['applications','Applications']].forEach(([key,label])=>{
    const button=document.createElement('button');
    button.type='button';
    button.className='tenant-grid-tab';
    button.classList.toggle('active',active===key);
    button.textContent=label;
    button.addEventListener('click',()=>{
      tenantActiveTabs.set(tenantId,key);
      renderTenantGrid();
    });
    tabs.append(button);
  });
  wrap.append(tabs);
  wrap.append(active==='users'?renderTenantUsersGrid(tenantId,detail):renderTenantApplicationsGrid(tenantId,detail));
  return wrap;
}

function roleLabel(role){
  return String(role||'').replaceAll('_',' ');
}

function populateThemeSelect(selectId,selectedThemeId){
  const select=$(selectId);
  select.innerHTML='';
  const selected=selectedThemeId?String(selectedThemeId):'';
  currentThemes.forEach(theme=>{
    const option=document.createElement('option');
    option.value=theme.theme_id;
    option.textContent=theme.theme_name;
    option.selected=String(theme.theme_id)===selected;
    select.append(option);
  });
  if(selected&&currentThemes.some(theme=>String(theme.theme_id)===selected)){
    select.value=selected;
  }else if(!selected&&currentThemes.length){
    const coreDefault=currentThemes.find(theme=>theme.theme_name==='Core Default');
    select.value=(coreDefault||currentThemes[0]).theme_id;
  }
}

function setStatusToggle(button,status){
  const active=status==='active';
  button.dataset.status=active?'active':'disabled';
  button.textContent=active?'Active':'Disabled';
  button.title=active?'Active':'Disabled';
  button.setAttribute('aria-label',active?'Active':'Disabled');
  button.setAttribute('aria-pressed',String(active));
  button.classList.toggle('is-active',active);
}

function createStatusToggle(status,disabled=false,onChange=null){
  const button=document.createElement('button');
  button.type='button';
  button.className='status-toggle';
  button.disabled=disabled;
  setStatusToggle(button,status);
  button.addEventListener('click',async ()=>{
    if(button.disabled)return;
    const previous=button.dataset.status;
    const next=previous==='active'?'disabled':'active';
    setStatusToggle(button,next);
    if(!onChange)return;
    button.disabled=true;
    try{
      await onChange(next,previous,button);
    }catch(e){
      setStatusToggle(button,previous);
      msg(e.message);
    }finally{
      button.disabled=disabled;
    }
  });
  return button;
}

function renderTenantUsersGrid(tenantId,detail){
  const wrap=document.createElement('div');
  wrap.className='tenant-child-grid-wrap';
  const grid=document.createElement('div');
  grid.className='tenant-user-grid';
  const header=document.createElement('div');
  header.className='tenant-child-row tenant-child-head';
  ['Email','Role','Status',''].forEach(label=>{
    const cell=document.createElement('span');
    cell.textContent=label;
    header.append(cell);
  });
  grid.append(header);
  (detail.users||[]).forEach(user=>{
    const row=document.createElement('div');
    row.className='tenant-child-row';
    const email=document.createElement('span');
    email.textContent=user.email;
    const role=createRoleSelect(user.tenant_user_type);
    role.disabled=!detail.can_manage;
    const status=createStatusToggle(user.status,!detail.can_manage,next=>saveTenantUser(tenantId,user.email,role.value,next,{throwOnError:true}));
    const save=document.createElement('button');
    save.type='button';
    save.className='secondary-form-action table-action';
    save.textContent='Save';
    save.disabled=!detail.can_manage;
    save.addEventListener('click',()=>saveTenantUser(tenantId,user.email,role.value,status.dataset.status));
    row.append(email,role,status,save);
    grid.append(row);
  });
  if(newTenantUserRows.has(tenantId)){
    grid.append(renderNewTenantUserRow(tenantId,detail));
  }
  wrap.append(grid);
  const add=document.createElement('button');
  add.type='button';
  add.className='add-grid-button';
  add.textContent='+';
  add.disabled=!detail.can_manage;
  add.addEventListener('click',()=>{
    newTenantUserRows.add(tenantId);
    tenantActiveTabs.set(tenantId,'users');
    tenantEditorTab='users';
    renderTenantGrid();
  });
  wrap.append(add);
  return wrap;
}

function createRoleSelect(selectedRole){
  const select=document.createElement('select');
  ['tenant_user','tenant_administrator','owner'].forEach(value=>{
    const option=document.createElement('option');
    option.value=value;
    option.textContent=roleLabel(value);
    option.selected=selectedRole===value;
    select.append(option);
  });
  return select;
}

function renderNewTenantUserRow(tenantId,detail){
  const row=document.createElement('div');
  row.className='tenant-child-row new-grid-row';
  const email=document.createElement('input');
  email.type='email';
  email.placeholder='user@company.com';
  const role=createRoleSelect('tenant_user');
  const status=createStatusToggle('active',false);
  const actions=document.createElement('span');
  actions.className='inline-actions';
  const save=document.createElement('button');
  save.type='button';
  save.className='secondary-form-action table-action';
  save.textContent='Save';
  save.addEventListener('click',async ()=>{
    await saveTenantUser(tenantId,email.value,role.value,status.dataset.status,{render:false});
    newTenantUserRows.delete(tenantId);
    tenantEditorTab='users';
    renderTenantGrid();
  });
  const cancel=document.createElement('button');
  cancel.type='button';
  cancel.className='secondary-form-action table-action';
  cancel.textContent='x';
  cancel.addEventListener('click',()=>{
    newTenantUserRows.delete(tenantId);
    tenantEditorTab='users';
    renderTenantGrid();
  });
  actions.append(save,cancel);
  [email,role,status,actions].forEach(el=>{el.disabled=!detail.can_manage});
  row.append(email,role,status,actions);
  setTimeout(()=>email.focus(),0);
  return row;
}

function applicationAssignmentCount(detail,applicationId){
  return (detail.application_users||[]).filter(x=>x.application_id===applicationId).length;
}

function renderTenantApplicationsGrid(tenantId,detail){
  const wrap=document.createElement('div');
  wrap.className='tenant-child-grid-wrap';
  const grid=document.createElement('div');
  grid.className='tenant-application-grid';
  const header=document.createElement('div');
  header.className='tenant-child-row tenant-child-head';
  ['','Application','Type','Active','Users'].forEach(label=>{
    const cell=document.createElement('span');
    cell.textContent=label;
    header.append(cell);
  });
  grid.append(header);
  (detail.applications||[]).forEach(app=>{
    const key=`${tenantId}:${app.application_id}`;
    const row=document.createElement('div');
    row.className='tenant-child-row';
    const expand=document.createElement('button');
    expand.type='button';
    expand.className='grid-expand';
    expand.textContent=expandedTenantApplicationIds.has(key)?'v':'>';
    expand.addEventListener('click',()=>{
      if(expandedTenantApplicationIds.has(key))expandedTenantApplicationIds.delete(key);
      else expandedTenantApplicationIds.add(key);
      tenantActiveTabs.set(tenantId,'applications');
      tenantEditorTab='applications';
      renderTenantGrid();
    });
    const name=document.createElement('span');
    name.textContent=app.application_name;
    const type=document.createElement('span');
    type.textContent=roleLabel(app.application_type);
    const status=createStatusToggle(app.tenant_application_status,!detail.can_manage,next=>saveTenantApplication(tenantId,app.application_id,next,{throwOnError:true}));
    const users=document.createElement('span');
    users.textContent=String(applicationAssignmentCount(detail,app.application_id));
    row.append(expand,name,type,status,users);
    grid.append(row);
    if(expandedTenantApplicationIds.has(key)){
      grid.append(renderApplicationUsersGrid(tenantId,detail,app));
    }
  });
  wrap.append(grid);
  return wrap;
}

function renderApplicationUsersGrid(tenantId,detail,app){
  const wrap=document.createElement('div');
  wrap.className='tenant-application-users';
  const assigned=new Set((detail.application_users||[]).filter(x=>x.application_id===app.application_id).map(x=>x.tenant_user_id));
  const header=document.createElement('div');
  header.className='tenant-app-user-row tenant-child-head';
  ['User','Role','Enabled'].forEach(label=>{
    const cell=document.createElement('span');
    cell.textContent=label;
    header.append(cell);
  });
  wrap.append(header);
  (detail.users||[]).forEach(user=>{
    const row=document.createElement('div');
    row.className='tenant-app-user-row';
    const email=document.createElement('span');
    email.textContent=user.email;
    const role=document.createElement('span');
    role.textContent=roleLabel(user.tenant_user_type);
    const enabled=createStatusToggle(assigned.has(user.tenant_user_id)?'active':'disabled',!detail.can_manage||user.status!=='active',next=>saveTenantApplicationUser(tenantId,app.application_id,user.tenant_user_id,next==='active'));
    row.append(email,role,enabled);
    wrap.append(row);
  });
  return wrap;
}

async function createTenant(){
  clearMsg();
  try{
    const r=await api('tenant/manage/create',{method:'POST',body:JSON.stringify({tenant_name:$('new-tenant-name').value,theme_id:$('new-tenant-theme').value,...newTenantIcon})});
    $('new-tenant-name').value='';
    newTenantIcon={tenant_icon_preset:defaultTenantIconPreset,tenant_icon_svg:null};
    renderNewTenantIconEditor();
    $('new-tenant-panel').hidden=true;
    $('tenants').value=r.tenant.tenant_id;
    msg('Tenant created.','success');
    await load();
    showTenantManagement();
  }catch(e){msg(e.message)}
}

async function saveTenantGrid(tenantId,payload,options={}){
  clearMsg();
  try{
    const activeTenantId=$('tenants').value;
    const r=await api('tenant/manage/update',{method:'POST',body:JSON.stringify({
      tenant_id:tenantId,
      tenant_name:payload.tenant_name,
      tenant_description:payload.tenant_description,
      theme_id:payload.theme_id,
      status:payload.status,
      tenant_icon_preset:payload.tenant_icon_preset,
      tenant_icon_svg:payload.tenant_icon_svg
    })});
    msg('Tenant saved.','success');
    await loadTenantDetail(tenantId,{render:false});
    await refreshTenantSelector(activeTenantId);
    renderTenantGrid();
    return r;
  }catch(e){
    msg(e.message);
    if(options.throwOnError)throw e;
  }
}

async function saveTenantUser(tenantId,email,role,status,options={}){
  clearMsg();
  try{
    await api('tenant/manage/user/save',{method:'POST',body:JSON.stringify({tenant_id:tenantId,email,tenant_user_type:role,status})});
    msg('Tenant user saved.','success');
    await loadTenantDetail(tenantId,{render:false});
    if(options.render!==false)renderTenantGrid();
  }catch(e){
    msg(e.message);
    if(options.throwOnError)throw e;
  }
}

async function saveTenantApplication(tenantId,applicationId,status,options={}){
  clearMsg();
  try{
    await api('tenant/manage/application/save',{method:'POST',body:JSON.stringify({tenant_id:tenantId,application_id:applicationId,status})});
    msg('Tenant application saved.','success');
    await loadTenantDetail(tenantId,{render:false});
    renderTenantGrid();
    const apps=await api('application/list');
    renderApplications(apps.applications);
  }catch(e){
    msg(e.message);
    if(options.throwOnError)throw e;
  }
}

async function saveTenantApplicationUser(tenantId,applicationId,tenantUserId,enabled){
  clearMsg();
  try{
    await api('tenant/manage/application/user',{method:'POST',body:JSON.stringify({tenant_id:tenantId,application_id:applicationId,tenant_user_id:tenantUserId,enabled})});
    msg('Application user saved.','success');
    await loadTenantDetail(tenantId,{render:false});
    renderTenantGrid();
  }catch(e){msg(e.message)}
}

function bindClick(id,handler){
  const el=$(id);
  if(el)el.addEventListener('click',handler);
}

bindClick('profile-button',toggleProfileMenu);
bindClick('open-profile-dialog',openProfileDialog);
bindClick('open-password-dialog',openPasswordDialog);
bindClick('logout-submit',logout);
bindClick('close-profile-dialog',()=>closeDialog('profile-dialog'));
bindClick('save-profile-submit',saveProfile);
bindClick('close-password-dialog',()=>closeDialog('password-dialog'));
bindClick('change-password-submit',changePassword);
bindClick('core-about-button',showCoreAbout);
bindClick('manage-tenants',showTenantManagement);
bindClick('new-tenant-toggle',toggleNewTenantPanel);
bindClick('create-tenant-submit',createTenant);
bindClick('tenant-picker-trigger',toggleTenantPicker);
function renderNewTenantIconEditor(){
  const mount=$('new-tenant-icon-editor');
  if(!mount)return;
  mount.replaceChildren(createTenantIconEditor(newTenantIcon,false,value=>{newTenantIcon=value}));
}
renderNewTenantIconEditor();
const tenantPickerTrigger=$('tenant-picker-trigger');
if(tenantPickerTrigger){
  tenantPickerTrigger.addEventListener('keydown',event=>{
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();
      openTenantPicker(true);
    }else if(event.key==='Escape'){
      closeTenantPicker();
    }
  });
}
const tenantPicker=$('tenant-picker');
if(tenantPicker){
  tenantPicker.addEventListener('focusout',()=>setTimeout(()=>{
    if(!tenantPicker.contains(document.activeElement))closeTenantPicker();
  },0));
}
const profilePhotoInput=$('profile-photo-input');
if(profilePhotoInput){
  profilePhotoInput.addEventListener('change',async event=>{
    const file=event.target.files&&event.target.files[0];
    if(!file)return;
    try{
      profilePhotoDraft=await resizeProfilePhoto(file);
      renderProfilePhotoPreview();
    }catch(e){
      event.target.value='';
      msg(e.message);
    }
  });
}
bindClick('clear-profile-photo',()=>{
  profilePhotoDraft='';
  if(profilePhotoInput)profilePhotoInput.value='';
  renderProfilePhotoPreview();
});
const profileKnownInput=$('profile-known-input');
if(profileKnownInput)profileKnownInput.addEventListener('input',renderProfilePhotoPreview);
const panelTransparencySlider=$('panel-transparency-slider');
if(panelTransparencySlider){
  panelTransparencySlider.addEventListener('input',event=>{
    applyPanelGlassState(event.target.value);
  });
  panelTransparencySlider.addEventListener('change',event=>{
    panelGlassTransparency=clampTransparency(event.target.value);
    savePanelGlassPrefs();
    applyPanelGlassState(event.target.value);
  });
}

document.querySelectorAll('.tenant-tab').forEach(button=>{
  button.addEventListener('click',()=>showTenantTab(button.dataset.tenantTab));
});

document.addEventListener('click',event=>{
  if(event.target.closest('.profile-wrap')||event.target.closest('.tenant-picker'))return;
  closeMenus();
});

Object.assign(window,{logout,toggleProfileMenu,openProfileDialog,openPasswordDialog,closeDialog,switchTenant,saveProfile,changePassword,openApplication,showApplicationHome,showTenantManagement,showCoreAbout});
load();
})();
