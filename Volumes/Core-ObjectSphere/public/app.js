(()=>{
const $=id=>document.getElementById(id);
let items=[];
let selectedId=null;
let expanded=new Set();
let searchTerm='';
let draggedId=null;
let activeView='about';
let activeItemPanel='object';
let eventScope='direct';
let editingEventId=null;
let dashboardMonth=new Date();
let setup={object_types:[],attributes:[],type_counts:[],event_types:[],event_type_counts:[],attribute_types:['text','large_text','date','number','float','currency'],event_severities:['low','medium','high','critical'],event_statuses:['open','in_review','resolved','closed']};
let itemMetadata={object_types:[],attributes:[],item_types:[],values:[]};
let selectedSetupTypeId=null;
let selectedEventTypeId=null;
let activeItemTypeId=null;
let expandedSetupTypes=new Set();
let newAttributeTypeId=null;
let importDraft=null;
let enhanceDraft=null;
let voiceDraft=null;
let voiceRecognizer=null;
let voiceListening=false;
let openAISetting={has_openai_api_key:false,model:'gpt-4.1-mini'};
let currentWireframe=null;
let wireframeLoading=false;
let locationMap=null;
let locationMarker=null;
let locationTileLayer=null;
let locationOfflineLayer=null;
let locationFallbackTimer=null;
let activeTileProvider='osm';
const tileProviders={
  'osm':{
    url:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    options:{
      maxZoom:19,
      attribution:'&copy; OpenStreetMap contributors'
    }
  },
  'carto-light':{
    url:'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    options:{
      maxZoom:20,
      attribution:'&copy; OpenStreetMap contributors &copy; CARTO'
    }
  },
  'carto-dark':{
    url:'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    options:{
      maxZoom:20,
      attribution:'&copy; OpenStreetMap contributors &copy; CARTO'
    }
  },
  'esri-world':{
    url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    options:{
      maxZoom:19,
      attribution:'Tiles &copy; Esri'
    }
  },
  'offline':{
    offline:true
  }
};

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

async function api(path,options={}){
  const r=await fetch('/objectsphere/api/'+path,{headers:{'content-type':'application/json'},...options});
  const j=await r.json();
  if(!r.ok)throw new Error(j.error||'Request failed');
  return j;
}

function readFileDataUrl(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(reader.error||new Error('Unable to read file'));
    reader.readAsDataURL(file);
  });
}

function readFileText(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(reader.error||new Error('Unable to read file'));
    reader.readAsText(file);
  });
}

async function readImageDataUrl(file,maxSize=1600,quality=0.82){
  const raw=await readFileDataUrl(file);
  if(!file.type.startsWith('image/'))return raw;
  return new Promise(resolve=>{
    const img=new Image();
    img.onload=()=>{
      const scale=Math.min(1,maxSize/Math.max(img.width,img.height));
      if(scale>=1&&file.size<900000)return resolve(raw);
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(img.width*scale));
      canvas.height=Math.max(1,Math.round(img.height*scale));
      const ctx=canvas.getContext('2d');
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      resolve(canvas.toDataURL('image/jpeg',quality));
    };
    img.onerror=()=>resolve(raw);
    img.src=raw;
  });
}

function setAlert(message){
  $('alert').hidden=!message;
  $('alert').textContent=message||'';
}

function status(message){
  $('status').textContent=message;
}

function typeLabel(value){
  return String(value||'').replaceAll('_',' ');
}

function itemLabel(item){
  const qty=Number(item?.quantity)||1;
  return qty>1?`${item.item_name} (${qty})`:item.item_name;
}

function activeTypes(){
  return (setup.object_types||[]).filter(type=>!type.deleted&&type.status==='active');
}

function activeEventTypes(){
  return (setup.event_types||[]).filter(type=>!type.deleted&&type.status==='active');
}

function activeAttributes(typeId){
  return (setup.attributes||[]).filter(attribute=>!attribute.deleted&&attribute.object_type_id===typeId&&attribute.status==='active')
    .sort((a,b)=>(a.sort_order-b.sort_order)||a.attribute_name.localeCompare(b.attribute_name));
}

function assignedTypeIds(){
  return new Set((itemMetadata.item_types||[]).filter(type=>type.status==='active').map(type=>type.object_type_id));
}

function valueMap(){
  return new Map((itemMetadata.values||[]).map(value=>[value.attribute_id,value.value_text||'']));
}

function selectedItem(){
  return items.find(item=>item.item_id===selectedId)||null;
}

function hasLocation(item){
  return Number.isFinite(Number(item?.latitude))&&Number.isFinite(Number(item?.longitude));
}

function coordinateInputValue(value){
  return Number.isFinite(Number(value))?Number(value).toFixed(7):'';
}

function clamp(value,min,max){
  return Math.min(max,Math.max(min,value));
}

function normalizeLongitude(value){
  const longitude=Number(value);
  if(!Number.isFinite(longitude))return null;
  return ((((longitude+180)%360)+360)%360)-180;
}

function normalizeLocation(latitude,longitude){
  const lat=Number(latitude);
  const lng=normalizeLongitude(longitude);
  if(!Number.isFinite(lat)||lng===null)return null;
  return {latitude:clamp(lat,-85.0511288,85.0511288),longitude:lng};
}

function typeCountMap(){
  return new Map((setup.type_counts||[]).map(count=>[count.object_type_id,Number(count.item_count)||0]));
}

function eventTypeCountMap(){
  return new Map((setup.event_type_counts||[]).map(count=>[count.event_type_id,Number(count.event_count)||0]));
}

function itemMap(){
  return new Map(items.map(item=>[item.item_id,item]));
}

function eventDateInputValue(value){
  const date=value?new Date(value):new Date();
  if(Number.isNaN(date.getTime()))return '';
  const offset=date.getTimezoneOffset();
  const local=new Date(date.getTime()-offset*60000);
  return local.toISOString().slice(0,16);
}

function formatDateTime(value){
  if(!value)return '';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '';
  return date.toLocaleString();
}

function expandAncestors(itemId){
  const map=itemMap();
  let current=map.get(itemId);
  const seen=new Set();
  while(current?.parent_item_id&&!seen.has(current.parent_item_id)){
    expanded.add(current.parent_item_id);
    seen.add(current.parent_item_id);
    current=map.get(current.parent_item_id);
  }
}

function childrenByParent(){
  const map=new Map();
  items.forEach(item=>{
    const key=item.parent_item_id||'root';
    if(!map.has(key))map.set(key,[]);
    map.get(key).push(item);
  });
  map.forEach(children=>children.sort((a,b)=>(a.sort_order-b.sort_order)||a.item_name.localeCompare(b.item_name)));
  return map;
}

function isVisibleMatch(item){
  if(!searchTerm)return true;
  const text=`${item.item_name} ${item.item_description||''}`.toLowerCase();
  return text.includes(searchTerm);
}

function descendantIds(id,map){
  const result=new Set();
  function walk(parentId){
    (map.get(parentId)||[]).forEach(child=>{
      result.add(child.item_id);
      walk(child.item_id);
    });
  }
  walk(id);
  return result;
}

function shouldShow(item,map){
  if(!searchTerm)return true;
  if(isVisibleMatch(item))return true;
  return [...descendantIds(item.item_id,map)].some(id=>isVisibleMatch(itemMap().get(id)||{}));
}

function clearDropHints(){
  document.querySelectorAll('.drop-before,.drop-after,.drop-inside').forEach(el=>{
    el.classList.remove('drop-before','drop-after','drop-inside');
  });
}

function dropPosition(event,row){
  const rect=row.getBoundingClientRect();
  const ratio=(event.clientY-rect.top)/Math.max(rect.height,1);
  if(ratio<0.25)return 'before';
  if(ratio>0.75)return 'after';
  return 'inside';
}

async function positionItem(itemId,targetId,position){
  if(!itemId||!targetId||itemId===targetId)return;
  try{
    await api('items/position',{method:'POST',body:JSON.stringify({item_id:itemId,target_item_id:targetId,position})});
    if(position==='inside')expanded.add(targetId);
    selectedId=itemId;
    status(position==='inside'?'Item moved under target.':'Item reordered.');
    await load();
  }catch(e){
    setAlert(e.message);
  }
}

async function loadSetup(){
  const [r,ai]=await Promise.all([api('setup/list'),api('setup/openai')]);
  setup=r;
  openAISetting=ai;
  renderSetup();
  if(selectedId)await loadItemMetadata(selectedId);
}

async function loadItemMetadata(itemId){
  if(!itemId){
    itemMetadata={object_types:[],attributes:[],item_types:[],values:[]};
    renderItemTypes();
    return;
  }
  itemMetadata=await api('items/metadata?item_id='+encodeURIComponent(itemId));
  if(!activeItemTypeId||!assignedTypeIds().has(activeItemTypeId))activeItemTypeId=[...assignedTypeIds()][0]||null;
  renderItemTypes();
}

function renderSetup(){
  const attributePanel=$('setup-attribute-panel');
  if(attributePanel)attributePanel.hidden=!selectedSetupTypeId;
  renderOpenAISettings();
  renderTypeList();
  renderEventTypeList();
  renderAttributeTypeSelect();
  renderAttributeList();
  renderDashboard();
}

function renderOpenAISettings(){
  if(!$('openai-form'))return;
  $('openai-model').value=openAISetting.model||'gpt-4.1-mini';
  $('openai-api-key').value='';
  const updated=openAISetting.updated_at?` Last updated ${new Date(openAISetting.updated_at).toLocaleString()}.`:'';
  $('openai-key-status').textContent=openAISetting.has_openai_api_key?`Key saved for this tenant.${updated}`:'No key saved for this tenant.';
}

function downloadJson(filename,data){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;
  link.download=filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function transferStatus(message){
  if($('tenant-transfer-status'))$('tenant-transfer-status').textContent=message;
}

async function exportTenantData(){
  try{
    setAlert('');
    status('Exporting ObjectSphere data...');
    transferStatus('Preparing export...');
    const includeOpenAISettings=$('transfer-openai-settings')?.checked===true;
    const exported=await api('setup/export',{method:'POST',body:JSON.stringify({include_openai_settings:includeOpenAISettings})});
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    downloadJson(`objectsphere-export-${stamp}.json`,exported);
    transferStatus(`Exported ${exported.counts?.items||0} objects, ${exported.counts?.attachments||0} attachments, and ${exported.counts?.events||0} events.`);
    status('Export downloaded.');
  }catch(e){
    setAlert(e.message);
    status('Export failed.');
    transferStatus('Export failed.');
  }
}

async function importTenantData(input){
  if(!input.files.length)return;
  const file=input.files[0];
  try{
    setAlert('');
    const mode=$('tenant-import-mode')?.value||'append';
    if(mode==='replace'&&!confirm('Replace all existing ObjectSphere data in this tenant before importing?'))return;
    status('Reading import file...');
    transferStatus('Reading import file...');
    const text=await readFileText(file);
    const exported=JSON.parse(text);
    if(exported.format!=='objectsphere-tenant-export')throw new Error('This is not an ObjectSphere tenant export.');
    status('Importing ObjectSphere data...');
    transferStatus('Importing data...');
    const includeOpenAISettings=$('transfer-openai-settings')?.checked===true;
    const result=await api('setup/import',{method:'POST',body:JSON.stringify({mode,include_openai_settings:includeOpenAISettings,export:exported})});
    const counts=result.counts||{};
    transferStatus(`Imported ${counts.items||0} objects, ${counts.attachments||0} attachments, and ${counts.events||0} events.`);
    status('Import complete.');
    await load();
  }catch(e){
    setAlert(e.message);
    status('Import failed.');
    transferStatus('Import failed.');
  }finally{
    input.value='';
  }
}

function showView(view){
  activeView=view;
  document.querySelectorAll('.view-panel').forEach(panel=>{
    panel.hidden=panel.id!==`view-${view}`;
  });
  document.querySelectorAll('.menu-item').forEach(button=>{
    button.classList.toggle('active',button.dataset.view===view);
  });
  if(view==='setup')loadSetup().catch(e=>setAlert(e.message));
  if(view==='dashboard')load().catch(e=>setAlert(e.message));
  if(view==='objectsphere')renderTree();
}

function renderDashboard(){
  const summary=$('dashboard-summary');
  const list=$('type-counts');
  if(!summary||!list)return;
  const types=(setup.object_types||[]).filter(type=>!type.deleted);
  const attrs=(setup.attributes||[]).filter(attribute=>!attribute.deleted);
  const activeObjectCount=(items||[]).filter(item=>item.status==='active').length;
  const activeTypeCount=types.filter(type=>type.status==='active').length;
  const activeAttrCount=attrs.filter(attribute=>attribute.status==='active').length;
  summary.innerHTML='';
  [
    ['Objects',activeObjectCount],
    ['Object types',types.length],
    ['Active types',activeTypeCount],
    ['Attributes',attrs.length],
    ['Active attributes',activeAttrCount]
  ].forEach(([label,value])=>{
    const card=document.createElement('article');
    card.className='metric-card';
    const name=document.createElement('span');
    name.textContent=label;
    const number=document.createElement('strong');
    number.textContent=value;
    card.append(name,number);
    summary.append(card);
  });
  list.innerHTML='';
  if(!types.length){
    list.innerHTML='<p class="empty-state">No object types have been configured.</p>';
    return;
  }
  const counts=typeCountMap();
  const maxTypeCount=Math.max(0,...types.map(type=>counts.get(type.object_type_id)||0));
  types
    .slice()
    .sort((a,b)=>(counts.get(b.object_type_id)||0)-(counts.get(a.object_type_id)||0)||a.type_name.localeCompare(b.type_name))
    .forEach(type=>{
    const row=document.createElement('button');
    row.type='button';
    row.className='count-row';
    row.addEventListener('click',()=>loadDashboardTypeItems(type));
    const name=document.createElement('div');
    const title=document.createElement('strong');
    title.textContent=type.type_name;
    const meta=document.createElement('small');
    const attrCount=attrs.filter(attribute=>attribute.object_type_id===type.object_type_id).length;
    meta.textContent=`${attrCount} attribute${attrCount===1?'':'s'}`;
    name.append(title,meta);
    const count=document.createElement('span');
    const itemCount=counts.get(type.object_type_id)||0;
    const intensity=maxTypeCount?Math.ceil((itemCount/maxTypeCount)*5):0;
    count.className=`count-badge count-badge-${intensity}`;
    count.textContent=itemCount;
    row.append(name,count);
    list.append(row);
  });
  if(activeView==='dashboard')loadDashboardCalendar().catch(e=>setAlert(e.message));
}

function eventSeverityRank(severity){
  return {critical:4,high:3,medium:2,low:1}[severity]||0;
}

function monthRange(date){
  const year=date.getFullYear();
  const month=date.getMonth();
  return {
    start:new Date(year,month,1),
    end:new Date(year,month+1,1),
    year,
    month
  };
}

async function loadDashboardCalendar(){
  const calendar=$('dashboard-calendar');
  const title=$('dashboard-calendar-title');
  if(!calendar||!title)return;
  const range=monthRange(dashboardMonth);
  title.textContent=new Intl.DateTimeFormat(undefined,{month:'long',year:'numeric'}).format(range.start);
  calendar.innerHTML='<p class="empty-state">Loading events...</p>';
  const r=await api(`items/event/month?start=${encodeURIComponent(range.start.toISOString())}&end=${encodeURIComponent(range.end.toISOString())}`);
  renderDashboardCalendar(range,r.events||[]);
}

function renderDashboardCalendar(range,events){
  const calendar=$('dashboard-calendar');
  if(!calendar)return;
  calendar.innerHTML='';
  const byDay=new Map();
  events.forEach(event=>{
    const date=new Date(event.event_at);
    if(Number.isNaN(date.getTime()))return;
    const day=date.getDate();
    if(!byDay.has(day))byDay.set(day,[]);
    byDay.get(day).push(event);
  });
  const firstWeekday=range.start.getDay();
  const daysInMonth=new Date(range.year,range.month+1,0).getDate();
  for(let i=0;i<firstWeekday;i++){
    const blank=document.createElement('div');
    blank.className='calendar-day calendar-day-empty';
    calendar.append(blank);
  }
  for(let day=1;day<=daysInMonth;day++){
    const dayEvents=byDay.get(day)||[];
    const cell=document.createElement('button');
    cell.type='button';
    cell.className='calendar-day';
    if(!dayEvents.length)cell.disabled=true;
    const number=document.createElement('span');
    number.className='calendar-day-number';
    number.textContent=day;
    const dots=document.createElement('span');
    dots.className='calendar-dots';
    dayEvents
      .slice()
      .sort((a,b)=>eventSeverityRank(b.severity)-eventSeverityRank(a.severity))
      .slice(0,5)
      .forEach(event=>{
        const dot=document.createElement('span');
        dot.className=`calendar-dot severity-${event.severity||'medium'}`;
        dot.title=`${event.event_type_name}: ${event.event_title}`;
        dots.append(dot);
      });
    if(dayEvents.length>5){
      const more=document.createElement('small');
      more.textContent=`+${dayEvents.length-5}`;
      dots.append(more);
    }
    const summary=document.createElement('small');
    summary.className='calendar-day-summary';
    summary.textContent=dayEvents.length?`${dayEvents.length} event${dayEvents.length===1?'':'s'}`:'';
    cell.title=dayEvents.map(event=>`${event.event_type_name}: ${event.event_title} (${event.item_path})`).join('\n');
    cell.append(number,dots,summary);
    cell.addEventListener('click',()=>{
      const first=dayEvents[0];
      if(!first)return;
      showView('objectsphere');
      selectItem(first.item_id,'event');
    });
    calendar.append(cell);
  }
}

function shiftDashboardMonth(delta){
  dashboardMonth=new Date(dashboardMonth.getFullYear(),dashboardMonth.getMonth()+delta,1);
  loadDashboardCalendar().catch(e=>setAlert(e.message));
}

async function loadDashboardTypeItems(type){
  const card=$('dashboard-type-items-card');
  const title=$('dashboard-type-items-title');
  const target=$('dashboard-type-items');
  if(!card||!title||!target)return;
  card.hidden=false;
  title.textContent=`${type.type_name} objects`;
  target.innerHTML='<p class="empty-state">Loading objects...</p>';
  try{
    const r=await api(`items/type/list?object_type_id=${encodeURIComponent(type.object_type_id)}`);
    const rows=r.items||[];
    if(!rows.length){
      target.innerHTML='<p class="empty-state">No active objects use this object type.</p>';
      return;
    }
    const table=document.createElement('table');
    table.className='dashboard-object-table';
    const thead=document.createElement('thead');
    thead.innerHTML='<tr><th>Object ID</th><th>Name</th><th>Parent</th><th>Quantity</th><th>Description</th><th>Updated</th></tr>';
    const tbody=document.createElement('tbody');
    rows.forEach(item=>{
      const tr=document.createElement('tr');
      const updated=item.updated_at?new Date(item.updated_at).toLocaleString():'';
      [item.item_id,item.item_name,item.parent_item_name||'Top level',item.quantity||1,item.item_description||'',updated].forEach(value=>{
        const td=document.createElement('td');
        td.textContent=value;
        tr.append(td);
      });
      tr.addEventListener('click',()=>{
        showView('objectsphere');
        selectItem(item.item_id,'object');
      });
      tbody.append(tr);
    });
    table.append(thead,tbody);
    target.innerHTML='';
    target.append(table);
  }catch(e){
    setAlert(e.message);
  }
}

function renderTypeList(){
  const list=$('object-type-list');
  if(!list)return;
  list.innerHTML='';
  const types=(setup.object_types||[]).filter(type=>!type.deleted);
  const attrs=(setup.attributes||[]).filter(attribute=>!attribute.deleted);
  if(!types.length){
    list.innerHTML='<p class="empty-state">No object types yet.</p>';
    return;
  }
  const header=document.createElement('div');
  header.className='setup-type-grid-row setup-type-grid-head';
  ['','Object type id','Object type name','Status',''].forEach(label=>{
    const cell=document.createElement('span');
    cell.textContent=label;
    header.append(cell);
  });
  list.append(header);
  types.forEach(type=>{
    const row=document.createElement('div');
    row.className='setup-type-grid-row';
    row.classList.toggle('selected',type.object_type_id===selectedSetupTypeId);
    const expand=document.createElement('button');
    expand.type='button';
    expand.className='grid-expand';
    expand.textContent=expandedSetupTypes.has(type.object_type_id)?'v':'>';
    expand.setAttribute('aria-label',`${expandedSetupTypes.has(type.object_type_id)?'Collapse':'Expand'} ${type.type_name} attributes`);
    expand.addEventListener('click',()=>{
      if(expandedSetupTypes.has(type.object_type_id))expandedSetupTypes.delete(type.object_type_id);
      else expandedSetupTypes.add(type.object_type_id);
      renderTypeList();
    });
    const id=document.createElement('span');
    id.textContent=type.object_type_id;
    const name=document.createElement('input');
    name.className='grid-text-input';
    name.value=type.type_name;
    name.setAttribute('aria-label','Object type name');
    name.addEventListener('change',async ()=>{
      const nextName=name.value.trim();
      if(!nextName){
        name.value=type.type_name;
        setAlert('Object type name is required');
        return;
      }
      try{
        await saveObjectType(type,{type_name:nextName});
        status('Object type saved.');
        await loadSetup();
      }catch(e){
        name.value=type.type_name;
        setAlert(e.message);
      }
    });
    const statusControl=document.createElement('label');
    statusControl.className='grid-toggle';
    const statusInput=document.createElement('input');
    statusInput.type='checkbox';
    statusInput.checked=type.status==='active';
    statusInput.setAttribute('aria-label',`${type.type_name} active status`);
    const statusTrack=document.createElement('span');
    statusControl.append(statusInput,statusTrack);
    statusInput.addEventListener('change',async ()=>{
      try{
        await saveObjectType(type,{status:statusInput.checked?'active':'disabled'});
        status(type.status==='active'?'Object type disabled.':'Object type enabled.');
        await loadSetup();
      }catch(e){
        statusInput.checked=type.status==='active';
        setAlert(e.message);
      }
    });
    const deleteButton=document.createElement('button');
    deleteButton.type='button';
    deleteButton.className='danger-action grid-delete';
    deleteButton.textContent='Delete';
    deleteButton.addEventListener('click',async ()=>{
      if(!confirm(`Delete object type "${type.type_name}"?`))return;
      try{
        await api('setup/type/delete',{method:'POST',body:JSON.stringify({object_type_id:type.object_type_id})});
        if(selectedSetupTypeId===type.object_type_id)hideTypeForm();
        status('Object type deleted.');
        await loadSetup();
      }catch(e){setAlert(e.message)}
    });
    row.append(expand,id,name,statusControl,deleteButton);
    list.append(row);
    if(expandedSetupTypes.has(type.object_type_id))list.append(attributeChildGrid(type.object_type_id));
  });
}

function attributeChildGrid(typeId){
  const wrap=document.createElement('div');
  wrap.className='setup-attribute-child';
  const attrs=(setup.attributes||[]).filter(attribute=>!attribute.deleted&&attribute.object_type_id===typeId)
    .sort((a,b)=>(a.sort_order-b.sort_order)||a.attribute_name.localeCompare(b.attribute_name));
  const header=document.createElement('div');
  header.className='setup-attribute-grid-row setup-attribute-grid-head';
  ['','Attribute id','Attribute name','Type','Status',''].forEach(label=>{
    const cell=document.createElement('span');
    cell.textContent=label;
    header.append(cell);
  });
  wrap.append(header);
  if(!attrs.length&&newAttributeTypeId!==typeId){
    const empty=document.createElement('p');
    empty.className='empty-state';
    empty.textContent='No attributes for this object type.';
    wrap.append(empty);
  }
  attrs.forEach(attribute=>{
    const row=document.createElement('div');
    row.className='setup-attribute-grid-row';
    row.draggable=true;
    row.dataset.attributeId=attribute.attribute_id;
    row.addEventListener('dragstart',event=>{
      event.dataTransfer.effectAllowed='move';
      event.dataTransfer.setData('text/plain',attribute.attribute_id);
      row.classList.add('dragging');
    });
    row.addEventListener('dragend',()=>{
      row.classList.remove('dragging');
      clearAttributeDropHints();
    });
    row.addEventListener('dragover',event=>{
      event.preventDefault();
      clearAttributeDropHints();
      row.classList.add(attributeDropPosition(event,row)==='before'?'drop-before':'drop-after');
      event.dataTransfer.dropEffect='move';
    });
    row.addEventListener('dragleave',event=>{
      if(!row.contains(event.relatedTarget))row.classList.remove('drop-before','drop-after');
    });
    row.addEventListener('drop',event=>{
      event.preventDefault();
      const sourceId=event.dataTransfer.getData('text/plain');
      const position=attributeDropPosition(event,row);
      clearAttributeDropHints();
      reorderAttributes(typeId,sourceId,attribute.attribute_id,position).catch(e=>setAlert(e.message));
    });
    const handle=document.createElement('span');
    handle.className='drag-handle';
    handle.textContent='⋮⋮';
    handle.title='Drag to reorder';
    const id=document.createElement('span');
    id.textContent=attribute.attribute_id;
    const name=document.createElement('input');
    name.className='grid-text-input';
    name.value=attribute.attribute_name;
    name.setAttribute('aria-label','Attribute name');
    name.addEventListener('change',async ()=>{
      const nextName=name.value.trim();
      if(!nextName){
        name.value=attribute.attribute_name;
        setAlert('Attribute name is required');
        return;
      }
      try{
        await saveAttribute(attribute,{attribute_name:nextName});
        status('Attribute saved.');
        await loadSetup();
      }catch(e){
        name.value=attribute.attribute_name;
        setAlert(e.message);
      }
    });
    const type=document.createElement('select');
    type.className='grid-select';
    (setup.attribute_types||['text','large_text','date','number','float','currency']).forEach(value=>{
      const option=document.createElement('option');
      option.value=value;
      option.textContent=typeLabel(value);
      option.selected=attribute.attribute_type===value;
      type.append(option);
    });
    type.addEventListener('change',async ()=>{
      try{
        await saveAttribute(attribute,{attribute_type:type.value});
        status('Attribute saved.');
        await loadSetup();
      }catch(e){
        type.value=attribute.attribute_type;
        setAlert(e.message);
      }
    });
    const statusControl=document.createElement('label');
    statusControl.className='grid-toggle';
    const statusInput=document.createElement('input');
    statusInput.type='checkbox';
    statusInput.checked=attribute.status==='active';
    statusInput.setAttribute('aria-label',`${attribute.attribute_name} active status`);
    const statusTrack=document.createElement('span');
    statusControl.append(statusInput,statusTrack);
    statusInput.addEventListener('change',async ()=>{
      try{
        await saveAttribute(attribute,{status:statusInput.checked?'active':'disabled'});
        status(attribute.status==='active'?'Attribute disabled.':'Attribute enabled.');
        await loadSetup();
      }catch(e){
        statusInput.checked=attribute.status==='active';
        setAlert(e.message);
      }
    });
    const deleteButton=document.createElement('button');
    deleteButton.type='button';
    deleteButton.className='danger-action grid-delete';
    deleteButton.textContent='Delete';
    deleteButton.addEventListener('click',async ()=>{
      if(!confirm(`Delete attribute "${attribute.attribute_name}"?`))return;
      try{
        await api('setup/attribute/delete',{method:'POST',body:JSON.stringify({attribute_id:attribute.attribute_id})});
        status('Attribute deleted.');
        await loadSetup();
      }catch(e){setAlert(e.message)}
    });
    row.append(handle,id,name,type,statusControl,deleteButton);
    wrap.append(row);
  });
  if(newAttributeTypeId===typeId)wrap.append(newAttributeRow(typeId));
  const add=document.createElement('button');
  add.type='button';
  add.className='add-grid-button attribute-add-button';
  add.textContent='+';
  add.setAttribute('aria-label','Add attribute');
  add.addEventListener('click',()=>{
    newAttributeTypeId=typeId;
    renderTypeList();
  });
  wrap.append(add);
  return wrap;
}

function newAttributeRow(typeId){
  const row=document.createElement('div');
  row.className='setup-attribute-grid-row new-grid-row';
  const handle=document.createElement('span');
  const id=document.createElement('span');
  id.textContent='New';
  const name=document.createElement('input');
  name.className='grid-text-input';
  name.placeholder='Attribute name';
  name.setAttribute('aria-label','New attribute name');
  const type=document.createElement('select');
  type.className='grid-select';
  (setup.attribute_types||['text','large_text','date','number','float','currency']).forEach(value=>{
    const option=document.createElement('option');
    option.value=value;
    option.textContent=typeLabel(value);
    type.append(option);
  });
  const statusControl=document.createElement('label');
  statusControl.className='grid-toggle';
  const statusInput=document.createElement('input');
  statusInput.type='checkbox';
  statusInput.checked=true;
  statusInput.setAttribute('aria-label','New attribute active status');
  const statusTrack=document.createElement('span');
  statusControl.append(statusInput,statusTrack);
  const save=document.createElement('button');
  save.type='button';
  save.textContent='Save';
  save.addEventListener('click',async ()=>{
    const attributeName=name.value.trim();
    if(!attributeName){
      setAlert('Attribute name is required');
      name.focus();
      return;
    }
    try{
      await saveAttribute({
        object_type_id:typeId,
        attribute_name:attributeName,
        attribute_type:type.value,
        status:statusInput.checked?'active':'disabled'
      });
      newAttributeTypeId=null;
      status('Attribute saved.');
      await loadSetup();
    }catch(e){setAlert(e.message)}
  });
  row.append(handle,id,name,type,statusControl,save);
  setTimeout(()=>name.focus(),0);
  return row;
}

function clearAttributeDropHints(){
  document.querySelectorAll('.setup-attribute-grid-row.drop-before,.setup-attribute-grid-row.drop-after').forEach(row=>{
    row.classList.remove('drop-before','drop-after');
  });
}

function attributeDropPosition(event,row){
  const rect=row.getBoundingClientRect();
  return event.clientY<rect.top+rect.height/2?'before':'after';
}

async function reorderAttributes(typeId,sourceId,targetId,position){
  if(!sourceId||!targetId||sourceId===targetId)return;
  const ordered=(setup.attributes||[])
    .filter(attribute=>!attribute.deleted&&attribute.object_type_id===typeId)
    .sort((a,b)=>(a.sort_order-b.sort_order)||a.attribute_name.localeCompare(b.attribute_name))
    .map(attribute=>attribute.attribute_id);
  const next=ordered.filter(id=>id!==sourceId);
  const targetIndex=next.indexOf(targetId);
  if(targetIndex<0)return;
  next.splice(position==='after'?targetIndex+1:targetIndex,0,sourceId);
  await api('setup/attribute/reorder',{method:'POST',body:JSON.stringify({object_type_id:typeId,attribute_ids:next})});
  status('Attribute order saved.');
  await loadSetup();
}

async function saveObjectType(type,patch={}){
  const payload={
    object_type_id:type.object_type_id||null,
    type_name:type.type_name,
    type_description:type.type_description||'',
    status:type.status||'active',
    ...patch
  };
  await api('setup/type/save',{method:'POST',body:JSON.stringify(payload)});
}

async function saveEventType(type,patch={}){
  const payload={
    event_type_id:type.event_type_id||null,
    type_name:type.type_name,
    type_description:type.type_description||'',
    default_severity:type.default_severity||'medium',
    status:type.status||'active',
    ...patch
  };
  await api('setup/event-type/save',{method:'POST',body:JSON.stringify(payload)});
}

async function saveAttribute(attribute,patch={}){
  const payload={
    attribute_id:attribute.attribute_id||null,
    object_type_id:attribute.object_type_id,
    attribute_name:attribute.attribute_name,
    attribute_type:attribute.attribute_type||'text',
    status:attribute.status||'active',
    ...patch
  };
  await api('setup/attribute/save',{method:'POST',body:JSON.stringify(payload)});
}

function renderEventTypeList(){
  const list=$('event-type-list');
  if(!list)return;
  list.innerHTML='';
  const types=(setup.event_types||[]).filter(type=>!type.deleted);
  if(!types.length){
    list.innerHTML='<p class="empty-state">No event types yet. Copy reference types or add one.</p>';
    return;
  }
  const counts=eventTypeCountMap();
  const header=document.createElement('div');
  header.className='setup-event-type-grid-row setup-type-grid-head';
  ['Event type','Default severity','Status','Events',''].forEach(label=>{
    const cell=document.createElement('span');
    cell.textContent=label;
    header.append(cell);
  });
  list.append(header);
  types.forEach(type=>{
    const row=document.createElement('div');
    row.className='setup-event-type-grid-row';
    row.classList.toggle('selected',type.event_type_id===selectedEventTypeId);
    const name=document.createElement('input');
    name.className='grid-text-input';
    name.value=type.type_name;
    name.setAttribute('aria-label','Event type name');
    name.addEventListener('change',async ()=>{
      const nextName=name.value.trim();
      if(!nextName){
        name.value=type.type_name;
        setAlert('Event type name is required');
        return;
      }
      try{
        await saveEventType(type,{type_name:nextName});
        status('Event type saved.');
        await loadSetup();
      }catch(e){
        name.value=type.type_name;
        setAlert(e.message);
      }
    });
    const severity=document.createElement('select');
    severity.className='grid-select';
    (setup.event_severities||['low','medium','high','critical']).forEach(value=>{
      const option=document.createElement('option');
      option.value=value;
      option.textContent=typeLabel(value);
      option.selected=type.default_severity===value;
      severity.append(option);
    });
    severity.addEventListener('change',async ()=>{
      try{
        await saveEventType(type,{default_severity:severity.value});
        status('Event type saved.');
        await loadSetup();
      }catch(e){
        severity.value=type.default_severity;
        setAlert(e.message);
      }
    });
    const statusControl=document.createElement('label');
    statusControl.className='grid-toggle';
    const statusInput=document.createElement('input');
    statusInput.type='checkbox';
    statusInput.checked=type.status==='active';
    statusInput.setAttribute('aria-label',`${type.type_name} active status`);
    const statusTrack=document.createElement('span');
    statusControl.append(statusInput,statusTrack);
    statusInput.addEventListener('change',async ()=>{
      try{
        await saveEventType(type,{status:statusInput.checked?'active':'disabled'});
        status(statusInput.checked?'Event type enabled.':'Event type disabled.');
        await loadSetup();
      }catch(e){
        statusInput.checked=type.status==='active';
        setAlert(e.message);
      }
    });
    const count=document.createElement('span');
    count.className='status-pill';
    count.textContent=counts.get(type.event_type_id)||0;
    const deleteButton=document.createElement('button');
    deleteButton.type='button';
    deleteButton.className='danger-action grid-delete';
    deleteButton.textContent='Delete';
    deleteButton.addEventListener('click',async ()=>{
      if(!confirm(`Delete event type "${type.type_name}"? Types with events will be disabled instead.`))return;
      try{
        const r=await api('setup/event-type/delete',{method:'POST',body:JSON.stringify({event_type_id:type.event_type_id})});
        if(selectedEventTypeId===type.event_type_id)hideEventTypeForm();
        status(r.disabled?'Event type disabled because events use it.':'Event type deleted.');
        await loadSetup();
      }catch(e){setAlert(e.message)}
    });
    row.addEventListener('click',event=>{
      if(event.target.closest('input,select,button,label'))return;
      selectEventType(type.event_type_id);
    });
    row.append(name,severity,statusControl,count,deleteButton);
    list.append(row);
  });
}

function renderAttributeTypeSelect(){
  const select=$('attribute-object-type');
  if(!select)return;
  select.innerHTML='';
  activeTypes().forEach(type=>{
    const option=document.createElement('option');
    option.value=type.object_type_id;
    option.textContent=type.type_name;
    option.selected=type.object_type_id===(selectedSetupTypeId||activeTypes()[0]?.object_type_id);
    select.append(option);
  });
}

function renderAttributeList(){
  const list=$('attribute-list');
  if(!list)return;
  list.innerHTML='';
  list.hidden=true;
}

function selectSetupType(typeId){
  const type=setup.object_types.find(item=>item.object_type_id===typeId);
  selectedSetupTypeId=typeId;
  if(typeId)expandedSetupTypes.add(typeId);
  $('type-panel').hidden=false;
  $('type-id').value=type?.object_type_id||'';
  $('type-name').value=type?.type_name||'';
  $('type-description').value=type?.type_description||'';
  $('type-status').checked=(type?.status||'active')==='active';
  $('attribute-object-type').value=typeId;
  clearAttributeForm();
  renderSetup();
}

function clearTypeForm(){
  selectedSetupTypeId=null;
  $('type-panel').hidden=false;
  $('type-id').value='';
  $('type-name').value='';
  $('type-description').value='';
  $('type-status').checked=true;
  renderSetup();
  $('type-name').focus();
}

function hideTypeForm(){
  selectedSetupTypeId=null;
  $('type-panel').hidden=true;
  $('type-id').value='';
  $('type-name').value='';
  $('type-description').value='';
  $('type-status').checked=true;
  renderSetup();
}

function selectEventType(typeId){
  const type=setup.event_types.find(item=>item.event_type_id===typeId);
  selectedEventTypeId=typeId;
  $('event-type-panel').hidden=false;
  $('event-type-id').value=type?.event_type_id||'';
  $('event-type-name').value=type?.type_name||'';
  $('event-type-description').value=type?.type_description||'';
  $('event-type-default-severity').value=type?.default_severity||'medium';
  $('event-type-status').checked=(type?.status||'active')==='active';
  renderSetup();
}

function clearEventTypeForm(){
  selectedEventTypeId=null;
  $('event-type-panel').hidden=false;
  $('event-type-id').value='';
  $('event-type-name').value='';
  $('event-type-description').value='';
  $('event-type-default-severity').value='medium';
  $('event-type-status').checked=true;
  renderSetup();
  $('event-type-name').focus();
}

function hideEventTypeForm(){
  selectedEventTypeId=null;
  $('event-type-panel').hidden=true;
  $('event-type-id').value='';
  $('event-type-name').value='';
  $('event-type-description').value='';
  $('event-type-default-severity').value='medium';
  $('event-type-status').checked=true;
  renderSetup();
}

function selectAttribute(attributeId){
  const attribute=setup.attributes.find(item=>item.attribute_id===attributeId);
  if(!attribute)return;
  $('attribute-id').value=attribute.attribute_id;
  $('attribute-object-type').value=attribute.object_type_id;
  $('attribute-name').value=attribute.attribute_name;
  $('attribute-type').value=attribute.attribute_type;
  $('attribute-status').value=attribute.status;
}

function clearAttributeForm(){
  $('attribute-id').value='';
  $('attribute-name').value='';
  $('attribute-type').value='text';
  $('attribute-status').value='active';
  const firstType=selectedSetupTypeId||activeTypes()[0]?.object_type_id||'';
  $('attribute-object-type').value=firstType;
}

function renderItemTypes(){
  const list=$('item-type-list');
  const tabs=$('item-type-tabs');
  const panels=$('attribute-panels');
  if(!list||!tabs||!panels)return;
  list.innerHTML='';
  tabs.innerHTML='';
  panels.innerHTML='';
  if(!selectedId){
    list.innerHTML='<p class="empty-state">Select an item first.</p>';
    panels.innerHTML='<p class="empty-state">Select an item to view attributes.</p>';
    return;
  }
  const typeIds=assignedTypeIds();
  const types=activeTypes();
  if(!types.length){
    list.innerHTML='<p class="empty-state">No active object types have been configured.</p>';
    panels.innerHTML='<p class="empty-state">No active object types have been configured.</p>';
    return;
  }
  types.forEach(type=>{
    const label=document.createElement('label');
    label.className='type-toggle';
    const checkbox=document.createElement('input');
    checkbox.type='checkbox';
    checkbox.checked=typeIds.has(type.object_type_id);
    checkbox.addEventListener('change',()=>saveItemType(type.object_type_id,checkbox.checked));
    const copy=document.createElement('span');
    copy.textContent=type.type_name;
    label.append(checkbox,copy);
    list.append(label);
  });
  const assigned=types.filter(type=>typeIds.has(type.object_type_id));
  if(!assigned.length){
    panels.innerHTML='<p class="empty-state">Turn on an object type to enter its attributes.</p>';
    return;
  }
  if(!activeItemTypeId||!assigned.some(type=>type.object_type_id===activeItemTypeId))activeItemTypeId=assigned[0].object_type_id;
  assigned.forEach(type=>{
    const tab=document.createElement('button');
    tab.type='button';
    tab.className='item-type-tab';
    tab.classList.toggle('active',type.object_type_id===activeItemTypeId);
    tab.textContent=type.type_name;
    tab.addEventListener('click',()=>{
      activeItemTypeId=type.object_type_id;
      renderItemTypes();
    });
    tabs.append(tab);
  });
  renderAttributePanel(activeItemTypeId);
}

function renderWireframePanel(){
  const panel=$('wireframe-panel');
  if(!panel)return;
  panel.innerHTML='';
  if(!selectedId)return;
  if(wireframeLoading){
    const loading=document.createElement('p');
    loading.className='empty-state';
    loading.textContent='Generating wireframe...';
    panel.append(loading);
    return;
  }
  if(currentWireframe){
    const preview=document.createElement('article');
    preview.className='wireframe-preview';
    const img=document.createElement('img');
    img.src=currentWireframe.data_url;
    img.alt=currentWireframe.file_name||'3D wireframe';
    img.addEventListener('click',()=>openPhotoViewer(currentWireframe));
    const del=document.createElement('button');
    del.type='button';
    del.className='danger-action attachment-delete wireframe-delete';
    del.textContent='-';
    del.title='Delete wireframe';
    del.setAttribute('aria-label','Delete wireframe');
    del.addEventListener('click',deleteWireframe);
    preview.append(img,del);
    panel.append(preview);
    return;
  }
  const generate=document.createElement('button');
  generate.type='button';
  generate.className='wireframe-generate';
  generate.title='Generate 3D wireframe from first photo';
  generate.setAttribute('aria-label','Generate 3D wireframe from first photo');
  const cube=document.createElement('span');
  cube.className='wireframe-cube';
  cube.setAttribute('aria-hidden','true');
  generate.append(cube);
  generate.addEventListener('click',generateWireframe);
  panel.append(generate);
}

async function loadWireframe(){
  const requestId=selectedId;
  const panel=$('wireframe-panel');
  if(!requestId||!panel)return;
  panel.innerHTML='<p class="empty-state">Loading wireframe...</p>';
  try{
    const r=await api(`items/wireframe/list?item_id=${encodeURIComponent(requestId)}`);
    if(requestId!==selectedId)return;
    currentWireframe=(r.attachments||[])[0]||null;
    wireframeLoading=false;
    renderWireframePanel();
  }catch(e){
    wireframeLoading=false;
    currentWireframe=null;
    renderWireframePanel();
    setAlert(e.message);
  }
}

async function generateWireframe(){
  if(!selectedId)return;
  const itemId=selectedId;
  if(!confirm('Generate a 3D wireframe from the first photo attached to this item?'))return;
  wireframeLoading=true;
  currentWireframe=null;
  renderWireframePanel();
  status('Generating wireframe...');
  try{
    const r=await api('items/wireframe/generate',{method:'POST',body:JSON.stringify({item_id:itemId})});
    if(itemId!==selectedId)return;
    currentWireframe=r.wireframe||null;
    status('Wireframe generated.');
  }catch(e){
    setAlert(e.message);
    status('Wireframe generation failed.');
  }finally{
    if(itemId===selectedId){
      wireframeLoading=false;
      renderWireframePanel();
    }
  }
}

async function deleteWireframe(){
  if(!currentWireframe)return;
  if(!confirm('Delete this wireframe?'))return;
  try{
    await api('items/wireframe/delete',{method:'POST',body:JSON.stringify({attachment_id:currentWireframe.attachment_id})});
    currentWireframe=null;
    status('Wireframe deleted.');
    renderWireframePanel();
  }catch(e){
    setAlert(e.message);
  }
}

function renderAttributePanel(typeId){
  const panels=$('attribute-panels');
  const attrs=activeAttributes(typeId);
  const values=valueMap();
  if(!attrs.length){
    panels.innerHTML='<p class="empty-state">No active attributes for this object type.</p>';
    return;
  }
  attrs.forEach(attribute=>{
    const wrap=document.createElement('div');
    wrap.className='attribute-field';
    const header=document.createElement('div');
    header.className='attribute-field-header';
    const label=document.createElement('label');
    label.textContent=attribute.attribute_name;
    const historyButton=document.createElement('button');
    historyButton.type='button';
    historyButton.className='secondary-action attribute-history-button';
    historyButton.textContent='History';
    const history=document.createElement('div');
    history.className='attribute-history';
    history.hidden=true;
    historyButton.addEventListener('click',()=>showAttributeHistory(attribute,history));
    const input=attributeInput(attribute,values.get(attribute.attribute_id)||'');
    input.addEventListener('change',()=>saveAttributeValue(attribute.attribute_id,input.value));
    header.append(label,historyButton);
    wrap.append(header,input,history);
    panels.append(wrap);
  });
}

function attributeInput(attribute,value){
  let input;
  if(attribute.attribute_type==='large_text'){
    input=document.createElement('textarea');
    input.rows=5;
  }else{
    input=document.createElement('input');
    input.type={number:'number',float:'number',currency:'number',date:'date'}[attribute.attribute_type]||'text';
    if(['float','currency'].includes(attribute.attribute_type))input.step='0.01';
  }
  input.value=value;
  return input;
}

async function saveItemType(typeId,enabled){
  if(!selectedId)return;
  try{
    await api('items/type/save',{method:'POST',body:JSON.stringify({item_id:selectedId,object_type_id:typeId,enabled})});
    activeItemTypeId=enabled?typeId:activeItemTypeId;
    await loadItemMetadata(selectedId);
    status(enabled?'Object type enabled.':'Object type disabled.');
  }catch(e){setAlert(e.message)}
}

async function saveAttributeValue(attributeId,value){
  if(!selectedId)return;
  try{
    await api('items/value/save',{method:'POST',body:JSON.stringify({item_id:selectedId,attribute_id:attributeId,value_text:value})});
    await loadItemMetadata(selectedId);
    status('Attribute saved.');
  }catch(e){setAlert(e.message)}
}

async function showAttributeHistory(attribute,target){
  if(!selectedId)return;
  if(!target.hidden){
    target.hidden=true;
    return;
  }
  target.hidden=false;
  target.innerHTML='<p class="empty-state">Loading history...</p>';
  try{
    const r=await api(`items/value/history?item_id=${encodeURIComponent(selectedId)}&attribute_id=${encodeURIComponent(attribute.attribute_id)}`);
    const rows=r.history||[];
    if(!rows.length){
      target.innerHTML='<p class="empty-state">No changes recorded yet.</p>';
      return;
    }
    target.innerHTML='';
    rows.forEach(row=>{
      const entry=document.createElement('article');
      entry.className='history-entry';
      const when=document.createElement('strong');
      when.textContent=new Date(row.changed_at).toLocaleString();
      const who=document.createElement('small');
      who.textContent=row.changed_by_email||'Unknown user';
      const values=document.createElement('p');
      const oldValue=row.old_value_text==null?'blank':row.old_value_text;
      const newValue=row.new_value_text==null?'blank':row.new_value_text;
      values.textContent=`${oldValue} -> ${newValue}`;
      entry.append(when,who,values);
      target.append(entry);
    });
  }catch(e){
    target.innerHTML='';
    setAlert(e.message);
  }
}

function renderTree(){
  const tree=$('tree');
  tree.innerHTML='';
  const children=childrenByParent();
  const roots=children.get('root')||[];
  if(!roots.length){
    const empty=document.createElement('p');
    empty.className='tree-empty';
    empty.textContent='No objects yet. Add a root item to begin.';
    tree.append(empty);
    return;
  }

  function renderNode(item,level,parentEl){
    if(!shouldShow(item,children))return;
    const childItems=children.get(item.item_id)||[];
    const hasChildren=childItems.length>0;
    const isExpanded=hasChildren&&(expanded.has(item.item_id)||searchTerm);
    const group=isExpanded?document.createElement('div'):null;
    const targetEl=group||parentEl;
    if(group){
      group.className='tree-object-group';
      group.style.marginLeft=`${level*28}px`;
      parentEl.append(group);
    }
    const row=document.createElement('div');
    row.className='tree-row';
    row.style.marginLeft=isExpanded?'0':`${level*28}px`;
    row.draggable=true;
    row.dataset.itemId=item.item_id;
    row.addEventListener('dragstart',event=>{
      draggedId=item.item_id;
      row.classList.add('dragging');
      event.dataTransfer.effectAllowed='move';
      event.dataTransfer.setData('text/plain',item.item_id);
    });
    row.addEventListener('dragend',()=>{
      row.classList.remove('dragging');
      draggedId=null;
      clearDropHints();
    });
    row.addEventListener('dragover',event=>{
      if(!draggedId||draggedId===item.item_id)return;
      event.preventDefault();
      clearDropHints();
      row.classList.add(`drop-${dropPosition(event,row)}`);
      event.dataTransfer.dropEffect='move';
    });
    row.addEventListener('dragleave',event=>{
      if(!row.contains(event.relatedTarget))row.classList.remove('drop-before','drop-after','drop-inside');
    });
    row.addEventListener('drop',event=>{
      event.preventDefault();
      const sourceId=event.dataTransfer.getData('text/plain')||draggedId;
      const position=dropPosition(event,row);
      clearDropHints();
      positionItem(sourceId,item.item_id,position);
    });

    const toggle=document.createElement('button');
    toggle.type='button';
    toggle.className='toggle';
    toggle.textContent=hasChildren?(expanded.has(item.item_id)?'v':'>'):'';
    if(!hasChildren)toggle.classList.add('placeholder');
    toggle.addEventListener('click',()=>{
      if(expanded.has(item.item_id))expanded.delete(item.item_id);
      else expanded.add(item.item_id);
      renderTree();
    });

    const button=document.createElement('button');
    button.type='button';
    button.className='tree-item';
    button.classList.toggle('selected',item.item_id===selectedId);
    button.textContent=itemLabel(item);
    button.addEventListener('click',()=>selectItem(item.item_id,'object'));

    const itemWrap=document.createElement('span');
    itemWrap.className='tree-item-wrap';

    const addButton=document.createElement('button');
    addButton.type='button';
    addButton.className='tree-row-action tree-add';
    addButton.textContent='+';
    addButton.title=`Add child to ${item.item_name}`;
    addButton.setAttribute('aria-label',`Add child to ${item.item_name}`);
    addButton.addEventListener('mousedown',event=>event.stopPropagation());
    addButton.addEventListener('click',async event=>{
      event.stopPropagation();
      const name=prompt(`New child under ${item.item_name}`);
      if(!name)return;
      await createItem(item.item_id,name);
    });

    const editButton=treePanelButton('tree-edit','Edit object',item,'object');

    const panelActions=document.createElement('span');
    panelActions.className='tree-panel-actions';
    panelActions.append(editButton,addButton);
    itemWrap.append(button,panelActions);
    const connector=document.createElement('span');
    connector.className='tree-connector';
    connector.setAttribute('aria-hidden','true');
    row.append(connector,toggle,itemWrap);
    targetEl.append(row);

    if(isExpanded){
      const guide=document.createElement('div');
      guide.className='tree-guides';
      guide.style.marginLeft='11px';
      childItems.forEach(child=>renderNode(child,0,guide));
      targetEl.append(guide);
    }
  }

  roots.forEach(root=>renderNode(root,0,tree));
}

function treePanelButton(className,label,item,panel){
  const action=document.createElement('button');
  action.type='button';
  action.className=`tree-row-action tree-icon ${className}`;
  action.title=`${label} for ${item.item_name}`;
  action.setAttribute('aria-label',`${label} for ${item.item_name}`);
  action.addEventListener('mousedown',event=>event.stopPropagation());
  action.addEventListener('click',event=>{
    event.stopPropagation();
    selectItem(item.item_id,panel);
  });
  return action;
}

function renderParentOptions(){
  const select=$('parent-select');
  if(!select)return;
  select.innerHTML='';
  const current=items.find(item=>item.item_id===selectedId);
  if(!current)return;
  const descendants=descendantIds(selectedId,childrenByParent());
  const root=document.createElement('option');
  root.value='';
  root.textContent='Top level';
  root.selected=!current.parent_item_id;
  select.append(root);
  items.forEach(item=>{
    if(item.item_id===selectedId||descendants.has(item.item_id))return;
    const option=document.createElement('option');
    option.value=item.item_id;
    option.textContent=item.item_name;
    option.selected=current.parent_item_id===item.item_id;
    select.append(option);
  });
}

function hideItemPanels(){
  $('detail-panel').hidden=true;
}

function renderEventTypeSelect(selectedTypeId=null){
  const select=$('event-type');
  if(!select)return;
  select.innerHTML='';
  const types=(setup.event_types||[]).filter(type=>!type.deleted&&(type.status==='active'||type.event_type_id===selectedTypeId));
  types.forEach(type=>{
    const option=document.createElement('option');
    option.value=type.event_type_id;
    option.textContent=type.status==='active'?type.type_name:`${type.type_name} (disabled)`;
    option.dataset.defaultSeverity=type.default_severity||'medium';
    select.append(option);
  });
}

function clearEventForm(){
  editingEventId=null;
  renderEventTypeSelect();
  $('event-id').value='';
  $('event-title').value='';
  $('event-at').value=eventDateInputValue(new Date());
  $('event-severity').value=$('event-type').selectedOptions[0]?.dataset.defaultSeverity||'medium';
  $('event-status').value='open';
  $('event-reported-by').value='';
  $('event-description').value='';
  $('delete-event').hidden=true;
  $('event-form').hidden=false;
  $('event-title').focus();
}

function hideEventForm(){
  editingEventId=null;
  $('event-form').hidden=true;
  $('delete-event').hidden=true;
}

function editEvent(event){
  editingEventId=event.event_id;
  renderEventTypeSelect(event.event_type_id);
  $('event-id').value=event.event_id;
  $('event-type').value=event.event_type_id;
  $('event-title').value=event.event_title||'';
  $('event-at').value=eventDateInputValue(event.event_at);
  $('event-severity').value=event.severity||'medium';
  $('event-status').value=event.status||'open';
  $('event-reported-by').value=event.reported_by_email||'';
  $('event-description').value=event.event_description||'';
  $('delete-event').hidden=false;
  $('event-form').hidden=false;
  $('event-title').focus();
}

async function loadEvents(){
  const list=$('event-list');
  if(!selectedId||!list)return;
  document.querySelectorAll('.event-scope-button').forEach(button=>{
    button.classList.toggle('active',button.dataset.eventScope===eventScope);
  });
  renderEventTypeSelect();
  list.innerHTML='<p class="empty-state">Loading events...</p>';
  const r=await api(`items/event/list?item_id=${encodeURIComponent(selectedId)}&scope=${encodeURIComponent(eventScope)}`);
  renderEvents(r.events||[]);
}

function renderEvents(events){
  const list=$('event-list');
  if(!list)return;
  list.innerHTML='';
  if(!activeEventTypes().length){
    list.innerHTML='<p class="empty-state">No active event types have been configured. Add event types in Setup or copy reference types.</p>';
    $('new-event').disabled=true;
    return;
  }
  $('new-event').disabled=false;
  if(!events.length){
    list.innerHTML='<p class="empty-state">No events found for this scope.</p>';
    return;
  }
  const grid=document.createElement('div');
  grid.className='event-grid';
  const header=document.createElement('div');
  header.className='event-grid-row event-grid-head';
  ['Date','Type','Title','Location','Severity','Status','Reported by',''].forEach(label=>{
    const cell=document.createElement('span');
    cell.textContent=label;
    header.append(cell);
  });
  grid.append(header);
  events.forEach(event=>{
    const row=document.createElement('div');
    row.className=`event-grid-row severity-${event.severity||'medium'}`;
    const date=document.createElement('span');
    date.textContent=formatDateTime(event.event_at);
    const type=document.createElement('span');
    type.textContent=event.event_type_name||'';
    const title=document.createElement('strong');
    title.textContent=event.event_title;
    title.title=event.event_description||event.event_title;
    const path=document.createElement('span');
    path.className='event-path';
    path.textContent=eventScope==='direct'?'This object':event.item_path||'';
    const severity=document.createElement('span');
    severity.className='status-pill';
    severity.textContent=typeLabel(event.severity);
    const eventStatus=document.createElement('span');
    eventStatus.className='status-pill status-disabled';
    eventStatus.textContent=typeLabel(event.status);
    const reported=document.createElement('span');
    reported.textContent=event.reported_by_email||'';
    if(event.event_description){
      const description=document.createElement('small');
      description.className='event-grid-description';
      description.textContent=event.event_description;
      title.append(description);
    }
    const edit=document.createElement('button');
    edit.type='button';
    edit.className='secondary-action event-edit';
    edit.textContent='Edit';
    edit.addEventListener('click',()=>editEvent(event));
    row.append(date,type,title,path,severity,eventStatus,reported,edit);
    grid.append(row);
  });
  list.append(grid);
}

function showEditTab(panel){
  activeItemPanel=panel;
  document.querySelectorAll('.edit-tab-button').forEach(button=>{
    button.classList.toggle('active',button.dataset.itemPanel===panel);
  });
  document.querySelectorAll('.edit-tab-panel').forEach(tab=>{
    tab.hidden=tab.id!==`${panel}-panel`;
  });
  if(selectedId&&(panel==='object'||panel==='attribute'))loadItemMetadata(selectedId).catch(e=>setAlert(e.message));
  if(selectedId&&panel==='object')loadWireframe().catch(e=>setAlert(e.message));
  if(selectedId&&panel==='event'){
    hideEventForm();
    loadEvents().catch(e=>setAlert(e.message));
  }
  if(selectedId&&panel==='photo')loadPhotos().catch(e=>setAlert(e.message));
  if(selectedId&&panel==='location')renderLocationPanel();
  if(selectedId&&panel==='document')loadDocuments().catch(e=>setAlert(e.message));
}

function setLocationFields(latitude,longitude){
  const normalized=normalizeLocation(latitude,longitude);
  $('item-latitude').value=normalized?coordinateInputValue(normalized.latitude):'';
  $('item-longitude').value=normalized?coordinateInputValue(normalized.longitude):'';
}

function setLocationMarker(latitude,longitude,pan=true){
  if(!locationMap)return;
  const normalized=normalizeLocation(latitude,longitude);
  if(!normalized)return;
  const latLng=[normalized.latitude,normalized.longitude];
  setLocationFields(normalized.latitude,normalized.longitude);
  if(!locationMarker){
    locationMarker=L.marker(latLng,{draggable:true}).addTo(locationMap);
    locationMarker.on('dragend',()=>{
      const pos=locationMarker.getLatLng();
      const next=normalizeLocation(pos.lat,pos.lng);
      if(!next)return;
      setLocationFields(next.latitude,next.longitude);
      locationMarker.setLatLng([next.latitude,next.longitude]);
    });
  }else{
    locationMarker.setLatLng(latLng);
  }
  if(pan)locationMap.setView(latLng,Math.max(locationMap.getZoom(),15));
}

function addLocationTileLayer(url,options={}){
  if(locationTileLayer)locationMap.removeLayer(locationTileLayer);
  if(locationFallbackTimer)clearTimeout(locationFallbackTimer);
  if(locationOfflineLayer){
    locationMap.removeLayer(locationOfflineLayer);
    locationOfflineLayer=null;
  }
  $('location-map').classList.remove('map-tiles-offline');
  $('location-map').classList.add('map-tiles-loading');
  locationTileLayer=L.tileLayer(url,{
    maxZoom:19,
    noWrap:true,
    bounds:[[-85.0511288,-180],[85.0511288,180]],
    attribution:'&copy; OpenStreetMap contributors',
    ...options
  }).addTo(locationMap);
  let loaded=false;
  locationTileLayer.on('tileload',()=>{
    loaded=true;
    $('location-map').classList.remove('map-tiles-loading','map-tiles-offline');
  });
  locationTileLayer.on('tileerror',()=>activateOfflineLocationMap());
  locationFallbackTimer=setTimeout(()=>{
    if(!loaded)activateOfflineLocationMap();
  },3500);
}

function applyLocationTileProvider(providerKey){
  activeTileProvider=tileProviders[providerKey]?providerKey:'osm';
  if(!locationMap)return;
  const provider=tileProviders[activeTileProvider];
  if(locationFallbackTimer)clearTimeout(locationFallbackTimer);
  if(locationTileLayer){
    locationMap.removeLayer(locationTileLayer);
    locationTileLayer=null;
  }
  if(locationOfflineLayer){
    locationMap.removeLayer(locationOfflineLayer);
    locationOfflineLayer=null;
  }
  $('location-map').classList.remove('map-tiles-loading','map-tiles-offline');
  if(provider.offline){
    activateOfflineLocationMap();
    return;
  }
  addLocationTileLayer(provider.url,provider.options);
}

function activateOfflineLocationMap(){
  if(!locationMap)return;
  if(locationFallbackTimer)clearTimeout(locationFallbackTimer);
  if(locationTileLayer){
    locationMap.removeLayer(locationTileLayer);
    locationTileLayer=null;
  }
  $('location-map').classList.remove('map-tiles-loading');
  $('location-map').classList.add('map-tiles-offline');
  if(locationOfflineLayer)return;
  locationOfflineLayer=L.layerGroup().addTo(locationMap);
  const gridStyle={color:'#9fb0c4',weight:1,opacity:0.72,interactive:false};
  for(let lng=-180;lng<=180;lng+=30){
    L.polyline([[-85,lng],[85,lng]],gridStyle).addTo(locationOfflineLayer);
  }
  for(let lat=-60;lat<=60;lat+=30){
    L.polyline([[lat,-180],[lat,180]],gridStyle).addTo(locationOfflineLayer);
  }
  L.rectangle([[-85,-180],[85,180]],{color:'#7f8fa6',weight:1,fill:false,interactive:false}).addTo(locationOfflineLayer);
}

function ensureLocationMap(){
  if(typeof L==='undefined'){
    setAlert('Map library is unavailable. Check the network connection and refresh.');
    return null;
  }
  $('location-map').hidden=false;
  $('location-empty').hidden=true;
  if(!locationMap){
    locationMap=L.map('location-map',{
      maxBounds:[[-85.0511288,-180],[85.0511288,180]],
      maxBoundsViscosity:1,
      minZoom:2,
      worldCopyJump:false
    });
    applyLocationTileProvider($('map-tile-provider').value||activeTileProvider);
    locationMap.on('click',event=>{
      const next=normalizeLocation(event.latlng.lat,event.latlng.lng);
      if(!next)return;
      setLocationMarker(next.latitude,next.longitude,false);
    });
  }
  const item=selectedItem();
  if(hasLocation(item)){
    setLocationMarker(item.latitude,item.longitude,true);
  }else{
    locationMap.setView([0,0],2);
  }
  setTimeout(()=>locationMap.invalidateSize(),0);
  return locationMap;
}

function renderLocationPanel(){
  const item=selectedItem();
  if(!item)return;
  $('map-tile-provider').value=activeTileProvider;
  setLocationFields(item.latitude,item.longitude);
  const located=hasLocation(item);
  $('location-empty').hidden=located;
  $('location-map').hidden=!located;
  if(located)ensureLocationMap();
}

function locationPayload(clear=false){
  const item=selectedItem();
  if(!item)return null;
  return {
    item_id:selectedId,
    item_name:item.item_name,
    quantity:item.quantity||1,
    item_description:item.item_description||'',
    latitude:clear?null:$('item-latitude').value,
    longitude:clear?null:$('item-longitude').value
  };
}

async function saveLocation(clear=false){
  const payload=locationPayload(clear);
  if(!payload)return;
  try{
    const r=await api('items/update',{method:'POST',body:JSON.stringify(payload)});
    const index=items.findIndex(item=>item.item_id===selectedId);
    if(index>=0)items[index]={...items[index],...r.item};
    if(clear&&locationMarker){
      locationMap.removeLayer(locationMarker);
      locationMarker=null;
    }
    renderLocationPanel();
    status(clear?'Location cleared.':'Location saved.');
  }catch(e){
    setAlert(e.message);
  }
}

function previewLocationFromFields(){
  const latitude=Number($('item-latitude').value);
  const longitude=Number($('item-longitude').value);
  const normalized=normalizeLocation(latitude,longitude);
  if(!normalized)return;
  ensureLocationMap();
  setLocationMarker(normalized.latitude,normalized.longitude,true);
}

function selectItem(id,panel=activeItemPanel||'object'){
  selectedId=id;
  currentWireframe=null;
  wireframeLoading=false;
  const item=items.find(x=>x.item_id===id);
  hideItemPanels();
  $('item-form').hidden=!item;
  if(item){
    expandAncestors(id);
    $('detail-panel').hidden=false;
    showEditTab(panel);
    $('item-name').value=item.item_name;
    $('item-quantity').value=item.quantity||1;
    $('item-description').value=item.item_description||'';
    setLocationFields(item.latitude,item.longitude);
    if($('child-name'))$('child-name').value='';
    renderParentOptions();
  }
  if(!item)loadItemMetadata(null).catch(e=>setAlert(e.message));
  if(!item&&locationMarker&&locationMap){
    locationMap.removeLayer(locationMarker);
    locationMarker=null;
  }
  renderWireframePanel();
  renderTree();
}

function closeImportReview(){
  $('import-review').hidden=true;
  $('import-review-list').innerHTML='';
  $('import-review-parent').textContent='';
  importDraft=null;
}

function closeEnhanceReview(){
  $('enhance-review').hidden=true;
  $('enhance-review-list').innerHTML='';
  $('enhance-review-summary').textContent='';
  $('enhance-review-sources').innerHTML='';
  enhanceDraft=null;
}

function closeVoiceReview(){
  $('voice-review').hidden=true;
  $('voice-review-list').innerHTML='';
  $('voice-review-summary').textContent='';
  $('voice-review-transcript').textContent='';
  voiceDraft=null;
}

function voiceActionTitle(action){
  if(action.action_type==='create_child')return `Create child: ${action.child_item_name}`;
  if(action.action_type==='set_attribute')return `Set ${action.attribute_name}`;
  if(action.action_type==='rename_item')return `Rename ${action.item_name}`;
  if(action.action_type==='move_item')return `Move ${action.item_name}`;
  return 'Voice action';
}

function voiceActionMeta(action){
  if(action.action_type==='create_child'){
    return [
      `Parent: ${action.parent_item_name}`,
      action.object_type_name?`Type: ${action.object_type_name}`:'No type',
      ...(action.attribute_values||[]).map(value=>`${value.attribute_name}: ${value.value_text}`)
    ];
  }
  if(action.action_type==='set_attribute'){
    return [
      `Item: ${action.item_name}`,
      `Value: ${action.value_text}`,
      action.requires_type_assignment?`Will enable type: ${action.object_type_name}`:`Type: ${action.object_type_name}`
    ];
  }
  if(action.action_type==='rename_item')return [`From: ${action.item_name}`,`To: ${action.new_item_name}`];
  if(action.action_type==='move_item')return [`Target: ${action.target_parent_item_name||'Top level'}`];
  return [];
}

function renderVoiceReview(draft){
  voiceDraft=draft;
  const list=$('voice-review-list');
  list.innerHTML='';
  $('voice-review-transcript').textContent=`Heard: "${draft.transcript||''}"`;
  $('voice-review-summary').textContent=draft.summary||'Review the proposed voice actions before applying them.';
  const actions=draft.actions||[];
  if(!actions.length){
    const empty=document.createElement('p');
    empty.className='import-empty';
    empty.textContent='No clear changes were found in that voice prompt.';
    list.append(empty);
    $('confirm-voice-actions').disabled=true;
  }else{
    $('confirm-voice-actions').disabled=false;
    actions.forEach((action,index)=>{
      const row=document.createElement('article');
      row.className='enhance-row';
      row.dataset.actionId=action.action_id;

      const enabled=document.createElement('input');
      enabled.type='checkbox';
      enabled.checked=true;
      enabled.setAttribute('aria-label',`Apply ${voiceActionTitle(action)}`);
      enabled.dataset.voiceField='enabled';

      const body=document.createElement('div');
      body.className='enhance-row-body';

      const title=document.createElement('div');
      title.className='enhance-row-title';
      const name=document.createElement('strong');
      name.textContent=voiceActionTitle(action);
      const ordinal=document.createElement('small');
      ordinal.textContent=String(index+1);
      title.append(name,ordinal);

      const detail=document.createElement('p');
      detail.className='voice-action-detail';
      detail.textContent=action.description||'Apply this change.';

      const meta=document.createElement('div');
      meta.className='voice-action-meta';
      voiceActionMeta(action).forEach(label=>{
        const pill=document.createElement('span');
        pill.textContent=label;
        meta.append(pill);
      });

      body.append(title,detail,meta);

      const warnings=[...(action.warnings||[])];
      if(action.current_value){
        warnings.push(`Current value: ${action.current_value}`);
      }
      if(warnings.length){
        const warningList=document.createElement('ul');
        warningList.className='import-warnings';
        warnings.forEach(warning=>{
          const entry=document.createElement('li');
          entry.textContent=warning;
          warningList.append(entry);
        });
        body.append(warningList);
      }

      row.append(enabled,body);
      list.append(row);
    });
  }

  if(draft.warnings?.length){
    const warnings=document.createElement('ul');
    warnings.className='import-warnings';
    draft.warnings.forEach(warning=>{
      const entry=document.createElement('li');
      entry.textContent=warning;
      warnings.append(entry);
    });
    list.append(warnings);
  }

  $('voice-review').hidden=false;
}

function collectVoiceSelection(){
  if(!voiceDraft)return [];
  return [...document.querySelectorAll('#voice-review-list .enhance-row')]
    .filter(row=>row.querySelector('[data-voice-field="enabled"]')?.checked)
    .map(row=>row.dataset.actionId)
    .filter(Boolean);
}

async function analyseVoiceTranscript(transcript){
  const text=String(transcript||'').trim();
  if(!text)return;
  try{
    setAlert('');
    $('voice-action').disabled=true;
    status('Analysing voice action...');
    const draft=await api('voice/analyse',{method:'POST',body:JSON.stringify({transcript:text})});
    renderVoiceReview(draft);
    status('Review voice action changes.');
  }catch(e){
    setAlert(e.message);
    status('Voice action failed.');
  }finally{
    $('voice-action').disabled=false;
  }
}

function startVoiceAction(){
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){
    const typed=prompt('Voice recognition is not available in this browser. Type the action instead.');
    if(typed)analyseVoiceTranscript(typed);
    return;
  }
  if(voiceListening&&voiceRecognizer){
    voiceRecognizer.stop();
    return;
  }
  voiceRecognizer=new Recognition();
  voiceRecognizer.lang=navigator.language||'en-US';
  voiceRecognizer.interimResults=false;
  voiceRecognizer.maxAlternatives=1;
  voiceListening=true;
  $('voice-action').textContent='Stop';
  status('Listening for voice action...');
  voiceRecognizer.onresult=event=>{
    const transcript=[...event.results].map(result=>result[0]?.transcript||'').join(' ').trim();
    analyseVoiceTranscript(transcript);
  };
  voiceRecognizer.onerror=event=>{
    setAlert(event.error==='not-allowed'?'Microphone permission was denied.':`Voice recognition failed: ${event.error}`);
    status('Voice action failed.');
  };
  voiceRecognizer.onend=()=>{
    voiceListening=false;
    $('voice-action').textContent='Voice';
  };
  try{
    voiceRecognizer.start();
  }catch(e){
    voiceListening=false;
    $('voice-action').textContent='Voice';
    setAlert(e.message);
    status('Voice action failed.');
  }
}

async function confirmVoiceActions(){
  if(!voiceDraft)return;
  const selectedActionIds=collectVoiceSelection();
  if(!selectedActionIds.length){
    setAlert('Select at least one voice action to apply');
    return;
  }
  try{
    setAlert('');
    $('confirm-voice-actions').disabled=true;
    status('Applying voice actions...');
    const r=await api('voice/confirm',{method:'POST',body:JSON.stringify({
      actions:voiceDraft.actions||[],
      selected_action_ids:selectedActionIds
    })});
    const appliedDraft=voiceDraft;
    const lastItem=[...(r.applied||[])].reverse().find(action=>action.item_id);
    closeVoiceReview();
    if(lastItem?.item_id)selectedId=lastItem.item_id;
    (appliedDraft?.actions||[]).forEach(action=>{
      if(selectedActionIds.includes(action.action_id)&&action.parent_item_id)expanded.add(action.parent_item_id);
      if(selectedActionIds.includes(action.action_id)&&action.target_parent_item_id)expanded.add(action.target_parent_item_id);
    });
    await load();
    status(`Applied ${r.applied?.length||0} voice action${(r.applied?.length||0)===1?'':'s'}.`);
  }catch(e){
    $('confirm-voice-actions').disabled=false;
    setAlert(e.message);
    status('Voice action failed.');
  }
}

function renderEnhanceReview(draft){
  enhanceDraft=draft;
  const list=$('enhance-review-list');
  const summary=$('enhance-review-summary');
  const sources=$('enhance-review-sources');
  const itemName=draft.item?.item_name||items.find(item=>item.item_id===selectedId)?.item_name||'Selected object';
  summary.textContent=draft.summary||`Review suggested attributes for ${itemName}.`;
  list.innerHTML='';
  sources.innerHTML='';
  const values=draft.values||[];
  if(!values.length){
    const empty=document.createElement('p');
    empty.className='import-empty';
    empty.textContent='No attribute enhancements were found from the available photos.';
    list.append(empty);
    $('confirm-enhance').disabled=true;
  }else{
    $('confirm-enhance').disabled=false;
    values.forEach((value,index)=>{
      const row=document.createElement('article');
      row.className='enhance-row';
      row.dataset.index=String(index);

      const enabled=document.createElement('input');
      enabled.type='checkbox';
      enabled.checked=true;
      enabled.setAttribute('aria-label',`Apply ${value.attribute_name}`);
      enabled.dataset.enhanceField='enabled';

      const body=document.createElement('div');
      body.className='enhance-row-body';

      const title=document.createElement('div');
      title.className='enhance-row-title';
      const name=document.createElement('strong');
      name.textContent=`${value.object_type_name||'Attribute'} / ${value.attribute_name}`;
      const confidence=document.createElement('small');
      confidence.textContent=value.confidence==null?'':`${Math.round(value.confidence*100)}%`;
      title.append(name,confidence);

      if(value.current_value){
        const current=document.createElement('p');
        current.className='enhance-current';
        current.textContent=`Current: ${value.current_value}`;
        body.append(current);
      }

      const input=attributeInput({attribute_type:value.attribute_type},value.value_text||'');
      input.dataset.enhanceField='value_text';

      const evidence=document.createElement('p');
      evidence.className='enhance-evidence';
      evidence.textContent=value.evidence||'Photo and web evidence.';

      body.prepend(title);
      body.append(input,evidence);

      if(value.source_urls?.length){
        const links=document.createElement('div');
        links.className='enhance-links';
        value.source_urls.forEach((url,sourceIndex)=>{
          const link=document.createElement('a');
          link.href=url;
          link.target='_blank';
          link.rel='noopener noreferrer';
          link.textContent=`Source ${sourceIndex+1}`;
          links.append(link);
        });
        body.append(links);
      }

      row.append(enabled,body);
      list.append(row);
    });
  }

  if(draft.warnings?.length){
    const warnings=document.createElement('ul');
    warnings.className='import-warnings';
    draft.warnings.forEach(warning=>{
      const entry=document.createElement('li');
      entry.textContent=warning;
      warnings.append(entry);
    });
    list.append(warnings);
  }

  if(draft.sources?.length){
    const heading=document.createElement('p');
    heading.className='enhance-source-title';
    heading.textContent='Sources';
    sources.append(heading);
    draft.sources.forEach(source=>{
      const link=document.createElement('a');
      link.href=source.url;
      link.target='_blank';
      link.rel='noopener noreferrer';
      link.textContent=source.title||source.url;
      sources.append(link);
    });
  }

  $('enhance-review').hidden=false;
}

async function describeItem(){
  if(!selectedId)return;
  if(!confirm('This will use AI to describe the first photo and set the item description. Continue?'))return;
  try{
    setAlert('');
    $('describe-item').disabled=true;
    status('Describing object from first photo...');
    const r=await api('items/describe/analyse',{method:'POST',body:JSON.stringify({item_id:selectedId})});
    if(r.item){
      const index=items.findIndex(item=>item.item_id===r.item.item_id);
      if(index>=0)items[index]=r.item;
      $('item-description').value=r.item.item_description||'';
      renderTree();
    }else{
      await load();
    }
    status('Description appended.');
  }catch(e){
    setAlert(e.message);
    status('Description failed.');
  }finally{
    $('describe-item').disabled=false;
  }
}

function collectEnhanceSelection(){
  if(!enhanceDraft)return [];
  return [...document.querySelectorAll('.enhance-row')].map(row=>{
    const index=Number(row.dataset.index);
    const original=enhanceDraft.values[index];
    const enabled=row.querySelector('[data-enhance-field="enabled"]').checked;
    if(!enabled)return null;
    return {
      attribute_id:original.attribute_id,
      value_text:row.querySelector('[data-enhance-field="value_text"]').value
    };
  }).filter(Boolean);
}

async function confirmEnhancement(){
  if(!selectedId||!enhanceDraft)return;
  const values=collectEnhanceSelection();
  if(!values.length){
    setAlert('Select at least one attribute to enhance');
    return;
  }
  try{
    setAlert('');
    $('confirm-enhance').disabled=true;
    status('Saving enhancements...');
    const r=await api('items/enhance/confirm',{method:'POST',body:JSON.stringify({item_id:selectedId,values})});
    closeEnhanceReview();
    await loadItemMetadata(selectedId);
    status(`Enhanced ${r.saved?.length||0} attribute${(r.saved?.length||0)===1?'':'s'}.`);
  }catch(e){
    $('confirm-enhance').disabled=false;
    setAlert(e.message);
    status('Enhancement failed.');
  }
}

function renderImportReview(draft){
  importDraft=draft;
  const list=$('import-review-list');
  const parentName=draft.parent_item?.item_name||items.find(item=>item.item_id===selectedId)?.item_name||'Selected object';
  $('import-review-parent').textContent=`Importing into ${parentName}`;
  list.innerHTML='';
  const objects=draft.objects||[];
  if(!objects.length){
    const empty=document.createElement('p');
    empty.className='import-empty';
    empty.textContent='No clear objects were detected in this photo.';
    list.append(empty);
    $('confirm-import').disabled=true;
  }else{
    $('confirm-import').disabled=false;
    objects.forEach((object,index)=>{
      const row=document.createElement('article');
      row.className='import-row';
      row.dataset.index=String(index);

      const enabled=document.createElement('input');
      enabled.type='checkbox';
      enabled.checked=true;
      enabled.setAttribute('aria-label',`Import ${object.item_name}`);
      enabled.dataset.importField='enabled';

      const body=document.createElement('div');
      body.className='import-row-body';
      const grid=document.createElement('div');
      grid.className='import-row-grid';

      const nameLabel=document.createElement('label');
      nameLabel.textContent='Name';
      const name=document.createElement('input');
      name.value=object.item_name||'';
      name.dataset.importField='item_name';
      nameLabel.append(name);

      const quantityLabel=document.createElement('label');
      quantityLabel.textContent='Quantity';
      const qty=document.createElement('input');
      qty.type='number';
      qty.min='1';
      qty.step='1';
      qty.value=object.quantity||1;
      qty.dataset.importField='quantity';
      quantityLabel.append(qty);

      const typeLabelEl=document.createElement('label');
      typeLabelEl.textContent='Type';
      const type=document.createElement('select');
      type.dataset.importField='object_type_id';
      const none=document.createElement('option');
      none.value='';
      none.textContent='No type';
      type.append(none);
      activeTypes().forEach(optionType=>{
        const option=document.createElement('option');
        option.value=optionType.object_type_id;
        option.textContent=optionType.type_name;
        option.selected=optionType.object_type_id===object.object_type_id;
        type.append(option);
      });
      typeLabelEl.append(type);
      grid.append(nameLabel,quantityLabel,typeLabelEl);
      body.append(grid);

      if(object.attribute_values?.length){
        const attrs=document.createElement('ul');
        attrs.className='import-attrs';
        object.attribute_values.forEach(attribute=>{
          const entry=document.createElement('li');
          const conf=attribute.confidence==null?'':` (${Math.round(attribute.confidence*100)}%)`;
          entry.textContent=`${attribute.attribute_name}: ${attribute.value_text}${conf}`;
          attrs.append(entry);
        });
        body.append(attrs);
      }else if(object.object_type_id){
        const attrs=document.createElement('ul');
        attrs.className='import-warnings';
        const entry=document.createElement('li');
        entry.textContent='No visible attributes were detected for this object type.';
        attrs.append(entry);
        body.append(attrs);
      }

      if(object.warnings?.length){
        const warnings=document.createElement('ul');
        warnings.className='import-warnings';
        object.warnings.forEach(warning=>{
          const entry=document.createElement('li');
          entry.textContent=warning;
          warnings.append(entry);
        });
        body.append(warnings);
      }

      row.append(enabled,body);
      list.append(row);
    });
  }
  $('import-review').hidden=false;
}

async function analyseImportPhoto(input){
  if(!selectedId||!input.files.length)return;
  const file=input.files[0];
  try{
    setAlert('');
    status('Analysing photo...');
    const dataUrl=await readImageDataUrl(file);
    const draft=await api('import/photo/analyse',{method:'POST',body:JSON.stringify({
      parent_item_id:selectedId,
      file_name:file.name,
      data_url:dataUrl
    })});
    input.value='';
    renderImportReview(draft);
    status('Review detected objects.');
  }catch(e){
    input.value='';
    setAlert(e.message);
    status('Import failed.');
  }
}

function collectImportSelection(){
  if(!importDraft)return [];
  return [...document.querySelectorAll('.import-row')].map(row=>{
    const index=Number(row.dataset.index);
    const original=importDraft.objects[index];
    const enabled=row.querySelector('[data-import-field="enabled"]').checked;
    if(!enabled)return null;
    return {
      ...original,
      item_name:row.querySelector('[data-import-field="item_name"]').value,
      quantity:row.querySelector('[data-import-field="quantity"]').value,
      object_type_id:row.querySelector('[data-import-field="object_type_id"]').value||null
    };
  }).filter(Boolean);
}

async function confirmImport(){
  if(!selectedId||!importDraft)return;
  const objects=collectImportSelection();
  if(!objects.length){
    setAlert('Select at least one object to import');
    return;
  }
  try{
    setAlert('');
    $('confirm-import').disabled=true;
    status('Importing objects...');
    const r=await api('import/photo/confirm',{method:'POST',body:JSON.stringify({
      parent_item_id:selectedId,
      source_photo:importDraft.source_photo,
      objects
    })});
    expanded.add(selectedId);
    closeImportReview();
    status(`Imported ${r.created?.length||0} object${(r.created?.length||0)===1?'':'s'}.`);
    await load();
  }catch(e){
    $('confirm-import').disabled=false;
    setAlert(e.message);
    status('Import failed.');
  }
}

async function loadPhotos(){
  const list=$('photo-list');
  if(!selectedId||!list)return;
  list.innerHTML='<p class="empty-state">Loading photos...</p>';
  const r=await api(`items/photo/list?item_id=${encodeURIComponent(selectedId)}`);
  const photos=r.attachments||[];
  list.innerHTML='';
  if(!photos.length){
    list.innerHTML='<p class="empty-state">No photos uploaded.</p>';
    return;
  }
  photos.forEach(photo=>{
    const tile=document.createElement('article');
    tile.className='photo-tile';
    const img=document.createElement('img');
    img.src=photo.data_url;
    img.alt=photo.file_name;
    img.addEventListener('click',()=>openPhotoViewer(photo));
    const name=document.createElement('span');
    name.textContent=photo.file_name;
    const del=document.createElement('button');
    del.type='button';
    del.className='danger-action attachment-delete';
    del.textContent='-';
    del.title=`Delete ${photo.file_name}`;
    del.setAttribute('aria-label',`Delete ${photo.file_name}`);
    del.addEventListener('click',async ()=>{
      if(!confirm(`Delete photo "${photo.file_name}"?`))return;
      await api('items/photo/delete',{method:'POST',body:JSON.stringify({attachment_id:photo.attachment_id})});
      status('Photo deleted.');
      await loadPhotos();
    });
    tile.append(img,name,del);
    list.append(tile);
  });
}

function openPhotoViewer(photo){
  $('photo-viewer-image').src=photo.data_url;
  $('photo-viewer-image').alt=photo.file_name;
  $('photo-viewer-name').textContent=photo.file_name;
  $('photo-viewer').hidden=false;
}

function closePhotoViewer(){
  $('photo-viewer').hidden=true;
  $('photo-viewer-image').src='';
  $('photo-viewer-image').alt='';
  $('photo-viewer-name').textContent='';
}

async function loadDocuments(){
  const list=$('document-list');
  if(!selectedId||!list)return;
  list.innerHTML='<p class="empty-state">Loading documents...</p>';
  const r=await api(`items/document/list?item_id=${encodeURIComponent(selectedId)}`);
  const docs=r.attachments||[];
  list.innerHTML='';
  if(!docs.length){
    list.innerHTML='<p class="empty-state">No documents uploaded.</p>';
    return;
  }
  docs.forEach(doc=>{
    const row=document.createElement('article');
    row.className='document-row';
    const link=document.createElement('a');
    link.href=doc.data_url;
    link.download=doc.file_name;
    link.textContent=doc.file_name;
    const meta=document.createElement('small');
    meta.textContent=`${doc.mime_type} - ${Math.ceil((doc.file_size||0)/1024)} KB`;
    const del=document.createElement('button');
    del.type='button';
    del.className='danger-action attachment-delete';
    del.textContent='-';
    del.title=`Delete ${doc.file_name}`;
    del.setAttribute('aria-label',`Delete ${doc.file_name}`);
    del.addEventListener('click',async ()=>{
      if(!confirm(`Delete document "${doc.file_name}"?`))return;
      await api('items/document/delete',{method:'POST',body:JSON.stringify({attachment_id:doc.attachment_id})});
      status('Document deleted.');
      await loadDocuments();
    });
    row.append(link,meta,del);
    list.append(row);
  });
}

async function uploadSelectedFile(input,type){
  if(!selectedId||!input.files.length)return;
  const file=input.files[0];
  try{
    const dataUrl=type==='photo'?await readImageDataUrl(file):await readFileDataUrl(file);
    await api(`items/${type}/upload`,{method:'POST',body:JSON.stringify({item_id:selectedId,file_name:file.name,data_url:dataUrl})});
    status(`${type==='photo'?'Photo':'Document'} uploaded.`);
    input.value='';
    if(type==='photo')await loadPhotos();
    else await loadDocuments();
  }catch(e){
    input.value='';
    setAlert(e.message);
  }
}

async function load(){
  setAlert('');
  try{
    const r=await api('items/list');
    items=r.items||[];
    if(selectedId&&!items.some(item=>item.item_id===selectedId))selectedId=null;
    await loadSetup();
    renderTree();
    selectItem(selectedId);
    status('Ready.');
  }catch(e){
    setAlert(e.message);
  }
}

async function createItem(parentId,name){
  const r=await api('items/create',{method:'POST',body:JSON.stringify({parent_item_id:parentId||null,item_name:name})});
  if(parentId)expanded.add(parentId);
  selectedId=r.item.item_id;
  await load();
}

$('add-root').addEventListener('click',async ()=>{
  const name=prompt('Root item name');
  if(!name)return;
  await createItem(null,name);
});

document.querySelector('.tree-panel')?.addEventListener('click',event=>{
  if(event.target.closest('.tree-row,.tree-guides,.tree-row-action,.tree-item,.toggle,#add-root'))return;
  selectItem(null);
});

if($('add-child'))$('add-child').addEventListener('click',async ()=>{
  const name=$('child-name').value.trim();
  if(!selectedId||!name)return;
  await createItem(selectedId,name);
});

$('item-form').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!selectedId)return;
  try{
    await api('items/update',{method:'POST',body:JSON.stringify({item_id:selectedId,item_name:$('item-name').value,quantity:$('item-quantity').value,item_description:$('item-description').value})});
    status('Item saved.');
    await load();
  }catch(e){setAlert(e.message)}
});

if($('archive-item'))$('archive-item').addEventListener('click',async ()=>{
  if(!selectedId)return;
  if(!confirm('Archive this object and its children?'))return;
  try{
    await api('items/archive',{method:'POST',body:JSON.stringify({item_id:selectedId})});
    selectedId=null;
    status('Object archived.');
    await load();
  }catch(e){setAlert(e.message)}
});

if($('delete-item'))$('delete-item').addEventListener('click',async ()=>{
  if(!selectedId)return;
  if(!confirm('Delete this item and its children?'))return;
  try{
    await api('items/delete',{method:'POST',body:JSON.stringify({item_id:selectedId})});
    selectedId=null;
    status('Item deleted.');
    await load();
  }catch(e){setAlert(e.message)}
});

if($('move-item'))$('move-item').addEventListener('click',async ()=>{
  if(!selectedId)return;
  try{
    const parentId=$('parent-select').value||null;
    await api('items/move',{method:'POST',body:JSON.stringify({item_id:selectedId,parent_item_id:parentId})});
    if(parentId)expanded.add(parentId);
    status('Item moved.');
    await load();
  }catch(e){setAlert(e.message)}
});

async function reorder(direction){
  if(!selectedId)return;
  try{
    await api('items/reorder',{method:'POST',body:JSON.stringify({item_id:selectedId,direction})});
    status(`Item moved ${direction}.`);
    await load();
  }catch(e){setAlert(e.message)}
}

if($('move-up'))$('move-up').addEventListener('click',()=>reorder('up'));
if($('move-down'))$('move-down').addEventListener('click',()=>reorder('down'));
$('close-detail').addEventListener('click',()=>selectItem(null));
document.querySelectorAll('.edit-tab-button').forEach(button=>{
  button.addEventListener('click',()=>showEditTab(button.dataset.itemPanel));
});
$('upload-photo').addEventListener('click',()=>$('photo-file').click());
$('photo-file').addEventListener('change',()=>uploadSelectedFile($('photo-file'),'photo'));
$('describe-item').addEventListener('click',describeItem);
$('import-photo').addEventListener('click',()=>$('import-photo-file').click());
$('import-photo-file').addEventListener('change',()=>analyseImportPhoto($('import-photo-file')));
$('new-event').addEventListener('click',clearEventForm);
$('cancel-event').addEventListener('click',hideEventForm);
$('close-event-form').addEventListener('click',hideEventForm);
$('event-type').addEventListener('change',()=>{
  if(!editingEventId)$('event-severity').value=$('event-type').selectedOptions[0]?.dataset.defaultSeverity||'medium';
});
$('event-form').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!selectedId)return;
  try{
    await api('items/event/save',{method:'POST',body:JSON.stringify({
      event_id:$('event-id').value||null,
      item_id:selectedId,
      event_type_id:$('event-type').value,
      event_title:$('event-title').value,
      event_description:$('event-description').value,
      event_at:$('event-at').value,
      severity:$('event-severity').value,
      status:$('event-status').value,
      reported_by_email:$('event-reported-by').value
    })});
    hideEventForm();
    await loadEvents();
    await loadSetup();
    status('Event saved.');
  }catch(e){setAlert(e.message)}
});
$('delete-event').addEventListener('click',async ()=>{
  const id=$('event-id').value;
  if(!id)return;
  if(!confirm('Delete this event?'))return;
  try{
    await api('items/event/delete',{method:'POST',body:JSON.stringify({event_id:id})});
    hideEventForm();
    await loadEvents();
    await loadSetup();
    status('Event deleted.');
  }catch(e){setAlert(e.message)}
});
document.querySelectorAll('.event-scope-button').forEach(button=>{
  button.addEventListener('click',()=>{
    eventScope=button.dataset.eventScope;
    hideEventForm();
    loadEvents().catch(e=>setAlert(e.message));
  });
});
$('upload-document').addEventListener('click',()=>$('document-file').click());
$('document-file').addEventListener('change',()=>uploadSelectedFile($('document-file'),'document'));
$('add-location').addEventListener('click',()=>ensureLocationMap());
$('map-tile-provider').addEventListener('change',event=>applyLocationTileProvider(event.target.value));
$('save-location').addEventListener('click',()=>saveLocation(false));
$('clear-location').addEventListener('click',()=>saveLocation(true));
$('item-latitude').addEventListener('change',previewLocationFromFields);
$('item-longitude').addEventListener('change',previewLocationFromFields);
$('close-import-review').addEventListener('click',closeImportReview);
$('cancel-import').addEventListener('click',closeImportReview);
$('confirm-import').addEventListener('click',confirmImport);
$('close-enhance-review').addEventListener('click',closeEnhanceReview);
$('cancel-enhance').addEventListener('click',closeEnhanceReview);
$('confirm-enhance').addEventListener('click',confirmEnhancement);
$('voice-action').addEventListener('click',startVoiceAction);
$('close-voice-review').addEventListener('click',closeVoiceReview);
$('cancel-voice-actions').addEventListener('click',closeVoiceReview);
$('confirm-voice-actions').addEventListener('click',confirmVoiceActions);
$('import-review').addEventListener('click',event=>{
  if(event.target===$('import-review'))closeImportReview();
});
$('enhance-review').addEventListener('click',event=>{
  if(event.target===$('enhance-review'))closeEnhanceReview();
});
$('voice-review').addEventListener('click',event=>{
  if(event.target===$('voice-review'))closeVoiceReview();
});
$('close-photo-viewer').addEventListener('click',closePhotoViewer);
$('photo-viewer').addEventListener('click',event=>{
  if(event.target===$('photo-viewer'))closePhotoViewer();
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!$('import-review').hidden)closeImportReview();
  if(event.key==='Escape'&&!$('enhance-review').hidden)closeEnhanceReview();
  if(event.key==='Escape'&&!$('photo-viewer').hidden)closePhotoViewer();
});
$('refresh').addEventListener('click',load);
$('dashboard-refresh').addEventListener('click',()=>loadSetup().catch(e=>setAlert(e.message)));
$('dashboard-calendar-prev').addEventListener('click',()=>shiftDashboardMonth(-1));
$('dashboard-calendar-next').addEventListener('click',()=>shiftDashboardMonth(1));
$('close-dashboard-type-items').addEventListener('click',()=>{
  $('dashboard-type-items-card').hidden=true;
  $('dashboard-type-items').innerHTML='';
});
document.querySelectorAll('.menu-item').forEach(button=>{
  button.addEventListener('click',()=>showView(button.dataset.view));
});
$('new-type').addEventListener('click',clearTypeForm);
$('cancel-type').addEventListener('click',hideTypeForm);
$('new-event-type').addEventListener('click',clearEventTypeForm);
$('cancel-event-type').addEventListener('click',hideEventTypeForm);
$('new-attribute').addEventListener('click',clearAttributeForm);
$('copy-reference-types').addEventListener('click',async ()=>{
  if(!confirm('Copy reference object types, attributes, and event types into this tenant? Existing matching names will be skipped.'))return;
  try{
    const r=await api('setup/reference/copy',{method:'POST',body:JSON.stringify({})});
    await loadSetup();
    status(`Copied ${r.object_types_created||0} object types, ${r.attributes_created||0} attributes, and ${r.event_types_created||0} event types.`);
  }catch(e){setAlert(e.message)}
});
$('type-form').addEventListener('submit',async event=>{
  event.preventDefault();
  try{
    await api('setup/type/save',{method:'POST',body:JSON.stringify({
      object_type_id:$('type-id').value||null,
      type_name:$('type-name').value,
      type_description:$('type-description').value,
      status:$('type-status').checked?'active':'disabled'
    })});
    hideTypeForm();
    await loadSetup();
    status('Object type saved.');
  }catch(e){setAlert(e.message)}
});
$('event-type-form').addEventListener('submit',async event=>{
  event.preventDefault();
  try{
    await api('setup/event-type/save',{method:'POST',body:JSON.stringify({
      event_type_id:$('event-type-id').value||null,
      type_name:$('event-type-name').value,
      type_description:$('event-type-description').value,
      default_severity:$('event-type-default-severity').value,
      status:$('event-type-status').checked?'active':'disabled'
    })});
    hideEventTypeForm();
    await loadSetup();
    status('Event type saved.');
  }catch(e){setAlert(e.message)}
});
$('openai-form').addEventListener('submit',async event=>{
  event.preventDefault();
  try{
    const r=await api('setup/openai',{method:'POST',body:JSON.stringify({
      openai_api_key:$('openai-api-key').value,
      model:$('openai-model').value
    })});
    openAISetting=r.setting;
    renderOpenAISettings();
    status('AI import settings saved.');
  }catch(e){setAlert(e.message)}
});
$('clear-openai-key').addEventListener('click',async ()=>{
  if(!confirm('Clear the OpenAI API key for this tenant?'))return;
  try{
    const r=await api('setup/openai',{method:'POST',body:JSON.stringify({
      clear_openai_api_key:true,
      model:$('openai-model').value
    })});
    openAISetting=r.setting;
    renderOpenAISettings();
    status('AI import key cleared.');
  }catch(e){setAlert(e.message)}
});
if($('export-tenant-data'))$('export-tenant-data').addEventListener('click',exportTenantData);
if($('select-tenant-import'))$('select-tenant-import').addEventListener('click',()=>$('tenant-import-file').click());
if($('tenant-import-file'))$('tenant-import-file').addEventListener('change',()=>importTenantData($('tenant-import-file')));
$('attribute-form').addEventListener('submit',async event=>{
  event.preventDefault();
  try{
    await api('setup/attribute/save',{method:'POST',body:JSON.stringify({
      attribute_id:$('attribute-id').value||null,
      object_type_id:$('attribute-object-type').value,
      attribute_name:$('attribute-name').value,
      attribute_type:$('attribute-type').value,
      status:$('attribute-status').value
    })});
    clearAttributeForm();
    await loadSetup();
    status('Attribute saved.');
  }catch(e){setAlert(e.message)}
});
$('disable-attribute').addEventListener('click',async ()=>{
  const id=$('attribute-id').value;
  if(!id)return;
  if(!confirm('Disable this attribute?'))return;
  try{
    await api('setup/attribute/delete',{method:'POST',body:JSON.stringify({attribute_id:id})});
    clearAttributeForm();
    await loadSetup();
    status('Attribute disabled.');
  }catch(e){setAlert(e.message)}
});
$('clear-search').addEventListener('click',()=>{
  $('search').value='';
  searchTerm='';
  renderTree();
});
$('search').addEventListener('input',event=>{
  searchTerm=event.target.value.trim().toLowerCase();
  renderTree();
});

load();
})();
