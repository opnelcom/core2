'use strict';
window.createObjectStatement=({api,context,openReport,openJournal,formatMoney,notify})=>{
 const $=id=>document.getElementById(id);
 const meta={subledger_account:{label:'Sub Ledger',endpoint:'subledger-accounts',types:'subledger-account-types/list',typeKey:'subledger_account_type_id',id:'subledger_account_id',code:'account_code',name:'account_name'},accounting_object:{label:'Accounting Object',endpoint:'accounting-objects',types:'accounting-objects/types',typeKey:'accounting_object_type_id',id:'accounting_object_id',code:'object_code',name:'object_name'},accounting_dimension:{label:'Accounting Dimension',endpoint:'accounting-dimensions',types:'accounting-dimensions/types',typeKey:'accounting_dimension_type_id',id:'accounting_dimension_id',code:'dimension_code',name:'dimension_name'}};
 let epoch=0,sequence=0,organisation=null,runQuery=null,result=null;
 const panel=document.createElement('div');panel.id='object-statement-panel';panel.hidden=true;
 panel.innerHTML=`<form id="object-statement-parameters" class="erp-field-rows organisation-setup-editor">
 <div class="erp-pill-field"><span id="statement-class-caption">Object class</span><input id="statement-class" type="hidden" value="subledger_account" /><div id="statement-class-pills" class="erp-pill-group" role="group" aria-labelledby="statement-class-caption">${Object.entries(meta).map(([kind,m])=>`<button type="button" class="secondary" data-object-class="${kind}" aria-pressed="${kind==='subledger_account'}">${m.label}</button>`).join('')}</div></div>
 <label>Object type<select id="statement-type" required></select></label>
 <label>Object<select id="statement-object" required></select></label>
 <div class="statement-date-row"><label>From date<input id="statement-from" type="date" required /></label><label>To date<input id="statement-to" type="date" required /></label></div>
 <label>GL account<select id="statement-gl"><option value="">All GL accounts</option></select></label>
 <div id="statement-child-setting"><label class="check"><input id="statement-children" type="checkbox" checked />Include child objects</label><small>All descendants, using the current hierarchy</small></div>
 <div class="actions"><button type="submit" id="statement-run">View statement</button></div></form>
 <dialog id="statement-output" class="panel statement-output" aria-labelledby="statement-output-title"><button type="button" id="statement-close" class="panel-close" aria-label="Close statement">�</button><h2 id="statement-output-title">Object Statement</h2>
 <p id="statement-status" role="status" aria-live="polite"></p><div id="statement-result" class="report-table-scroll"></div>
 <div class="actions"><button type="button" id="statement-previous" class="secondary" disabled>Previous</button><button type="button" id="statement-next" class="secondary" disabled>Next</button></div></dialog>`;
 $('report-result').before(panel);
 const classButtons=[...$('statement-class-pills').querySelectorAll('button')];
 function selectClass(kind){$('statement-class').value=kind;classButtons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.objectClass===kind)));}
 classButtons.forEach(button=>button.onclick=()=>{if(button.dataset.objectClass===$('statement-class').value)return;selectClass(button.dataset.objectClass);$('statement-class').onchange();});
 const output=$('statement-output');
 function closeOutput(){if(output.open)output.close();}
 function showOutput(){if(output.open)return;const bounds=panel.parentElement.getBoundingClientRect();output.style.left=`${Math.max(8,Math.min(bounds.left+24,window.innerWidth-320))}px`;output.style.top=`${Math.max(8,Math.min(bounds.top+24,window.innerHeight-160))}px`;output.style.width=`${Math.min(1200,window.innerWidth-parseFloat(output.style.left)-16)}px`;output.style.maxHeight=`${window.innerHeight-parseFloat(output.style.top)-16}px`;output.showModal();}
 $('statement-close').onclick=()=>{closeOutput();$('statement-run').focus();};
 function options(id,rows,key,label,blank){const select=$(id);select.replaceChildren();if(blank!==undefined)select.add(new Option(blank,''));rows.forEach(r=>select.add(new Option(label(r),r[key])));}
 function current(token){return epoch===token&&organisation===context().orgId&&!panel.hidden;}
 function clear(){closeOutput();sequence++;runQuery=null;result=null;$('statement-result').replaceChildren();$('statement-status').textContent='';$('statement-previous').disabled=true;$('statement-next').disabled=true;}
 async function records(selected){const token=++epoch,m=meta[$('statement-class').value],type=$('statement-type').value;clear();options('statement-object',[],m.id,()=>'', 'Choose an object');if(!type)return;
 const r=await api(`${m.endpoint}/list?${new URLSearchParams({organisation_id:organisation,[m.typeKey]:type})}`);if(!current(token))return;
 options('statement-object',r.records||r.subledger_accounts||[],m.id,row=>`${row[m.code]} · ${row[m.name]}`,'Choose an object');if(selected)$('statement-object').value=selected;
 }
 async function types(selectedType,selectedObject){const token=++epoch,m=meta[$('statement-class').value];clear();$('statement-child-setting').hidden=$('statement-class').value!=='accounting_object';options('statement-type',[],m.typeKey,()=>'', 'Choose a type');options('statement-object',[],m.id,()=>'', 'Choose an object');
 const r=await api(`${m.types}?organisation_id=${encodeURIComponent(organisation)}`);if(!current(token))return;
 options('statement-type',(r.types||r.subledger_account_types||[]).filter(t=>t.is_active!==false||t[m.typeKey]===selectedType),m.typeKey,t=>t.type_name,'Choose a type');if(selectedType)$('statement-type').value=selectedType;await records(selectedObject);
 }
 async function prepare(selection){panel.hidden=false;if(selection?.restore&&organisation===context().orgId&&result){render(result);showOutput();return;}organisation=context().orgId;clear();$('statement-children').checked=true;
 const today=new Date(),local=new Date(today.getTime()-today.getTimezoneOffset()*60000).toISOString().slice(0,10);if(!$('statement-to').value)$('statement-to').value=local;if(!$('statement-from').value)$('statement-from').value=local.slice(0,8)+'01';
 if(selection)selectClass(selection.kind);
 const token=++epoch;const gl=await api(`gl-accounts/list?organisation_id=${encodeURIComponent(organisation)}`);if(!current(token))return;
 options('statement-gl',gl.gl_accounts||[],'gl_account_id',r=>`${r.account_code} · ${r.account_name}`,'All GL accounts');await types(selection?.typeId,selection?.objectId);
 }
 function balance(value){return `${formatMoney(value.startsWith('-')?value.slice(1):value)} ${value.startsWith('-')?'Cr':'Dr'}`;}
 function render(r){const target=$('statement-result');target.replaceChildren();const header=document.createElement('div');header.className='record-editor-header';const title=document.createElement('h2');title.textContent=`${r.object.object_code} · ${r.object.object_name}`;header.append(title);
 const info=document.createElement('p');info.textContent=`${r.object.organisation_name} · ${r.object_class_label} / ${r.object.type_name} · ${r.currency_code} · ${r.date_from} to ${r.date_to}`;header.append(info);const scope=document.createElement('p');scope.textContent=`Posted transactions · ${r.include_child_objects?'Selected object + all descendants · Current hierarchy':'Selected object only'} · ${r.object.gl_account?`${r.object.gl_account.account_code} · ${r.object.gl_account.account_name}`:'All GL accounts'}`;header.append(scope);target.append(header);
 const table=document.createElement('table');table.className='data-grid object-statement-table';const head=table.createTHead().insertRow();const captions=['Date','Transaction / Description',...(r.include_child_objects?['Allocated object']:[]),'GL account','Debit','Credit','Balance'];captions.forEach(c=>{const th=document.createElement('th');th.scope='col';th.textContent=c;head.append(th);});const body=table.createTBody();
 function summary(label,values){const tr=body.insertRow();tr.className='statement-total';const td=tr.insertCell();td.colSpan=captions.length-values.length;td.textContent=label;values.forEach(v=>{const c=tr.insertCell();c.className='statement-amount';c.textContent=v;});}
 summary('Opening balance',[balance(r.opening_balance)]);
 r.rows.forEach(row=>{const tr=body.insertRow();tr.insertCell().textContent=String(row.journal_date).slice(0,10);const cell=tr.insertCell();const link=document.createElement('button');link.type='button';link.className='statement-journal-link';link.textContent=row.journal_number||row.journal_id;link.onclick=async()=>{try{const org=organisation;await openJournal(row);if(org===context().orgId&&result)back.hidden=false;}catch(e){notify(e.message);}};cell.append(link,document.createElement('br'),document.createTextNode(row.description||row.journal_description||''));if(r.include_child_objects)tr.insertCell().textContent=row.allocated_objects||'';tr.insertCell().textContent=`${row.gl_account_code} · ${row.gl_account_name}`;[formatMoney(row.debit_amount),formatMoney(row.credit_amount),balance(String(row.running_balance))].forEach(v=>{const c=tr.insertCell();c.className='statement-amount';c.textContent=v;});});
 summary('Period totals / Closing balance',[formatMoney(r.period_debit),formatMoney(r.period_credit),balance(r.closing_balance)]);target.append(table);
 $('statement-status').className=r.restricted?'report-warning':'';$('statement-status').textContent=`${r.restricted?'Partial statement: permissions exclude objects or transactions. Balances cover visible transactions only. ':''}${r.total_count} posted journal lines. ${r.rows.length?`Showing ${r.offset+1}–${r.offset+r.rows.length}.`: 'No movements in this period.'} Debit less credit; opening includes all earlier dates.`;
 $('statement-previous').disabled=r.offset===0;$('statement-next').disabled=r.next_offset===null;
 }
 async function run(offset=0,reuse=false){const token=++sequence,org=organisation;if(!reuse){runQuery=new URLSearchParams({organisation_id:org,object_class:$('statement-class').value,object_type_id:$('statement-type').value,object_id:$('statement-object').value,date_from:$('statement-from').value,date_to:$('statement-to').value,include_child_objects:$('statement-children').checked?'1':'0'});if($('statement-gl').value)runQuery.set('gl_account_id',$('statement-gl').value);}
 if(!runQuery)return;const params=new URLSearchParams(runQuery);params.set('offset',String(offset));$('statement-status').textContent='Loading statement…';
 showOutput();
 try{const r=await api(`reports/object-statement?${params}`);if(token!==sequence||org!==context().orgId||panel.hidden)return;result=r;render(r);}
 catch(error){if(token!==sequence||org!==context().orgId||panel.hidden)return;clear();$('statement-status').textContent=error.message;showOutput();}
 }
 $('object-statement-parameters').onsubmit=e=>{e.preventDefault();run();};$('statement-class').onchange=()=>{$('statement-children').checked=true;types().catch(e=>notify(e.message));};$('statement-type').onchange=()=>records().catch(e=>notify(e.message));['statement-object','statement-from','statement-to','statement-gl','statement-children'].forEach(id=>$(id).onchange=clear);
 $('statement-previous').onclick=()=>run(Math.max(0,result.offset-100),true).catch(e=>notify(e.message));$('statement-next').onclick=()=>run(result.next_offset,true).catch(e=>notify(e.message));
 const back=document.createElement('button');back.type='button';back.className='secondary';back.textContent='Back to Object Statement';back.hidden=true;back.onclick=()=>{back.hidden=true;openReport('object_statement',{restore:true}).catch(e=>notify(e.message));};$('journal-form').querySelector('.actions').prepend(back);
 for(const [prefix,kind] of [['account','subledger_account'],['accounting-object','accounting_object'],['accounting-dimension','accounting_dimension']]){const button=document.createElement('button');button.id=`${prefix}-statement`;button.type='button';button.className='secondary';button.textContent='Statement';button.hidden=true;button.onclick=async()=>{try{const objectId=$(`${prefix}-id`).value;const typeId=prefix==='account'?button.dataset.typeId:$(`${prefix}-type`).value;if(objectId)await openReport('object_statement',{kind,typeId,objectId});}catch(e){notify(e.message);}};$(`${prefix}-form`).querySelector('.actions').prepend(button);}
 return {prepare,hide(){closeOutput();epoch++;sequence++;panel.hidden=true;back.hidden=true;},reset(){epoch++;sequence++;organisation=null;clear();panel.hidden=true;back.hidden=true;$('statement-from').value='';$('statement-to').value='';},editor(prefix,saved,typeId){const button=$(`${prefix}-statement`);button.hidden=!saved;button.dataset.typeId=typeId||'';}};
};
