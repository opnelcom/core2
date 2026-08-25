(()=>{
const $=id=>document.getElementById(id);
const rememberedKey='coreSaasRememberedDevice';
const panelGlassKey='coreSaasPanelGlassByApplication';
let currentUser=null;
let currentApplications=[];
let currentTenants=[];
let currentThemes=[];
let activeApplication=null;
let panelGlassByApplication=readPanelGlassPrefs();
let managedTenantId=null;
let managedTenantDetail=null;
let selectedApplicationUsersId=null;
let tenantDetails=new Map();
let expandedTenantIds=new Set();
let tenantActiveTabs=new Map();
let expandedTenantApplicationIds=new Set();
let newTenantUserRows=new Set();
let profilePhotoDraft;

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
}

function toggleProfileMenu(){
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

function applicationKey(app){
  return app.application_code||app.route_prefix||app.application_id;
}

function readPanelGlassPrefs(){
  try{
    return JSON.parse(localStorage.getItem(panelGlassKey)||'{}')||{};
  }catch{
    return {};
  }
}

function savePanelGlassPrefs(){
  localStorage.setItem(panelGlassKey,JSON.stringify(panelGlassByApplication));
}

function clampTransparency(value){
  const number=Number(value);
  if(!Number.isFinite(number))return 0;
  return Math.max(0,Math.min(100,Math.round(number)));
}

function applicationTransparency(app){
  if(!app)return false;
  const saved=panelGlassByApplication[applicationKey(app)];
  if(saved===true)return 60;
  if(saved===false||saved===undefined||saved===null)return 0;
  return clampTransparency(saved);
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
    const tooltip=document.createElement('span');
    tooltip.className='application-icon-tooltip';
    tooltip.textContent=app.application_name||app.application_code||'Application';
    button.append(tooltip);
    button.addEventListener('click',()=>openApplication(app));
    list.append(button);
  });
  updateApplicationIconSelection();
  renderApplicationHomeList();
}

function updateApplicationIconSelection(){
  const activeKey=activeApplication?applicationKey(activeApplication):'';
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

function renderTenantSelector(tenants,selectedTenantId){
  const select=$('tenants');
  const preferred=selectedTenantId&&tenants.some(tenant=>tenant.tenant_id===selectedTenantId)
    ? selectedTenantId
    : tenants[0]?.tenant_id;
  select.innerHTML=tenants.map(tenant=>`<option value="${tenant.tenant_id}">${tenant.tenant_name}</option>`).join('');
  if(preferred)select.value=preferred;
  select.disabled=!tenants.length;
  applyTenantTheme(tenants.find(tenant=>tenant.tenant_id===select.value)||tenants[0]);
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
  $('app').classList.add('application-open');
  const route=app.route_prefix||'/';
  const transparency=applicationTransparency(app);
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
  $('app').classList.remove('application-open');
  applyPanelGlassState(false);
  updateApplicationIconSelection();
  $('application-frame').removeAttribute('src');
  $('core-about').hidden=true;
  $('application-workspace').hidden=true;
  $('tenant-management').hidden=true;
  $('landing-home').hidden=false;
  renderApplicationHomeList();
  history.replaceState(null,'',location.pathname);
}

function showTenantManagement(){
  clearMsg();
  activeApplication=null;
  $('app').classList.remove('application-open');
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
  $('app').classList.remove('application-open');
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

async function switchTenant(){
  clearMsg();
  try{
    const tenantId=$('tenants').value;
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
    grid.innerHTML='<p class="empty-state">No tenants are available.</p>';
    return;
  }
  const header=document.createElement('div');
  header.className='tenant-grid-row tenant-grid-head';
  ['','Tenant ID','Tenant name','Status','Theme',''].forEach(label=>{
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
    const expand=document.createElement('button');
    expand.type='button';
    expand.className='grid-expand';
    expand.textContent=expandedTenantIds.has(tenant.tenant_id)?'v':'>';
    expand.addEventListener('click',async ()=>{
      if(expandedTenantIds.has(tenant.tenant_id)){
        expandedTenantIds.delete(tenant.tenant_id);
        renderTenantGrid();
        return;
      }
      await loadTenantDetail(tenant.tenant_id);
    });
    const id=document.createElement('span');
    id.textContent=tenant.tenant_id;
    const name=document.createElement('input');
    name.className='grid-text-input';
    name.value=tenant.tenant_name||'';
    name.disabled=!canManage;
    const theme=createThemeSelect(tenant.theme_id);
    theme.disabled=!canManage;
    const status=createStatusToggle(tenant.status,!canManage,async next=>{
      await saveTenantGrid(tenant.tenant_id,{tenant_name:name.value,theme_id:theme.value,status:next});
    });
    const save=document.createElement('button');
    save.type='button';
    save.className='secondary-form-action table-action';
    save.textContent='Save';
    save.disabled=!canManage;
    save.addEventListener('click',()=>saveTenantGrid(tenant.tenant_id,{tenant_name:name.value,theme_id:theme.value,status:status.dataset.status}));
    row.append(expand,id,name,status,theme,save);
    grid.append(row);
    if(expandedTenantIds.has(tenant.tenant_id)){
      grid.append(renderTenantExpanded(tenant.tenant_id,detail));
    }
  });
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
    renderTenantGrid();
  });
  const cancel=document.createElement('button');
  cancel.type='button';
  cancel.className='secondary-form-action table-action';
  cancel.textContent='x';
  cancel.addEventListener('click',()=>{
    newTenantUserRows.delete(tenantId);
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
    const r=await api('tenant/manage/create',{method:'POST',body:JSON.stringify({tenant_name:$('new-tenant-name').value,theme_id:$('new-tenant-theme').value})});
    $('new-tenant-name').value='';
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
      theme_id:payload.theme_id,
      status:payload.status
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
bindClick('home-button',showApplicationHome);
bindClick('core-about-button',showCoreAbout);
bindClick('manage-tenants',showTenantManagement);
bindClick('new-tenant-toggle',toggleNewTenantPanel);
bindClick('create-tenant-submit',createTenant);
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
    if(!activeApplication)return;
    const key=applicationKey(activeApplication);
    panelGlassByApplication={...panelGlassByApplication,[key]:clampTransparency(event.target.value)};
    savePanelGlassPrefs();
    applyPanelGlassState(event.target.value);
  });
}

$('tenants').addEventListener('change',switchTenant);
document.querySelectorAll('.tenant-tab').forEach(button=>{
  button.addEventListener('click',()=>showTenantTab(button.dataset.tenantTab));
});

document.addEventListener('click',event=>{
  if(event.target.closest('.profile-wrap'))return;
  closeMenus();
});

Object.assign(window,{logout,toggleProfileMenu,openProfileDialog,openPasswordDialog,closeDialog,switchTenant,saveProfile,changePassword,openApplication,showApplicationHome,showTenantManagement,showCoreAbout});
load();
})();
