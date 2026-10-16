/* Administrator-defined reports: shared designer and runner UI. */
window.createReportBuilder = ({api, context, table, notify, saved, fillModuleSelect = () => {}, selectedModuleIds = () => [], syncRequiredMarkers = () => {}}) => {
  const $ = id => document.getElementById(id);
  let datasets = [], definitions = [], reports = [], editing = null, selected = null;
  let epoch = 0, result = null, runBody = null, offset = 0;
  const safe = fn => async (...args) => { try { await fn(...args); } catch (e) { notify(e.message); } };
  function input(type='text',value='') { const el=document.createElement('input');el.type=type;el.value=value;return el; }
  function select(items,value=''){const el=document.createElement('select');for(const [key,label] of items){const o=document.createElement('option');o.value=key;o.textContent=label;el.append(o);}el.value=value;return el;}
  function label(text,el){const l=document.createElement('label');l.append(document.createTextNode(text),el);return l;}
  function button(text,fn){const b=document.createElement('button');b.type='button';b.textContent=text;b.addEventListener('click',safe(fn));return b;}
  function currentDataset(){return datasets.find(d=>d.key===$('report-design-dataset').value);}
  function fieldOptions(){return (currentDataset()?.fields||[]).map(f=>[f.key,`${f.label} (${f.type})`]);}
  function fieldType(key){return currentDataset()?.fields.find(f=>f.key===key)?.type||'text';}
  function parameterType(type){return ['date','date_time','integer','boolean'].includes(type)?type:['decimal','currency','number'].includes(type)?'decimal':'text';}
  function removeRow(row){row.append(button('Remove',()=>row.remove()));}
  function columnRow(c={}){
    const row=document.createElement('tr');row.className='report-column-row';
    const choice=select(fieldOptions(),c.field||currentDataset()?.fields[0]?.key);choice.className='rd-field';choice.setAttribute('aria-label','Field');
    const heading=input('text',c.label||'');heading.placeholder='Use field label';heading.maxLength=120;heading.className='rd-label';heading.setAttribute('aria-label','Column heading');
    const fieldCell=document.createElement('td'),headingCell=document.createElement('td'),actionsCell=document.createElement('td');
    const actions=document.createElement('div');actions.className='report-column-actions';
    const refresh=()=>[...$('report-design-columns').children].forEach((r,i,rows)=>{r.querySelector('[data-move="up"]').disabled=i===0;r.querySelector('[data-move="down"]').disabled=i===rows.length-1;});
    const up=button('Up',()=>{if(row.previousElementSibling)row.parentElement.insertBefore(row,row.previousElementSibling);refresh();});up.dataset.move='up';
    const down=button('Down',()=>{if(row.nextElementSibling)row.parentElement.insertBefore(row.nextElementSibling,row);refresh();});down.dataset.move='down';
    actions.append(up,down,button('Remove',()=>{row.remove();refresh();}));fieldCell.append(choice);headingCell.append(heading);actionsCell.append(actions);row.append(fieldCell,headingCell,actionsCell);$('report-design-columns').append(row);refresh();
  }
  const operators=[['eq','Equals'],['ne','Does not equal'],['gte','On or after / at least'],['lte','On or before / at most'],['gt','Greater than'],['lt','Less than'],['contains','Contains'],['is_blank','Is blank'],['not_blank','Is not blank']];
  function gridCell(row,caption,control){const cell=document.createElement('td');control.setAttribute('aria-label',caption);cell.append(control);row.append(cell);return cell;}
  function filterRow(f={},parameters=[]){
    const row=document.createElement('tr');row.className='report-filter-row';
    const field=select(fieldOptions(),f.field||currentDataset()?.fields[0]?.key);field.className='rd-field';
    const op=select(operators,f.operator||'eq');op.className='rd-operator';
    const mode=select([['fixed','Fixed condition'],['parameter','User parameter']],f.parameter?'parameter':'fixed');mode.className='rd-mode';
    const value=input('text',f.value===undefined?'':String(f.value));value.className='rd-value';
    const p=parameters.find(p=>p.key===f.parameter);
    const key=input('text',p?.key||'');key.className='rd-key';key.placeholder='dateFrom';
    const caption=input('text',p?.label||'');caption.className='rd-caption';caption.placeholder='From date';
    const required=input('checkbox');required.checked=p?.required!==false;required.className='rd-required';
    [[field,'Field'],[op,'Condition'],[mode,'Input'],[value,'Fixed value'],[key,'Parameter key'],[caption,'Parameter label'],[required,'Required']].forEach(([control,name])=>gridCell(row,name,control));
    gridCell(row,'Remove condition',button('Remove',()=>row.remove()));
    function sync(){const blank=['is_blank','not_blank'].includes(op.value),param=mode.value==='parameter';mode.disabled=blank;value.disabled=blank||param;[key,caption,required].forEach(el=>el.disabled=blank||!param);value.placeholder=fieldType(field.value)==='boolean'?'true or false':fieldType(field.value)==='date'?'YYYY-MM-DD':'Filter value';}
    [field,op,mode].forEach(el=>el.addEventListener('change',sync));$('report-design-filters').append(row);sync();
  }
  function sortRow(s={}){
    const row=document.createElement('tr');row.className='report-sort-row';const field=select(fieldOptions(),s.field||currentDataset()?.fields[0]?.key);field.className='rd-field';const direction=select([['asc','Ascending'],['desc','Descending']],s.direction||'asc');direction.className='rd-direction';
    gridCell(row,'Field',field);gridCell(row,'Direction',direction);
    const actions=document.createElement('div');actions.className='report-column-actions';actions.append(button('Up',()=>{if(row.previousElementSibling)row.parentElement.insertBefore(row,row.previousElementSibling);}),button('Down',()=>{if(row.nextElementSibling)row.parentElement.insertBefore(row.nextElementSibling,row);}),button('Remove',()=>row.remove()));gridCell(row,'Sort actions',actions);$('report-design-sort').append(row);
  }
  let previousFocus=null;
  const tabs=[...document.querySelectorAll('[data-report-tab]')];
  function showTab(key){tabs.forEach(t=>{const active=t.dataset.reportTab===key;t.classList.toggle('active',active);t.setAttribute('aria-selected',String(active));t.tabIndex=active?0:-1;});document.querySelectorAll('[data-report-panel]').forEach(p=>p.hidden=p.dataset.reportPanel!==key);}
  function closeEditor(){ $('report-definition-form').hidden=true;previousFocus?.focus(); }
  tabs.forEach((tab,i)=>{tab.addEventListener('click',()=>showTab(tab.dataset.reportTab));tab.addEventListener('keydown',e=>{let index;if(e.key==='ArrowRight')index=(i+1)%tabs.length;else if(e.key==='ArrowLeft')index=(i+tabs.length-1)%tabs.length;else if(e.key==='Home')index=0;else if(e.key==='End')index=tabs.length-1;else return;e.preventDefault();showTab(tabs[index].dataset.reportTab);tabs[index].focus();});});
  $('close-report-definition').addEventListener('click',closeEditor);
  $('report-definition-form').addEventListener('invalid',e=>{const panel=e.target.closest('[data-report-panel]');if(panel)showTab(panel.dataset.reportPanel);},true);
  $('report-definition-form').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeEditor();}});
  function edit(row=null){previousFocus=document.activeElement;editing=row;fillModuleSelect('report-design-modules',row?.module_ids||[]);showTab('details');$('report-definition-title').textContent=row?'Edit report definition':'New report definition';$('report-definition-form').hidden=false;$('report-design-code').value=row?.report_code||'';$('report-design-name').value=row?.report_name||'';$('report-design-description').value=row?.description||'';$('report-design-active').checked=row?.is_active!==false;
    const def=row?.definition_json||{};$('report-design-dataset').replaceChildren(...datasets.map(d=>{const o=document.createElement('option');o.value=d.key;o.textContent=d.label;return o;}));
    if(def.dataset&&!datasets.some(d=>d.key===def.dataset)){const o=document.createElement('option');o.value=def.dataset;o.textContent='Unavailable dataset — select a replacement';$('report-design-dataset').append(o);}
    $('report-design-dataset').value=def.dataset||datasets[0]?.key||'';
    ['columns','filters','sort'].forEach(k=>$(`report-design-${k}`).replaceChildren());
    (def.columns||[]).forEach(columnRow);(def.filters||[]).forEach(f=>filterRow(f,def.parameters||[]));(def.sort||[]).forEach(sortRow);
    if(!row&&currentDataset())columnRow();
    $('report-design-code').focus();
  }
  function collect(){
    const parameters=[],filters=[];
    for(const row of $('report-design-filters').children){const f={field:row.querySelector('.rd-field').value,operator:row.querySelector('.rd-operator').value};if(!['is_blank','not_blank'].includes(f.operator)){if(row.querySelector('.rd-mode').value==='parameter'){const key=row.querySelector('.rd-key').value.trim();f.parameter=key;parameters.push({key,label:row.querySelector('.rd-caption').value.trim(),type:parameterType(fieldType(f.field)),required:row.querySelector('.rd-required').checked});}else f.value=row.querySelector('.rd-value').value;}filters.push(f);}
    return {dataset:$('report-design-dataset').value,columns:[...$('report-design-columns').children].map(row=>{const c={field:row.querySelector('.rd-field').value},v=row.querySelector('.rd-label').value.trim();if(v)c.label=v;return c;}),parameters,filters,sort:[...$('report-design-sort').children].map(row=>({field:row.querySelector('.rd-field').value,direction:row.querySelector('.rd-direction').value}))};
  }
  function renderDefinitions(){
    const term=$('report-definition-search').value.trim().toLowerCase();
    const sourceName=r=>datasets.find(d=>d.key===r.definition_json.dataset)?.label||r.definition_json.dataset;
    const rows=definitions.filter(r=>[r.report_code,r.report_name,r.description,sourceName(r),r.is_active?'active':'inactive'].some(v=>String(v||'').toLowerCase().includes(term)));
    table($('report-definition-list'),[['Code',r=>r.report_code],['Name',r=>r.report_name],['Row source',sourceName],['Active',r=>r.is_active?'Yes':'No']],rows,edit);
  }
  $('report-definition-search').addEventListener('input',renderDefinitions);
  async function setup(){const token=epoch,c=context();const [cat,list]=await Promise.all([api(`report-definitions/catalogue?organisation_id=${c.orgId}`),api(`report-definitions/list?organisation_id=${c.orgId}&setup=1`)]);if(token!==epoch)return;
    datasets=cat.datasets;definitions=list.reports;closeEditor();
    $('report-definitions-status').textContent=list.schema_required?'Run Initialise Schema before creating reports.':'';
    renderDefinitions();
  }
  async function runner(reportId=null){const c=context(),token=epoch;$('custom-report-result').replaceChildren();result=null;runBody=null;selected=null;$('custom-report-parameters').replaceChildren();$('custom-report-export').disabled=true;
    if(!c.orgId||!c.divisionId){$('custom-report-status').textContent='Select an organisation and division.';$('custom-report-choice').replaceChildren();return;}
    const list=await api(`report-definitions/list?organisation_id=${c.orgId}&division_id=${c.divisionId}`);if(token!==epoch)return;reports=list.reports;
    $('custom-report-choice').replaceChildren(...reports.map(r=>{const o=document.createElement('option');o.value=r.report_id;o.textContent=r.report_name;return o;}));
    if(reportId&&reports.some(r=>r.report_id===reportId))$('custom-report-choice').value=reportId;
    $('custom-report-run').disabled=!reports.length;$('custom-report-status').textContent=reports.length?'':list.schema_required?'Run Initialise Schema to enable saved reports.':'No reports are granted for this division.';choose();
  }
  function choose(){epoch++;selected=reports.find(r=>r.report_id===$('custom-report-choice').value)||null;result=null;runBody=null;$('custom-report-result').replaceChildren();$('custom-report-export').disabled=true;$('custom-report-next').disabled=$('custom-report-previous').disabled=true;$('custom-report-parameters').replaceChildren();$('custom-report-description').textContent=selected?.description||'';
    for(const p of selected?.parameters||[]){let el=p.type==='boolean'?select([['','None'],['true','Yes'],['false','No']]):input(p.type==='date'?'date':p.type==='date_time'?'datetime-local':'text');el.dataset.parameter=p.key;el.required=!!p.required;if(['decimal','integer'].includes(p.type))el.inputMode='decimal';$('custom-report-parameters').append(label(p.label,el));}
  }
  function capture(){const c=context();if(!selected)throw Error('Choose a report');return {organisation_id:c.orgId,division_id:c.divisionId,report_id:selected.report_id,include_child_divisions:!!c.includeChildren,parameters:Object.fromEntries([...$('custom-report-parameters').querySelectorAll('[data-parameter]')].map(el=>[el.dataset.parameter,el.value]))};}
  async function run(nextOffset=0,reuseBody=false){const token=epoch,body=reuseBody?runBody:capture();if(!body)return;const r=await api('reports/run',{method:'POST',body:JSON.stringify({...body,offset:nextOffset})});if(token!==epoch||selected?.report_id!==body.report_id)return;result=r;runBody=body;offset=nextOffset;
    table($('custom-report-result'),r.columns.map(c=>[c.label,row=>row[c.key]===null?'':String(row[c.key]??'')]),r.rows);
    $('custom-report-status').textContent=`${r.rows.length?offset+1:0}–${offset+r.rows.length} rows. Run at ${new Date(r.run_at).toLocaleString()}. ${r.permitted_division_count} permitted division(s).`;
    $('custom-report-previous').disabled=offset===0;$('custom-report-next').disabled=r.next_offset===null;$('custom-report-export').disabled=false;
  }
  async function exportFile(){if(!runBody)return;const token=epoch,r=await api('reports/run',{method:'POST',body:JSON.stringify({...runBody,export:'xlsx'})});if(token!==epoch)return;const bytes=Uint8Array.from(atob(r.data_base64),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:r.content_type}));const a=document.createElement('a');a.href=url;a.download=r.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('custom-report-status').textContent=`Exported ${r.row_count} rows from a new live run at ${new Date(r.run_at).toLocaleString()}.`;}
  window.erpSetupDeletion.install({form:$('report-definition-form'),kind:'report',label:'Report definition',api,context,notify,
    getRecord:()=>({id:editing?.report_id,name:editing?.report_name}),close:closeEditor,
    afterDelete:async()=>{editing=null;await saved();await setup();},
  });
  $('new-report-definition').addEventListener('click',()=>edit());
  $('report-design-dataset').addEventListener('change',()=>{['columns','filters','sort'].forEach(k=>$(`report-design-${k}`).replaceChildren());columnRow();});
  $('report-add-column').addEventListener('click',()=>columnRow());$('report-add-filter').addEventListener('click',()=>filterRow());$('report-add-sort').addEventListener('click',()=>sortRow());
  $('report-definition-form').addEventListener('submit',safe(async e=>{e.preventDefault();const token=epoch,c=context();await api('report-definitions/save',{method:'POST',body:JSON.stringify({organisation_id:c.orgId,report_id:editing?.report_id||null,definition_version:editing?.definition_version,report_code:$('report-design-code').value.trim(),report_name:$('report-design-name').value.trim(),description:$('report-design-description').value,module_ids:selectedModuleIds('report-design-modules'),is_active:$('report-design-active').checked,definition_json:collect()})});if(token!==epoch)return;await saved();await setup();}));
  $('custom-report-choice').addEventListener('change',choose);$('custom-report-form').addEventListener('submit',safe(async e=>{e.preventDefault();await run();}));
  $('custom-report-next').addEventListener('click',safe(()=>run(result?.next_offset,true)));$('custom-report-previous').addEventListener('click',safe(()=>run(Math.max(0,offset-100),true)));$('custom-report-export').addEventListener('click',safe(exportFile));
  function reset(){epoch++;datasets=[];definitions=[];reports=[];editing=selected=result=runBody=null;$('custom-report-result').replaceChildren();$('custom-report-parameters').replaceChildren();$('custom-report-choice').replaceChildren();$('custom-report-description').textContent='';$('custom-report-status').textContent='';$('custom-report-export').disabled=true;$('custom-report-next').disabled=$('custom-report-previous').disabled=true;$('report-definition-list').replaceChildren();$('report-definition-search').value='';closeEditor();}
  return {setup,runner,reset};
};
