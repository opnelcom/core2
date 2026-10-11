'use strict';
// Configuration consumed by this application's local migration controller.
const dbManager={tenantId:null,connections:[],revision:0,editor:null};
window.migrationApp={
  root:'/dbmanager',defaultTool:'connections',
  menu:[{label:'PostgreSQL',tools:[{id:'connections',label:'Database connections'},{id:'inserts',label:'Generate INSERT statements'}]}],
  onTool:id=>{document.getElementById('tool-title').textContent=id==='connections'?'Database connections':'Generate INSERT statements';document.getElementById('tool-description').textContent=id==='connections'?'Manage the PostgreSQL connections shared by your tenant.':'Choose a saved connection, enter its password, and generate a script.';},
  connection:values=>{const row=dbManager.connections.find(row=>row.connection_id===values.connection_id);if(!row)throw new Error('Choose a saved connection');return {connection_id:row.connection_id,version:row.version,tenant_id:dbManager.tenantId};},
  payload:payload=>({...payload,tenant_id:payload.connection.tenant_id}),
  onDisconnect:()=>pickerDetails(),
  validateResponse:async result=>{await verifyTenant();if(result.tenant_id!==dbManager.tenantId)throw new Error('Tenant changed. Reconnect using the current tenant.');}
};
const element=id=>document.getElementById(id);
function message(text,error=false){element('status').textContent=text;element('status').classList.toggle('error',error);}
function clearContext(){dbManager.revision++;dbManager.connections=[];dbManager.editor=null;window.resetMigrationSource?.();element('saved-connection').replaceChildren();element('connection-list').replaceChildren();element('saved-details').textContent='';element('connection-search').value='';element('saved-form').reset();element('connection-editor').hidden=true;}
async function verifyTenant(){
  const response=await fetch('/api/auth/session',{cache:'no-store'});if(!response.ok)throw new Error('Session check unavailable');const session=await response.json();
  const current=session.authenticated?session.current_tenant:null;
  if(current!==dbManager.tenantId){clearContext();dbManager.tenantId=current;throw new Error(current?'Tenant changed. Reload connections.':'Sign in and select an active tenant.');}
  return current;
}
async function managerApi(action,body){
  const tenantId=dbManager.tenantId;
  const response=await fetch('/dbmanager/api/connections/'+action,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify({...body,tenant_id:tenantId}):undefined,cache:'no-store'});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Request failed');
  await verifyTenant();if(result.tenant_id!==dbManager.tenantId)throw new Error('Tenant changed. Reload connections.');return result;
}
function fillPicker(){
  const picker=element('saved-connection'),previous=picker.value;picker.replaceChildren();
  const empty=document.createElement('option');empty.value='';empty.textContent=dbManager.connections.length?'Choose a connection':'Create a connection first';picker.append(empty);
  for(const row of dbManager.connections){const option=document.createElement('option');option.value=row.connection_id;option.textContent=row.connection_name;picker.append(option);}
  picker.value=dbManager.connections.some(row=>row.connection_id===previous)?previous:'';pickerDetails();
}
function pickerDetails(){const row=dbManager.connections.find(row=>row.connection_id===element('saved-connection').value);element('saved-details').textContent=row?`${row.host}:${row.port} / ${row.database_name} · ${row.username} · ${row.ssl_mode==='verify-full'?'Verified TLS':'TLS disabled'}`:'';}
function renderConnections(){
  const target=element('connection-list');target.replaceChildren();const search=element('connection-search').value.trim().toLowerCase();
  const rows=dbManager.connections.filter(row=>[row.connection_name,row.host,row.database_name,row.username,row.description].some(value=>value.toLowerCase().includes(search)));
  if(!rows.length){const p=document.createElement('p');p.className='empty';p.textContent=dbManager.connections.length?'No matching connections.':'No connections yet. Use + to add one.';target.append(p);return;}
  const table=document.createElement('table');table.className='connection-table';const head=table.createTHead().insertRow();
  for(const title of ['Name','Host / port','Database','Username','TLS']){const cell=document.createElement('th');cell.textContent=title;head.append(cell);}
  const body=table.createTBody();for(const row of rows){const tr=body.insertRow();tr.tabIndex=0;tr.setAttribute('aria-label','Edit connection '+row.connection_name);
    for(const value of [row.connection_name,`${row.host}:${row.port}`,row.database_name,row.username,row.ssl_mode==='verify-full'?'Verified':'Disabled'])tr.insertCell().textContent=value;
    tr.onclick=()=>openEditor(row);tr.onkeydown=event=>{if(event.target===tr&&['Enter',' '].includes(event.key)){event.preventDefault();openEditor(row);}};
  }target.append(table);
}
async function loadConnections(){
  const token=++dbManager.revision;message('Loading tenant connections…');
  try{const response=await fetch('/api/auth/session',{cache:'no-store'});if(!response.ok)throw new Error('Session check unavailable');const session=await response.json();
    if(token!==dbManager.revision)return;const tenant=session.authenticated?session.current_tenant:null;
    if(tenant!==dbManager.tenantId){clearContext();dbManager.tenantId=tenant;}
    if(!tenant)throw new Error('Sign in and select an active tenant.');
    const activeToken=dbManager.revision;const result=await managerApi('list');if(activeToken!==dbManager.revision)return;
    const selected=element('saved-connection').value;const prior=dbManager.connections.find(row=>row.connection_id===selected);const next=result.connections.find(row=>row.connection_id===selected);
    if(prior&&(!next||prior.version!==next.version))window.resetMigrationSource();
    dbManager.connections=result.connections;renderConnections();fillPicker();message('Connections loaded. Passwords are entered only when a connection is used.');
  }catch(error){message(error.message,true);}
}
function openEditor(row=null){
  dbManager.editor=row;const form=element('saved-form');form.reset();
  if(row)for(const key of ['connection_name','engine','host','port','database_name','username','ssl_mode','description'])form.elements[key].value=row[key];
  element('editor-title').textContent=row?'Edit connection':'New connection';element('delete-connection').hidden=!row;element('delete-confirm').hidden=true;element('connection-editor').hidden=false;form.elements.connection_name.focus();
}
function closeEditor(){element('connection-editor').hidden=true;dbManager.editor=null;element('new-connection').focus();}
window.addEventListener('DOMContentLoaded',()=>{
  element('connection-search').oninput=renderConnections;element('reload-connections').onclick=loadConnections;element('new-connection').onclick=()=>{if(!dbManager.tenantId)return message('Select an active tenant first.',true);openEditor();};
  element('saved-connection').onchange=pickerDetails;element('close-editor').onclick=element('cancel-editor').onclick=closeEditor;
  element('saved-form').onsubmit=async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));values.port=Number(values.port);const row=dbManager.editor;if(row){values.connection_id=row.connection_id;values.version=row.version;}
    const save=element('save-connection');save.disabled=true;try{await managerApi('save',values);closeEditor();window.resetMigrationSource();await loadConnections();message('Connection saved.');}catch(error){message(error.message,true);}finally{save.disabled=false;}};
  element('delete-connection').onclick=()=>{element('delete-confirm').hidden=false;element('delete-confirm-name').textContent=dbManager.editor.connection_name;};
  element('cancel-delete').onclick=()=>element('delete-confirm').hidden=true;
  element('confirm-delete').onclick=async()=>{const row=dbManager.editor;if(!row)return;const button=element('confirm-delete');button.disabled=true;try{await managerApi('delete',{connection_id:row.connection_id,version:row.version});closeEditor();window.resetMigrationSource();await loadConnections();message('Connection deleted.');}catch(error){message(error.message,true);}finally{button.disabled=false;}};
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!element('connection-editor').hidden)closeEditor();});
  window.addEventListener('focus',()=>verifyTenant().catch(error=>message(error.message,true)));
  setInterval(()=>verifyTenant().catch(error=>message(error.message,true)),15000);
  loadConnections();
});
