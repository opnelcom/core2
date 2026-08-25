(()=>{
const $=id=>document.getElementById(id);
let tasks=[];
let statuses=['active','future','on_hold','blocked','complete','cancelled'];
let importanceValues=['low','normal','high','critical'];
let selectedId=null;
let expanded=new Set();
let searchTerm='';
let activeView='about';
let draggedId=null;
let activeDetailTab='details';
let dashboardFilter=null;
let openAISetting={has_openai_api_key:false,model:'gpt-4.1-mini'};
let voiceDraft=null;
let voiceRecognizer=null;
let voiceListening=false;

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
  const r=await fetch('/tasks/api/'+path,{headers:{'content-type':'application/json'},...options});
  const j=await r.json();
  if(!r.ok)throw new Error(j.error||'Request failed');
  return j;
}

function setAlert(message){
  $('alert').hidden=!message;
  $('alert').textContent=message||'';
}

function status(message){
  $('status').textContent=message;
}

function label(value){
  return String(value||'').replaceAll('_',' ');
}

function titleLabel(value){
  const text=label(value);
  return text?text.charAt(0).toUpperCase()+text.slice(1):text;
}

function metricCountLevel(value,max){
  if(!value||!max)return 0;
  return Math.max(1,Math.min(5,Math.ceil((value/max)*5)));
}

function dateLabel(value){
  if(!value)return '';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return String(value);
  return date.toLocaleDateString();
}

function parentName(task){
  if(!task?.parent_task_id)return 'Top level';
  return tasks.find(item=>item.task_id===task.parent_task_id)?.task_name||'Top level';
}

function parentTrail(task,limit=2){
  const map=taskMap();
  const trail=[];
  const seen=new Set();
  let current=task?.parent_task_id?map.get(task.parent_task_id):null;
  while(current&&!seen.has(current.task_id)&&trail.length<limit){
    trail.unshift(current.task_name);
    seen.add(current.task_id);
    current=current.parent_task_id?map.get(current.parent_task_id):null;
  }
  return trail;
}

function renderOpenAISettings(){
  if(!$('openai-model'))return;
  $('openai-model').value=openAISetting.model||'gpt-4.1-mini';
  $('openai-api-key').value='';
  const updated=openAISetting.updated_at?` Last updated ${new Date(openAISetting.updated_at).toLocaleString()}.`:'';
  $('openai-key-status').textContent=openAISetting.has_openai_api_key?`Key saved for this tenant.${updated}`:'No key saved for this tenant.';
}

async function loadOpenAISettings(){
  try{
    openAISetting=await api('setup/openai');
    renderOpenAISettings();
  }catch(e){
    if($('openai-key-status'))$('openai-key-status').textContent=e.message;
  }
}

function taskMap(){
  return new Map(tasks.map(task=>[task.task_id,task]));
}

function childrenByParent(){
  const map=new Map();
  tasks.forEach(task=>{
    const key=task.parent_task_id||'root';
    if(!map.has(key))map.set(key,[]);
    map.get(key).push(task);
  });
  map.forEach(children=>children.sort((a,b)=>(a.sort_order-b.sort_order)||a.task_name.localeCompare(b.task_name)));
  return map;
}

function descendantIds(id,map=childrenByParent()){
  const result=new Set();
  function walk(parentId){
    (map.get(parentId)||[]).forEach(child=>{
      result.add(child.task_id);
      walk(child.task_id);
    });
  }
  walk(id);
  return result;
}

function isVisibleMatch(task){
  if(!searchTerm)return true;
  return `${task.task_name} ${task.task_description||''} ${task.status} ${task.importance}`.toLowerCase().includes(searchTerm);
}

function shouldShow(task,map){
  if(!searchTerm)return true;
  if(isVisibleMatch(task))return true;
  return [...descendantIds(task.task_id,map)].some(id=>isVisibleMatch(taskMap().get(id)||{}));
}

function rollupMap(){
  const children=childrenByParent();
  const memo=new Map();
  function calc(task){
    if(memo.has(task.task_id))return memo.get(task.task_id);
    const kids=(children.get(task.task_id)||[]).filter(child=>!['archived','deleted','cancelled'].includes(child.status));
    let value;
    if(kids.length){
      value=kids.reduce((sum,child)=>sum+calc(child),0)/kids.length;
    }else{
      value=task.status==='complete'?100:Number(task.percent_complete)||0;
    }
    memo.set(task.task_id,Math.round(value));
    return memo.get(task.task_id);
  }
  tasks.forEach(calc);
  return memo;
}

function expandAncestors(id){
  const map=taskMap();
  let current=map.get(id);
  const seen=new Set();
  while(current?.parent_task_id&&!seen.has(current.parent_task_id)){
    expanded.add(current.parent_task_id);
    seen.add(current.parent_task_id);
    current=map.get(current.parent_task_id);
  }
}

function clearDropHints(){
  document.querySelectorAll('.drop-before,.drop-after,.drop-inside,.drop-root').forEach(el=>{
    el.classList.remove('drop-before','drop-after','drop-inside','drop-root');
  });
}

function dropPosition(event,row){
  const rect=row.getBoundingClientRect();
  const ratio=(event.clientY-rect.top)/Math.max(rect.height,1);
  if(ratio<0.25)return 'before';
  if(ratio>0.75)return 'after';
  return 'inside';
}

async function positionTask(taskId,targetId,position){
  if(!taskId||!targetId||taskId===targetId)return;
  try{
    await api('tasks/position',{method:'POST',body:JSON.stringify({task_id:taskId,target_task_id:targetId,position})});
    if(position==='inside')expanded.add(targetId);
    selectedId=taskId;
    status(position==='inside'?'Task moved under target.':'Task reordered.');
    await load();
  }catch(e){
    setAlert(e.message);
  }
}

async function moveTaskToRoot(taskId){
  if(!taskId)return;
  const task=tasks.find(item=>item.task_id===taskId);
  if(!task||!task.parent_task_id)return;
  try{
    await api('tasks/move',{method:'POST',body:JSON.stringify({task_id:taskId,parent_task_id:null})});
    selectedId=taskId;
    status('Task moved to top level.');
    await load();
  }catch(e){
    setAlert(e.message);
  }
}

async function toggleTaskCritical(taskId){
  const task=tasks.find(item=>item.task_id===taskId);
  if(!task)return;
  const nextImportance=task.importance==='critical'?'normal':'critical';
  try{
    await api('tasks/update',{method:'POST',body:JSON.stringify({
      task_id:task.task_id,
      task_name:task.task_name,
      task_description:task.task_description||'',
      importance:nextImportance,
      status:task.status||'active',
      percent_complete:task.percent_complete||0,
      start_date:task.start_date||'',
      due_date:task.due_date||''
    })});
    selectedId=task.task_id;
    status(nextImportance==='critical'?'Task marked critical.':'Task unmarked critical.');
    await load();
  }catch(e){
    setAlert(e.message);
  }
}

function showView(view){
  activeView=view;
  document.querySelectorAll('.view-panel').forEach(panel=>panel.hidden=panel.id!==`view-${view}`);
  document.querySelectorAll('.menu-item').forEach(button=>button.classList.toggle('active',button.dataset.view===view));
  if(view==='dashboard')renderDashboard();
  if(view==='tasks')renderTree();
  if(view==='setup')loadOpenAISettings();
}

function renderDashboard(){
  const summary=$('dashboard-summary');
  const statusGrid=$('dashboard-statuses');
  const importanceGrid=$('dashboard-importance');
  const criticalGrid=$('dashboard-critical-items');
  if(!summary||!statusGrid||!importanceGrid)return;
  const rollups=rollupMap();
  const active=tasks.filter(task=>task.status==='active').length;
  const blocked=tasks.filter(task=>task.status==='blocked').length;
  const complete=tasks.filter(task=>task.status==='complete').length;
  const overdue=tasks.filter(task=>task.due_date&&new Date(task.due_date)<new Date()&&!['complete','cancelled'].includes(task.status)).length;
  const avg=tasks.length?Math.round(tasks.reduce((sum,task)=>sum+(rollups.get(task.task_id)||0),0)/tasks.length):0;
  function appendMetric(container,name,value,className='',onClick=null){
    const card=document.createElement(onClick?'button':'article');
    if(onClick)card.type='button';
    card.className=`metric-card${onClick?' metric-clickable':''}${className?` ${className}`:''}`;
    const labelEl=document.createElement('span');
    labelEl.textContent=name;
    const number=document.createElement('strong');
    number.textContent=value;
    card.append(labelEl,number);
    if(onClick)card.addEventListener('click',onClick);
    container.append(card);
  }
  summary.innerHTML='';
  [['Tasks',tasks.length],['Active',active],['Blocked',blocked],['Overdue',overdue],['Complete',complete],['Average progress',`${avg}%`]].forEach(([name,value])=>{
    appendMetric(summary,name,value);
  });
  statusGrid.innerHTML='';
  const statusCounts=statuses.map(value=>[value,tasks.filter(task=>task.status===value).length]);
  const maxStatusCount=Math.max(0,...statusCounts.map(([,count])=>count));
  statusCounts.forEach(([value,count])=>{
    appendMetric(statusGrid,titleLabel(value),count,`metric-status-${value} metric-count-${metricCountLevel(count,maxStatusCount)}`,()=>showDashboardTaskGrid('status',value));
  });
  importanceGrid.innerHTML='';
  const importanceCounts=importanceValues.map(value=>[value,tasks.filter(task=>task.importance===value).length]);
  const maxImportanceCount=Math.max(0,...importanceCounts.map(([,count])=>count));
  importanceCounts.forEach(([value,count])=>{
    appendMetric(importanceGrid,titleLabel(value),count,`metric-importance-${value} metric-count-${metricCountLevel(count,maxImportanceCount)}`,()=>showDashboardTaskGrid('importance',value));
  });
  renderCriticalItems(criticalGrid);
  if(dashboardFilter)showDashboardTaskGrid(dashboardFilter.kind,dashboardFilter.value);
}

function renderCriticalItems(target){
  if(!target)return;
  const rollups=rollupMap();
  const criticalTasks=tasks
    .filter(task=>task.importance==='critical')
    .sort((a,b)=>{
      const dueA=a.due_date||'9999-12-31';
      const dueB=b.due_date||'9999-12-31';
      return dueA.localeCompare(dueB)||String(a.task_name||'').localeCompare(String(b.task_name||''));
    });
  target.innerHTML='';
  if(!criticalTasks.length){
    target.innerHTML='<p class="empty-state">No critical items.</p>';
    return;
  }
  criticalTasks.forEach(task=>{
    const tile=document.createElement('button');
    tile.type='button';
    tile.className='critical-item-tile';
    const title=document.createElement('strong');
    title.textContent=task.task_name;
    const parents=document.createElement('span');
    const trail=parentTrail(task,2);
    parents.textContent=trail.length?trail.join(' / '):'Top level';
    const meta=document.createElement('small');
    meta.textContent=[
      `${rollups.get(task.task_id)||0}%`,
      titleLabel(task.status),
      dateLabel(task.due_date)?`Due ${dateLabel(task.due_date)}`:'No due date'
    ].join(' | ');
    tile.append(title,parents,meta);
    tile.addEventListener('click',()=>{
      showView('tasks');
      selectTask(task.task_id);
    });
    target.append(tile);
  });
}

function showDashboardTaskGrid(kind,value){
  const card=$('dashboard-filter-items-card');
  const title=$('dashboard-filter-items-title');
  const target=$('dashboard-filter-items');
  if(!card||!title||!target)return;
  dashboardFilter={kind,value};
  const rows=tasks.filter(task=>task[kind]===value);
  card.hidden=false;
  title.textContent=`Tasks with ${kind}: ${titleLabel(value)}`;
  if(!rows.length){
    target.innerHTML=`<p class="empty-state">No tasks match this ${kind}.</p>`;
    return;
  }
  const rollups=rollupMap();
  const table=document.createElement('table');
  table.className='dashboard-task-table';
  const thead=document.createElement('thead');
  thead.innerHTML='<tr><th>Task</th><th>Parent</th><th>Status</th><th>Importance</th><th>Progress</th><th>Due</th><th>Updated</th></tr>';
  const tbody=document.createElement('tbody');
  rows
    .slice()
    .sort((a,b)=>String(a.task_name||'').localeCompare(String(b.task_name||'')))
    .forEach(task=>{
      const tr=document.createElement('tr');
      const updated=task.updated_at?new Date(task.updated_at).toLocaleString():'';
      [
        task.task_name,
        parentName(task),
        titleLabel(task.status),
        titleLabel(task.importance),
        `${rollups.get(task.task_id)||0}%`,
        dateLabel(task.due_date)||'',
        updated
      ].forEach(text=>{
        const td=document.createElement('td');
        td.textContent=text;
        tr.append(td);
      });
      tr.addEventListener('click',()=>{
        showView('tasks');
        selectTask(task.task_id);
      });
      tbody.append(tr);
    });
  table.append(thead,tbody);
  target.innerHTML='';
  target.append(table);
}

function renderTree(){
  const tree=$('tree');
  if(!tree)return;
  tree.innerHTML='';
  const children=childrenByParent();
  const rollups=rollupMap();
  const roots=children.get('root')||[];
  if(!roots.length){
    tree.innerHTML='<p class="empty-state">No tasks yet. Add a top-level task or copy reference categories in Setup.</p>';
    return;
  }
  function renderBranch(parentId,container){
    (children.get(parentId)||[]).forEach(task=>{
      if(!shouldShow(task,children))return;
      const row=document.createElement('div');
      row.className='tree-row';
      row.draggable=true;
      row.dataset.taskId=task.task_id;
      const kids=children.get(task.task_id)||[];
      const toggle=document.createElement('button');
      toggle.type='button';
      toggle.className=kids.length?'toggle':'toggle placeholder';
      toggle.textContent=expanded.has(task.task_id)?'v':'>';
      toggle.setAttribute('aria-label',`${expanded.has(task.task_id)?'Collapse':'Expand'} ${task.task_name}`);
      toggle.addEventListener('click',()=>{
        if(expanded.has(task.task_id))expanded.delete(task.task_id);
        else expanded.add(task.task_id);
        renderTree();
      });
      const item=document.createElement('button');
      item.type='button';
      item.className='tree-item';
      item.classList.toggle('selected',task.task_id===selectedId);
      const name=document.createElement('span');
      name.textContent=task.task_name;
      name.className=`importance-${task.importance}`;
      item.append(name);
      item.addEventListener('click',()=>selectTask(task.task_id));
      const critical=document.createElement('button');
      critical.type='button';
      critical.className='critical-toggle';
      critical.classList.toggle('active',task.importance==='critical');
      critical.textContent='★';
      critical.setAttribute('aria-label',`${task.importance==='critical'?'Unmark':'Mark'} ${task.task_name} as critical`);
      critical.title=task.importance==='critical'?'Unmark critical':'Mark critical';
      critical.addEventListener('click',event=>{
        event.stopPropagation();
        toggleTaskCritical(task.task_id);
      });
      const progress=document.createElement('small');
      progress.className='tree-progress';
      progress.textContent=`${rollups.get(task.task_id)||0}%`;
      const pill=document.createElement('span');
      pill.className='status-pill';
      pill.textContent=label(task.status);
      row.addEventListener('dragstart',event=>{
        draggedId=task.task_id;
        event.dataTransfer.effectAllowed='move';
        event.dataTransfer.setData('text/plain',task.task_id);
        row.classList.add('dragging');
      });
      row.addEventListener('dragend',()=>{
        draggedId=null;
        row.classList.remove('dragging');
        clearDropHints();
      });
      row.addEventListener('dragover',event=>{
        if(!draggedId||draggedId===task.task_id)return;
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
        positionTask(sourceId,task.task_id,position);
      });
      row.append(toggle,item,critical,progress,pill);
      container.append(row);
      if(kids.length&&expanded.has(task.task_id)){
        const guide=document.createElement('div');
        guide.className='tree-guides';
        renderBranch(task.task_id,guide);
        container.append(guide);
      }
    });
  }
  renderBranch('root',tree);
}

function renderParentOptions(){
  const select=$('task-parent');
  const current=tasks.find(task=>task.task_id===selectedId);
  if(!select||!current)return;
  const descendants=descendantIds(selectedId);
  select.innerHTML='<option value="">Top level</option>';
  tasks.forEach(task=>{
    if(task.task_id===selectedId||descendants.has(task.task_id))return;
    const option=document.createElement('option');
    option.value=task.task_id;
    option.textContent=task.task_name;
    option.selected=current.parent_task_id===task.task_id;
    select.append(option);
  });
}

function closeVoiceReview(){
  $('voice-review').hidden=true;
  $('voice-review-list').innerHTML='';
  $('voice-review-summary').textContent='';
  $('voice-review-transcript').textContent='';
  voiceDraft=null;
}

function voiceActionTitle(action){
  if(action.action_type==='create_task')return `Create task: ${action.task_name}`;
  if(action.action_type==='update_task')return `Update ${action.task_name}`;
  if(action.action_type==='rename_task')return `Rename ${action.task_name}`;
  if(action.action_type==='move_task')return `Move ${action.task_name}`;
  return 'Voice action';
}

function voiceActionMeta(action){
  if(action.action_type==='create_task'){
    return [
      `Parent: ${action.parent_task_name||'Top level'}`,
      `Status: ${label(action.status||'active')}`,
      `Importance: ${label(action.importance||'normal')}`,
      action.due_date?`Due: ${dateLabel(action.due_date)}`:'No due date'
    ];
  }
  if(action.action_type==='update_task'){
    return [
      action.status?`Status: ${label(action.current?.status)} -> ${label(action.status)}`:'',
      action.importance?`Importance: ${label(action.current?.importance)} -> ${label(action.importance)}`:'',
      action.percent_complete?`Progress: ${action.current?.percent_complete||0}% -> ${action.percent_complete}%`:'',
      action.start_date?`Start: ${dateLabel(action.start_date)}`:'',
      action.due_date?`Due: ${dateLabel(action.due_date)}`:'',
      action.task_description?'Description will be updated':''
    ].filter(Boolean);
  }
  if(action.action_type==='rename_task')return [`From: ${action.task_name}`,`To: ${action.new_task_name}`];
  if(action.action_type==='move_task')return [`Target: ${action.target_parent_task_name||'Top level'}`];
  return [];
}

function renderVoiceReview(draft){
  voiceDraft=draft;
  const list=$('voice-review-list');
  list.innerHTML='';
  $('voice-review-transcript').textContent=`Heard: "${draft.transcript||''}"`;
  $('voice-review-summary').textContent=draft.summary||'Review the proposed task changes before applying them.';
  const actions=draft.actions||[];
  if(!actions.length){
    const empty=document.createElement('p');
    empty.className='empty-state';
    empty.textContent='No clear task changes were found in that voice prompt.';
    list.append(empty);
    $('confirm-voice-actions').disabled=true;
  }else{
    $('confirm-voice-actions').disabled=false;
    actions.forEach((action,index)=>{
      const row=document.createElement('article');
      row.className='voice-action-row';
      row.dataset.actionId=action.action_id;

      const enabled=document.createElement('input');
      enabled.type='checkbox';
      enabled.checked=true;
      enabled.setAttribute('aria-label',`Apply ${voiceActionTitle(action)}`);
      enabled.dataset.voiceField='enabled';

      const body=document.createElement('div');
      body.className='voice-action-body';

      const title=document.createElement('div');
      title.className='voice-action-title';
      const name=document.createElement('strong');
      name.textContent=voiceActionTitle(action);
      const ordinal=document.createElement('small');
      ordinal.textContent=String(index+1);
      title.append(name,ordinal);

      const detail=document.createElement('p');
      detail.className='voice-action-detail';
      detail.textContent=action.description||'Apply this task change.';

      const meta=document.createElement('div');
      meta.className='voice-action-meta';
      voiceActionMeta(action).forEach(text=>{
        const pill=document.createElement('span');
        pill.textContent=text;
        meta.append(pill);
      });

      body.append(title,detail,meta);
      row.append(enabled,body);
      list.append(row);
    });
  }

  if(draft.warnings?.length){
    const warnings=document.createElement('ul');
    warnings.className='review-warnings';
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
  return [...document.querySelectorAll('#voice-review-list .voice-action-row')]
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
    const typed=prompt('Voice recognition is not available in this browser. Type the task action instead.');
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
    const draft=voiceDraft;
    const r=await api('voice/confirm',{method:'POST',body:JSON.stringify({
      actions:draft.actions||[],
      selected_action_ids:selectedActionIds
    })});
    const lastTask=[...(r.applied||[])].reverse().find(action=>action.task_id);
    closeVoiceReview();
    if(lastTask?.task_id)selectedId=lastTask.task_id;
    (draft.actions||[]).forEach(action=>{
      if(!selectedActionIds.includes(action.action_id))return;
      if(action.parent_task_id)expanded.add(action.parent_task_id);
      if(action.target_parent_task_id)expanded.add(action.target_parent_task_id);
    });
    await load();
    status(`Applied ${r.applied?.length||0} voice action${(r.applied?.length||0)===1?'':'s'}.`);
  }catch(e){
    $('confirm-voice-actions').disabled=false;
    setAlert(e.message);
    status('Voice action failed.');
  }
}

function taskPath(taskId){
  const map=taskMap();
  const parts=[];
  let current=map.get(taskId);
  const seen=new Set();
  while(current&&!seen.has(current.task_id)){
    parts.unshift(current.task_name);
    seen.add(current.task_id);
    current=current.parent_task_id?map.get(current.parent_task_id):null;
  }
  return parts;
}

function renderSubtasks(){
  const grid=$('subtask-grid');
  if(!grid)return;
  grid.innerHTML='';
  const current=tasks.find(task=>task.task_id===selectedId);
  if(!current){
    grid.innerHTML='<p class="empty-state">Select a task to view subtasks.</p>';
    return;
  }
  const children=childrenByParent();
  const statusFilter=$('subtask-status-filter')?.value||'all';
  const leafIds=[...descendantIds(selectedId,children)]
    .filter(id=>(children.get(id)||[]).length===0)
    .filter(id=>{
      const task=tasks.find(item=>item.task_id===id);
      return statusFilter==='all'||task?.status===statusFilter;
    });
  if(!leafIds.length){
    grid.innerHTML='<p class="empty-state">No leaf subtasks match this status filter.</p>';
    return;
  }
  const header=document.createElement('div');
  header.className='subtask-grid-row subtask-grid-head';
  ['Child item','Parents','Status'].forEach(text=>{
    const cell=document.createElement('span');
    cell.textContent=text;
    header.append(cell);
  });
  grid.append(header);
  leafIds
    .map(id=>tasks.find(task=>task.task_id===id))
    .filter(Boolean)
    .sort((a,b)=>taskPath(a.task_id).join('\\').localeCompare(taskPath(b.task_id).join('\\')))
    .forEach(task=>{
      const row=document.createElement('button');
      row.type='button';
      row.className='subtask-grid-row';
      const name=document.createElement('strong');
      name.textContent=task.task_name;
      const parents=document.createElement('span');
      const path=taskPath(task.task_id);
      parents.textContent=path.slice(0,-1).join(' \\ ')||current.task_name;
      const status=document.createElement('span');
      status.className='status-pill';
      status.textContent=label(task.status);
      row.append(name,parents,status);
      row.addEventListener('click',()=>selectTask(task.task_id));
      grid.append(row);
    });
}

function formatBytes(value){
  const size=Number(value)||0;
  if(size<1024)return `${size} B`;
  if(size<1024*1024)return `${Math.round(size/1024)} KB`;
  return `${(size/(1024*1024)).toFixed(1)} MB`;
}

async function loadDocuments(){
  const list=$('document-list');
  if(!list)return;
  if(!selectedId){
    list.innerHTML='<p class="empty-state">Select a task to view documents.</p>';
    return;
  }
  list.innerHTML='<p class="empty-state">Loading documents...</p>';
  const r=await api(`tasks/document/list?task_id=${encodeURIComponent(selectedId)}`);
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
    meta.textContent=`${doc.mime_type} - ${formatBytes(doc.file_size)}`;
    const del=document.createElement('button');
    del.type='button';
    del.className='danger-action document-delete';
    del.textContent='Delete';
    del.addEventListener('click',async ()=>{
      if(!confirm(`Delete document "${doc.file_name}"?`))return;
      await api('tasks/document/delete',{method:'POST',body:JSON.stringify({attachment_id:doc.attachment_id})});
      status('Document deleted.');
      await loadDocuments();
    });
    row.append(link,meta,del);
    list.append(row);
  });
}

async function uploadSelectedDocument(input){
  if(!selectedId)return setAlert('Select a task before uploading a document.');
  const file=input.files&&input.files[0];
  if(!file)return;
  if(file.size>10*1024*1024){
    setAlert('Document must be 10MB or smaller.');
    input.value='';
    return;
  }
  const dataUrl=await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(reader.error||new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
  try{
    await api('tasks/document/upload',{method:'POST',body:JSON.stringify({task_id:selectedId,file_name:file.name,data_url:dataUrl})});
    status('Document uploaded.');
    input.value='';
    await loadDocuments();
  }catch(e){
    input.value='';
    setAlert(e.message);
  }
}

function showDetailTab(tab){
  activeDetailTab=tab;
  document.querySelectorAll('.detail-tab-button').forEach(button=>{
    button.classList.toggle('active',button.dataset.detailTab===tab);
  });
  document.querySelectorAll('.detail-tab-panel').forEach(panel=>{
    panel.hidden=panel.id!==`${tab}-tab`;
  });
  if(tab==='subtasks')renderSubtasks();
  if(tab==='documents')loadDocuments().catch(e=>setAlert(e.message));
}

function selectTask(id){
  selectedId=id;
  const task=tasks.find(item=>item.task_id===id);
  if(!task){
    $('detail-panel').hidden=true;
    renderTree();
    return;
  }
  expandAncestors(id);
  $('detail-panel').hidden=false;
  $('task-id').value=task.task_id;
  $('task-name').value=task.task_name;
  $('task-description').value=task.task_description||'';
  $('task-importance').value=task.importance||'normal';
  $('task-status').value=task.status||'active';
  $('task-percent').value=Math.round(Number(task.percent_complete)||0);
  $('task-start').value=task.start_date||'';
  $('task-due').value=task.due_date||'';
  const rollup=rollupMap().get(task.task_id)||0;
  $('task-rollup').textContent=`${rollup}%`;
  $('task-rollup-bar').style.width=`${rollup}%`;
  renderParentOptions();
  showDetailTab(activeDetailTab);
  renderTree();
}

async function load(){
  setAlert('');
  try{
    const r=await api('tasks/list');
    tasks=r.tasks||[];
    statuses=r.statuses||statuses;
    importanceValues=r.importance||importanceValues;
    if(selectedId&&!tasks.some(task=>task.task_id===selectedId))selectedId=null;
    renderTree();
    renderDashboard();
    if(selectedId)selectTask(selectedId);
    else $('detail-panel').hidden=true;
    status('Ready.');
  }catch(e){
    setAlert(e.message);
  }
}

async function createTask(parentId=null){
  const name=prompt(parentId?'Child task name':'Top-level task name');
  if(!name)return;
  const r=await api('tasks/create',{method:'POST',body:JSON.stringify({parent_task_id:parentId,task_name:name})});
  if(parentId)expanded.add(parentId);
  selectedId=r.task.task_id;
  await load();
}

$('add-root').addEventListener('click',()=>createTask(null));
$('add-child').addEventListener('click',()=>selectedId&&createTask(selectedId));
$('close-detail').addEventListener('click',()=>selectTask(null));
$('tree').addEventListener('dragover',event=>{
  if(!draggedId)return;
  if(event.target.closest('.tree-row'))return;
  event.preventDefault();
  clearDropHints();
  $('tree').classList.add('drop-root');
  event.dataTransfer.dropEffect='move';
});
$('tree').addEventListener('dragleave',event=>{
  if(!$('tree').contains(event.relatedTarget))$('tree').classList.remove('drop-root');
});
$('tree').addEventListener('drop',event=>{
  if(!draggedId)return;
  if(event.target.closest('.tree-row'))return;
  event.preventDefault();
  const sourceId=event.dataTransfer.getData('text/plain')||draggedId;
  clearDropHints();
  moveTaskToRoot(sourceId);
});
$('refresh').addEventListener('click',load);
$('dashboard-refresh').addEventListener('click',load);
$('close-dashboard-filter-items').addEventListener('click',()=>{
  dashboardFilter=null;
  $('dashboard-filter-items-card').hidden=true;
  $('dashboard-filter-items').innerHTML='';
});
$('voice-action').addEventListener('click',startVoiceAction);
$('close-voice-review').addEventListener('click',closeVoiceReview);
$('cancel-voice-actions').addEventListener('click',closeVoiceReview);
$('confirm-voice-actions').addEventListener('click',confirmVoiceActions);
$('voice-review').addEventListener('click',event=>{
  if(event.target===$('voice-review'))closeVoiceReview();
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
$('task-parent').addEventListener('change',async event=>{
  if(!selectedId)return;
  await api('tasks/move',{method:'POST',body:JSON.stringify({task_id:selectedId,parent_task_id:event.target.value||null})});
  status('Task moved.');
  await load();
});
$('task-form').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!selectedId)return;
  try{
    await api('tasks/update',{method:'POST',body:JSON.stringify({
      task_id:selectedId,
      task_name:$('task-name').value,
      task_description:$('task-description').value,
      importance:$('task-importance').value,
      status:$('task-status').value,
      percent_complete:$('task-percent').value,
      start_date:$('task-start').value,
      due_date:$('task-due').value
    })});
    status('Task saved.');
    await load();
  }catch(e){setAlert(e.message)}
});
$('archive-task').addEventListener('click',async ()=>{
  if(!selectedId||!confirm('Archive this task and its children?'))return;
  await api('tasks/archive',{method:'POST',body:JSON.stringify({task_id:selectedId})});
  selectedId=null;
  status('Task archived.');
  await load();
});
$('delete-task').addEventListener('click',async ()=>{
  if(!selectedId||!confirm('Delete this task and its children?'))return;
  await api('tasks/delete',{method:'POST',body:JSON.stringify({task_id:selectedId})});
  selectedId=null;
  status('Task deleted.');
  await load();
});
$('copy-reference-categories').addEventListener('click',async ()=>{
  if(!confirm('Copy reference top-level task categories into this tenant? Existing matching categories will be skipped.'))return;
  const r=await api('setup/reference',{method:'POST',body:JSON.stringify({})});
  status(`Copied ${r.categories_created||0} reference categor${(r.categories_created||0)===1?'y':'ies'}.`);
  await load();
  showView('tasks');
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
    status('AI settings saved.');
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
    status('AI key cleared.');
  }catch(e){setAlert(e.message)}
});
document.querySelectorAll('.menu-item').forEach(button=>{
  button.addEventListener('click',()=>showView(button.dataset.view));
});
document.querySelectorAll('.detail-tab-button').forEach(button=>{
  button.addEventListener('click',()=>showDetailTab(button.dataset.detailTab));
});
$('subtask-status-filter').addEventListener('change',renderSubtasks);
$('upload-document').addEventListener('click',()=>$('document-file').click());
$('document-file').addEventListener('change',()=>uploadSelectedDocument($('document-file')));

load();
})();
