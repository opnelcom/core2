(()=>{
const $=id=>document.getElementById(id);
const apiBase='/admin/api/admin/';
let currentView='dashboard';
let cache={meta:null,rows:null};
let searchTerm='';
let selectedRowIndex=null;

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

const views={
  dashboard:{title:'Dashboard',eyebrow:'Overview',endpoint:'summary'},
  applications:{title:'Applications',eyebrow:'Core catalog',endpoint:'applications',key:'applications'},
  themes:{title:'Themes',eyebrow:'Branding',endpoint:'themes',key:'themes'},
  tenants:{title:'Tenants',eyebrow:'Tenant catalog',endpoint:'tenants',key:'tenants'},
  users:{title:'Users',eyebrow:'Identity',endpoint:'users',key:'users'},
  'tenant-users':{title:'Tenant users',eyebrow:'Access',endpoint:'tenant-users',key:'tenant_users'},
  'tenant-applications':{title:'Tenant applications',eyebrow:'Entitlements',endpoint:'tenant-applications',key:'tenant_applications'},
  'tenant-application-users':{title:'Application users',eyebrow:'Assignments',endpoint:'tenant-application-users',key:'tenant_application_users'}
};

async function api(path,options={}){
  const r=await fetch(apiBase+path,{headers:{'content-type':'application/json'},...options});
  const j=await r.json();
  if(!r.ok)throw new Error(j.error||'Request failed');
  return j;
}

function setAlert(message){
  $('alert').hidden=!message;
  $('alert').textContent=message||'';
}

function optionList(items,valueKey,labelFn,selected){
  return (items||[]).map(item=>{
    const value=item[valueKey];
    const label=labelFn(item);
    return `<option value="${escapeHtml(value)}" ${value===selected?'selected':''}>${escapeHtml(label)}</option>`;
  }).join('');
}

function escapeHtml(value){
  return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function status(value){
  return `<span class="status-pill ${escapeHtml(value)}">${escapeHtml(value)}</span>`;
}

function setHeader(){
  const v=views[currentView];
  $('view-title').textContent=v.title;
  $('view-eyebrow').textContent=v.eyebrow;
  document.querySelectorAll('.nav-button').forEach(button=>button.classList.toggle('active',button.dataset.view===currentView));
}

function labelFromKey(key){
  return String(key||'').replaceAll('_',' ');
}

async function loadMeta(){
  cache.meta=await api('meta');
}

async function loadView(view=currentView){
  currentView=view;
  searchTerm='';
  selectedRowIndex=null;
  setHeader();
  setAlert('');
  try{
    if(currentView==='dashboard')return renderDashboard(await api('summary'));
    await loadMeta();
    const v=views[currentView];
    cache.rows=(await api(v.endpoint))[v.key]||[];
    renderCrud();
  }catch(e){
    setAlert(e.message);
  }
}

function renderDashboard(summary){
  $('view-root').innerHTML=`<div class="summary-grid">
    ${Object.entries(summary).map(([key,value])=>`<article class="summary-card"><span>${escapeHtml(labelFromKey(key))}</span><strong>${escapeHtml(value)}</strong></article>`).join('')}
  </div>`;
}

function renderCrud(){
  $('view-root').innerHTML=`<div class="admin-stack"><section class="panel"><div class="list-heading"><h3>Existing records</h3><div class="list-tools"><label class="search-control" for="list-search"><span>Search</span><input id="list-search" type="search" placeholder="Search records"></label><button id="create-record" class="add-record-button" type="button" aria-label="Create record">+</button></div></div><div class="table-wrap"><table><thead id="table-head"></thead><tbody id="table-body"></tbody></table></div></section><section id="form-panel" class="panel" hidden><h3 id="form-title"></h3><form id="edit-form" class="form-grid"></form></section></div>`;
  $('list-search').value=searchTerm;
  $('list-search').addEventListener('input',event=>{
    searchTerm=event.target.value;
    selectedRowIndex=null;
    renderTable();
  });
  $('create-record').addEventListener('click',()=>{
    selectedRowIndex=null;
    renderTable();
    renderForm();
  });
  renderTable();
}

function input(name,label,value='',type='text',extra=''){
  return `<div><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${escapeHtml(value)}" ${extra}></div>`;
}

function textarea(name,label,value=''){
  return `<div class="full"><label for="${name}">${label}</label><textarea id="${name}" name="${name}" rows="6">${escapeHtml(value)}</textarea></div>`;
}

function applicationIconEditor(value=''){
  return `<div class="full icon-editor">
    <label>Application icon</label>
    <div class="application-icon-row">
      <span id="application-icon-preview" class="app-icon-preview" aria-label="Application icon preview"></span>
      <div>
        <input id="application_icon_upload" type="file" accept=".svg,image/svg+xml">
        <p class="field-help">Upload an SVG file or paste SVG markup below.</p>
      </div>
    </div>
    <textarea id="application_icon_svg" name="application_icon_svg" rows="8" placeholder="&lt;svg ...&gt;">${escapeHtml(value)}</textarea>
  </div>`;
}

function select(name,label,options){
  return `<div><label for="${name}">${label}</label><select id="${name}" name="${name}">${options}</select></div>`;
}

function hidden(name,value=''){
  return `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`;
}

function renderForm(row={}){
  const panel=$('form-panel');
  const form=$('edit-form');
  panel.hidden=false;
  $('form-title').textContent=row.__editing?'Edit record':'Create record';
  const meta=cache.meta||{};
  if(currentView==='applications'){
    form.innerHTML=[
      hidden('application_id',row.application_id),
      input('application_code','Code',row.application_code),
      input('application_name','Name',row.application_name),
      textarea('application_description','Description',row.application_description),
      applicationIconEditor(row.application_icon_svg),
      select('application_type','Type',optionList([{v:'public_application',l:'Public application'},{v:'administration_application',l:'Administration application'}],'v',x=>x.l,row.application_type||'public_application')),
      input('route_prefix','Route prefix',row.route_prefix||'/'),
      select('status','Status',optionList([{v:'active',l:'Active'},{v:'disabled',l:'Disabled'}],'v',x=>x.l,row.status||'active'))
    ].join('');
  }else if(currentView==='themes'){
    form.innerHTML=[
      hidden('theme_id',row.theme_id),
      input('theme_name','Theme name',row.theme_name),
      input('css_file','CSS file',row.css_file||'default.css'),
      select('status','Status',optionList([{v:'active',l:'Active'},{v:'disabled',l:'Disabled'}],'v',x=>x.l,row.status||'active'))
    ].join('');
  }else if(currentView==='tenants'){
    form.innerHTML=[
      hidden('tenant_id',row.tenant_id),
      input('tenant_name','Tenant name',row.tenant_name),
      select('tenant_type','Type',optionList([{v:'personal_tenant',l:'Personal tenant'},{v:'public_tenant',l:'Public tenant'}],'v',x=>x.l,row.tenant_type||'public_tenant')),
      select('theme_id','Theme',optionList(meta.themes,'theme_id',x=>x.theme_name,row.theme_id)),
      select('status','Status',optionList([{v:'active',l:'Active'},{v:'disabled',l:'Disabled'}],'v',x=>x.l,row.status||'active'))
    ].join('');
  }else if(currentView==='users'){
    form.innerHTML=[
      hidden('user_id',row.user_id),
      input('email','Email',row.email,'email'),
      input('password',row.user_id?'New password':'Password','password','password'),
      input('known_name','Known name',row.known_name),
      input('full_name','Full name',row.full_name),
      select('user_type','User type',optionList([{v:'standard_user',l:'Standard user'},{v:'administration_user',l:'Administration user'}],'v',x=>x.l,row.user_type||'standard_user')),
      select('status','Status',optionList([{v:'pending',l:'Pending'},{v:'active',l:'Active'},{v:'disabled',l:'Disabled'}],'v',x=>x.l,row.status||'active'))
    ].join('');
  }else if(currentView==='tenant-users'){
    form.innerHTML=[
      hidden('tenant_user_id',row.tenant_user_id),
      select('tenant_id','Tenant',optionList(meta.tenants,'tenant_id',x=>`${x.tenant_name} (${x.tenant_type})`,row.tenant_id)),
      input('email','Email',row.email,'email'),
      select('tenant_user_type','Role',optionList([{v:'tenant_user',l:'Tenant user'},{v:'tenant_administrator',l:'Tenant administrator'},{v:'owner',l:'Owner'}],'v',x=>x.l,row.tenant_user_type||'tenant_user')),
      select('status','Status',optionList([{v:'active',l:'Active'},{v:'disabled',l:'Disabled'}],'v',x=>x.l,row.status||'active'))
    ].join('');
  }else if(currentView==='tenant-applications'){
    form.innerHTML=[
      hidden('tenant_application_id',row.tenant_application_id),
      select('tenant_id','Tenant',optionList(meta.tenants,'tenant_id',x=>x.tenant_name,row.tenant_id)),
      select('application_id','Application',optionList(meta.applications,'application_id',x=>`${x.application_name} (${x.application_type})`,row.application_id)),
      select('status','Status',optionList([{v:'active',l:'Active'},{v:'disabled',l:'Disabled'}],'v',x=>x.l,row.status||'active'))
    ].join('');
  }else if(currentView==='tenant-application-users'){
    form.innerHTML=[
      select('tenant_application_id','Tenant application',optionList(meta.tenant_applications,'tenant_application_id',x=>`${x.tenant_name||''} - ${x.application_name||x.application_code||''}`,row.tenant_application_id)),
      select('tenant_user_id','Tenant user',optionList(meta.tenant_users,'tenant_user_id',x=>`${x.email} (${x.tenant_user_type})`,row.tenant_user_id)),
      select('enabled','Assignment',optionList([{v:'true',l:'Enabled'},{v:'false',l:'Disabled'}],'v',x=>x.l,'true'))
    ].join('');
  }
  form.innerHTML+=`<div class="full form-actions"><button type="submit">Save</button><button id="close-form" class="secondary-action" type="button">Cancel</button></div>`;
  form.addEventListener('submit',saveForm);
  $('close-form').addEventListener('click',hideForm);
  bindApplicationIconEditor();
  panel.scrollIntoView({behavior:'smooth',block:'start'});
}

function columns(){
  return {
    applications:['application_id','application_code','application_name','application_description','application_type','route_prefix','status'],
    themes:['theme_id','theme_name','css_file','status'],
    tenants:['tenant_id','tenant_name','tenant_type','theme_name','status'],
    users:['user_id','email','known_name','full_name','user_type','status'],
    'tenant-users':['tenant_user_id','tenant_name','email','tenant_user_type','status'],
    'tenant-applications':['tenant_application_id','tenant_name','application_name','status'],
    'tenant-application-users':['tenant_application_user_id','tenant_name','application_name','email']
  }[currentView];
}

function renderTable(){
  const cols=columns();
  $('table-head').innerHTML=`<tr>${cols.map(c=>`<th>${escapeHtml(c.replaceAll('_',' '))}</th>`).join('')}</tr>`;
  const rows=filteredRows(cols);
  if(!rows.length){
    $('table-body').innerHTML=`<tr><td colspan="${cols.length}"><div class="empty-state">${searchTerm.trim()?'No records match your search.':'No records found.'}</div></td></tr>`;
    return;
  }
  $('table-body').innerHTML=rows.map((item,index)=>{
    const row=item.row;
    return `<tr class="record-row ${item.index===selectedRowIndex?'active':''}" tabindex="0" data-row="${item.index}">${cols.map(col=>`<td>${col==='status'||col==='user_type'?status(row[col]):escapeHtml(row[col])}</td>`).join('')}</tr>`;
  }).join('');
  document.querySelectorAll('[data-row]').forEach(rowEl=>{
    const openRow=()=>{
      selectedRowIndex=Number(rowEl.dataset.row);
      renderTable();
      renderForm({...cache.rows[selectedRowIndex],__editing:true});
    };
    rowEl.addEventListener('click',openRow);
    rowEl.addEventListener('keydown',event=>{
      if(event.key==='Enter'||event.key===' '){
        event.preventDefault();
        openRow();
      }
    });
  });
}

function filteredRows(cols){
  const rows=cache.rows||[];
  const needle=searchTerm.trim().toLowerCase();
  const indexed=rows.map((row,index)=>({row,index}));
  if(!needle)return indexed;
  return indexed.filter(item=>{
    const haystack=Object.values(item.row).concat(cols.map(col=>item.row[col])).map(value=>String(value??'').toLowerCase()).join(' ');
    return haystack.includes(needle);
  });
}

function isPreviewSafeSvg(svg){
  const value=String(svg||'').replace(/^\uFEFF/,'').replace(/^<\?xml[\s\S]*?\?>\s*/i,'').trim();
  return value.length<=20000
    && !/<!doctype/i.test(value)
    && /^<svg[\s>][\s\S]*<\/svg>$/.test(value)
    && !/<(script|style|iframe|object|embed|foreignObject|link|meta)\b/i.test(value)
    && !/\son[a-z]+\s*=/i.test(value)
    && !/\sstyle\s*=/i.test(value)
    && !/(?:href|src)\s*=\s*(['"])\s*(?!#|data:image\/)(?:javascript:|https?:|\/\/)/i.test(value)
    && !/javascript\s*:/i.test(value);
}

function updateApplicationIconPreview(){
  const preview=$('application-icon-preview');
  const textarea=$('application_icon_svg');
  if(!preview||!textarea)return;
  const svg=cleanSvgInput(textarea.value);
  preview.innerHTML=isPreviewSafeSvg(svg)?svg:'';
  preview.classList.toggle('empty',!preview.innerHTML);
}

function cleanSvgInput(value){
  return String(value||'').replace(/^\uFEFF/,'').replace(/^<\?xml[\s\S]*?\?>\s*/i,'').trim();
}

function bindApplicationIconEditor(){
  const textarea=$('application_icon_svg');
  const upload=$('application_icon_upload');
  if(!textarea||!upload)return;
  textarea.addEventListener('input',updateApplicationIconPreview);
  upload.addEventListener('change',async event=>{
    const file=event.target.files&&event.target.files[0];
    if(!file)return;
    if(file.size>20000){
      setAlert('SVG icon must be 20KB or smaller');
      upload.value='';
      return;
    }
    textarea.value=cleanSvgInput(await file.text());
    updateApplicationIconPreview();
  });
  updateApplicationIconPreview();
}

function hideForm(){
  selectedRowIndex=null;
  const panel=$('form-panel');
  if(panel)panel.hidden=true;
  renderTable();
}

async function saveForm(event){
  event.preventDefault();
  setAlert('');
  const data=Object.fromEntries(new FormData(event.target).entries());
  Object.keys(data).forEach(key=>{if(data[key]==='')delete data[key]});
  if(currentView==='applications'){
    data.application_icon_svg=cleanSvgInput($('application_icon_svg')?.value);
  }
  if(data.enabled)data.enabled=data.enabled==='true';
  try{
    const endpoint=views[currentView].endpoint;
    await api(endpoint,{method:'POST',body:JSON.stringify(data)});
    await loadView(currentView);
  }catch(e){
    setAlert(e.message);
  }
}

document.querySelectorAll('.nav-button').forEach(button=>button.addEventListener('click',()=>loadView(button.dataset.view)));
$('refresh-button').addEventListener('click',()=>loadView(currentView));
loadView('dashboard');
})();
