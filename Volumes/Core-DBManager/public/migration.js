'use strict';
const $ = id => document.getElementById(id);
const migrationApp = window.migrationApp || {};
// Extend this static registry to add tools without replacing navigation handling.
const menu = migrationApp.menu || [{label:'PostgreSQL',tools:[{id:'inserts',label:'Generate INSERT statements'}]}];
for (const group of menu) {
  const details = document.createElement('details'); details.open = true;
  const summary = document.createElement('summary'); summary.textContent = group.label; details.append(summary);
  for (const tool of group.tools) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'nav-item'; button.textContent = tool.label;
    button.onclick = () => showTool(tool.id); button.dataset.tool = tool.id; details.append(button);
  }
  $('tool-menu').append(details);
}
function showTool(id) {
  if (!document.getElementById('view-' + id)) id = 'inserts';
  document.querySelectorAll('.view').forEach(view => view.hidden = view.id !== 'view-' + id);
  document.querySelectorAll('.nav-item').forEach(button => {const active = button.dataset.tool === id; button.classList.toggle('active',active); if(active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');});
  history.replaceState(null,'','#' + id);
  migrationApp.onTool?.(id);
}
showTool(location.hash.slice(1) || migrationApp.defaultTool || 'inserts');
$('menu-toggle').onclick = () => {const collapsed = document.querySelector('.shell').classList.toggle('menu-collapsed'); $('menu-toggle').textContent = collapsed ? '›' : '‹'; $('menu-toggle').setAttribute('aria-expanded',String(!collapsed)); $('menu-toggle').setAttribute('aria-label',collapsed ? 'Expand menu' : 'Collapse menu');};
$('theme').onclick = () => {const dark = document.documentElement.dataset.theme !== 'dark'; document.documentElement.dataset.theme = dark ? 'dark' : 'light'; $('theme').textContent = dark ? 'Light mode' : 'Dark mode';};

let connection = null, schemas = [], busy = false, revision = 0, abort = null;
const tableControls = [];
function status(message,error=false) {$('status').textContent = message; $('status').classList.toggle('error',error);}
function selections() {return tableControls.map(item => ({schema:item.schema,table:item.table,columns:item.columns.filter(c => c.input.checked).map(c => c.name),replacements:item.columns.filter(c=>c.input.checked&&c.mode&&c.mode.value!=='source').map(c=>({column:c.name,mode:c.mode.value,...(c.mode.value==='value'?{value:c.value.value}:{})}))})).filter(item => item.columns.length);}
function updateControls() {
  const selected = selections();
  const count = selected.reduce((n,s) => n+s.columns.length,0);
  $('selection-count').textContent = count + (count===1?' column in ':' columns in ') + selected.length + (selected.length===1?' table':' tables');
  for (const id of ['preview','generate-all']) $(id).disabled = busy || !connection || !selected.length;
  for (const id of ['expand','collapse','clear-selection','tree-search']) $(id).disabled = busy || !connection;
  for (const item of tableControls) {for(const column of item.columns) {column.input.disabled = busy || column.generated;if(column.mode){column.mode.disabled=busy||!column.input.checked;column.value.hidden=column.mode.value!=='value';column.value.disabled=busy||!column.input.checked||column.mode.value!=='value';}} item.input.disabled = busy || !item.columns.some(c=>!c.generated);}
  $('disconnect').disabled = !connection && !busy;
  $('connection-form').querySelector('button[type=submit]').disabled = busy;
  $('connection-form').querySelectorAll('input,select').forEach(input=>input.disabled=busy);
  $('cancel').hidden = !busy;
  for (const id of ['select-output','copy-selected','copy-all','download']) $(id).disabled = busy || !$('output').value;
}
function clearOutput() {$('output').value=''; $('output-count').textContent='No statements generated';}
function resetSource() {connection=null; schemas=[]; tableControls.length=0; clearOutput(); $('source-tree').replaceChildren(); const p=document.createElement('p');p.className='empty';p.textContent='Connect to browse schemas, tables and column types.'; $('source-tree').append(p); $('tree-search').value='';updateControls();}
async function api(action,payload,signal) {
  const response=await fetch((migrationApp.root || '/migration')+'/api/source/'+action,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(migrationApp.payload ? migrationApp.payload(payload) : payload),signal,cache:'no-store'});
  const result=await response.json(); if(!response.ok)throw new Error(result.error || 'Request failed');await migrationApp.validateResponse?.(result);return result;
}
function checkbox(name,disabled=false) {const input=document.createElement('input');input.type='checkbox';input.setAttribute('aria-label',name);input.disabled=disabled;return input;}
function refreshTable(item) {
  const available=item.columns.filter(c=>!c.generated), selected=available.filter(c=>c.input.checked).length;
  item.input.checked=available.length>0&&selected===available.length;item.input.indeterminate=selected>0&&selected<available.length;
}
function renderTree() {
  $('source-tree').replaceChildren();tableControls.length=0;
  for(const schema of schemas) {
    const branch=document.createElement('details'), summary=document.createElement('summary');summary.textContent=schema.name;branch.append(summary);branch.dataset.search=schema.name.toLowerCase();
    for(const table of schema.tables) {
      const node=document.createElement('details'),heading=document.createElement('summary'),label=document.createElement('label'),input=checkbox('Select table '+schema.name+'.'+table.name);
      label.append(input,document.createTextNode(table.name));heading.append(label);node.append(heading);
      const item={schema:schema.name,table:table.name,input,columns:[],node};tableControls.push(item);
      label.onclick=event=>event.stopPropagation();
      for(const column of table.columns) {
        const row=document.createElement('div');row.className='column';const label=document.createElement('label');const check=checkbox('Select column '+schema.name+'.'+table.name+'.'+column.name,column.generated);
        const type=document.createElement('span');type.className='datatype';type.textContent='('+column.datatype+')'+(column.generated?' — generated; omitted':'');
        label.append(check,document.createTextNode(column.name+' '),type);row.append(label);node.append(row);
        const control={name:column.name,input:check,generated:column.generated,row};
        if(!column.generated){
          const mode=document.createElement('select');mode.setAttribute('aria-label','Value source for '+schema.name+'.'+table.name+'.'+column.name);
          for(const [key,text] of [['source','Source value'],['value','Fixed value'],['null','NULL']]){const option=document.createElement('option');option.value=key;option.textContent=text;mode.append(option);}
          const value=document.createElement('input');value.type='text';value.maxLength=65536;value.placeholder='Enter value (empty = empty string)';value.setAttribute('aria-label','Fixed value for '+schema.name+'.'+table.name+'.'+column.name);
          mode.onchange=value.oninput=()=>{clearOutput();updateControls();};row.append(mode,value);control.mode=mode;control.value=value;
        }
        item.columns.push(control);
        check.onchange=()=>{refreshTable(item);clearOutput();updateControls();};
      }
      input.onchange=()=>{item.columns.forEach(column=>{if(!column.generated)column.input.checked=input.checked;});refreshTable(item);clearOutput();updateControls();};
      refreshTable(item);branch.append(node);
    }
    $('source-tree').append(branch);
  }
  if(!schemas.length){const p=document.createElement('p');p.textContent='No accessible user tables found.';$('source-tree').append(p);}
  updateControls();
}
$('connection-form').onsubmit=async event=>{
  event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));
  if(connection && !values.password) values.password=connection.password;
  if(migrationApp.connection){try{Object.assign(values,migrationApp.connection(values));}catch(error){status(error.message,true);return;}}
  const token=++revision;
  resetSource();busy=true;abort=new AbortController();updateControls();status('Connecting and reading source metadata…');
  try{const result=await api('catalog',{connection:values},abort.signal);if(token!==revision)return;connection=values;schemas=result.schemas;$('connection-form').elements.password.value='';renderTree();status('Connected. Select tables or individual columns.');}
  catch(error){if(token===revision)status(error.name==='AbortError'?'Connection cancelled.':error.message,true);}
  finally{if(token===revision){busy=false;abort=null;updateControls();}}
};
$('disconnect').onclick=()=>{revision++;abort?.abort();abort=null;busy=false;resetSource();$('connection-form').reset();migrationApp.onDisconnect?.();$('connection-panel').open=true;status('Disconnected. Credentials and generated data cleared.');};
// Editing connection fields invalidates metadata and credentials from the previous source.
$('connection-form').addEventListener('input',()=>{if(connection){revision++;resetSource();status('Connection changed. Connect again to browse this source.');}});
$('cancel').onclick=()=>{revision++;abort?.abort();abort=null;busy=false;clearOutput();updateControls();status('Request cancelled.');};
async function generate(mode) {
  const token=++revision;clearOutput();busy=true;abort=new AbortController();updateControls();status(mode==='all'?'Generating all source rows…':'Generating preview…');
  try{const result=await api('generate',{connection,selections:selections(),mode},abort.signal);if(token!==revision)return;$('output').value=result.statements.join('\n');$('output-count').textContent=result.statements.length+' statements · '+(mode==='all'?'All rows':'Preview');const truncated=result.tables.filter(t=>t.truncated);status(result.statements.length+' statements generated.'+(truncated.length?' Preview limited to '+result.previewRows+' rows per table; '+truncated.length+' tables have more rows.':'')+(mode==='preview'?' Preview row order is unspecified.':''));}
  catch(error){if(token===revision)status(error.name==='AbortError'?'Generation cancelled.':error.message,true);}
  finally{if(token===revision){busy=false;abort=null;updateControls();}}
}
$('preview').onclick=()=>generate('preview');$('generate-all').onclick=()=>generate('all');
$('expand').onclick=()=>document.querySelectorAll('#source-tree details').forEach(node=>node.open=true);
$('collapse').onclick=()=>document.querySelectorAll('#source-tree details').forEach(node=>node.open=false);
$('clear-selection').onclick=()=>{tableControls.forEach(item=>{item.columns.forEach(c=>c.input.checked=false);refreshTable(item);});clearOutput();updateControls();};
$('tree-search').oninput=()=>{const term=$('tree-search').value.trim().toLowerCase();for(const item of tableControls){const all=(item.schema+' '+item.table).toLowerCase().includes(term);let match=false;for(const c of item.columns){c.row.hidden=!!term&&!all&&!c.name.toLowerCase().includes(term);if(!c.row.hidden)match=true;}item.node.hidden=!match;if(term&&match){item.node.open=true;item.node.parentElement.open=true;}}for(const branch of $('source-tree').children)branch.hidden=[...branch.querySelectorAll(':scope > details')].every(node=>node.hidden);};
$('select-output').onclick=()=>{$('output').focus();$('output').select();};
async function copy(selected) {const output=$('output');const value=selected?output.value.slice(output.selectionStart,output.selectionEnd):output.value;if(!value)return status('Select statement text first.',true);try{await navigator.clipboard.writeText(value);status(selected?'Selected SQL copied.':'All SQL copied.');}catch{output.focus();if(!selected)output.select();status('Clipboard access unavailable. Use Ctrl+C to copy the selected SQL.',true);}}
$('copy-selected').onclick=()=>copy(true);$('copy-all').onclick=()=>copy(false);
$('download').onclick=()=>{const blob=new Blob([$('output').value+'\n'],{type:'application/sql;charset=utf-8'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='migration-inserts.sql';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
window.addEventListener('pagehide',()=>{revision++;abort?.abort();busy=false;resetSource();$('connection-form').reset();});
window.resetMigrationSource=()=>{revision++;abort?.abort();abort=null;busy=false;resetSource();$('connection-form').reset();migrationApp.onDisconnect?.();};
updateControls();
