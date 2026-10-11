'use strict';
window.ObjectSphereCatalogue=(()=>{
 const make=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
 async function api(path,body){const r=await fetch('/objectsphere/api/import/catalogue/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error||'Import failed');return data;}
 async function open(context){
  if(!context.parentId)throw new Error('Select a destination object first');
  const backdrop=make('div',undefined,'import-review'),panel=make('section',undefined,'import-review-panel');
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','catalogue-import-title');
  const title=make('h2','Import catalogue');title.id='catalogue-import-title';
  const destination=make('p',`Destination: ${context.parentName}`,'import-parent');
  const hint=make('p','Choose an objectsphere-catalogue JSON file. Existing source keys are skipped; conflicting records are never overwritten.');
  const input=make('input');input.type='file';input.accept='.json,application/json';input.setAttribute('aria-label','Catalogue JSON file');
  const message=make('p');message.setAttribute('role','status');
  const list=make('div',undefined,'import-review-list');
  list.style.maxHeight='45vh';list.style.overflow='auto';list.style.overflowWrap='anywhere';
  const actions=make('div',undefined,'form-actions import-review-actions'),confirm=make('button','Import selected'),cancel=make('button','Cancel','secondary-action');
  confirm.type=cancel.type='button';confirm.disabled=true;
  const sample=make('a','Download example JSON','secondary-action');sample.href='/objectsphere/catalogue-example.json';sample.download='catalogue-example.json';
  actions.append(confirm,cancel);panel.append(title,destination,hint,sample,input,message,list,actions);backdrop.append(panel);document.body.append(backdrop);
  let catalogue=null,checks=[],busy=false;
  const close=()=>{if(!busy){backdrop.remove();context.returnFocus?.focus();}};
  cancel.addEventListener('click',close);
  backdrop.addEventListener('keydown',event=>{
   if(event.key==='Escape'){event.preventDefault();close();}
   if(event.key==='Tab'){
    const focusable=[...panel.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href],summary')];
    const first=focusable[0],last=focusable.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
   }
  });
  const selection=()=>checks.filter(({check})=>check.checked).map(({key})=>key);
  const refresh=()=>{confirm.disabled=busy||!selection().length;confirm.textContent=`Import selected (${selection().length})`;};
  input.addEventListener('change',async()=>{
   catalogue=null;checks=[];list.replaceChildren();confirm.disabled=true;
   const file=input.files[0];if(!file)return;
   if(file.size>800000){message.textContent='File is too large. Split into files smaller than 800 KB, keeping the same source and unique keys.';return;}
   try{
    busy=true;input.disabled=cancel.disabled=true;message.textContent='Validating catalogue...';
    const data=JSON.parse(await file.text());
    const preview=await api('preview',{parent_item_id:context.parentId,catalogue:data});
    catalogue=data;
    const counts={create:0,skip:0,conflict:0};preview.objects.forEach(o=>counts[o.action]++);
    destination.textContent=`Destination: ${context.parentName}; source: ${preview.source}`;
    message.textContent=`${counts.create} new, ${counts.skip} already imported, ${counts.conflict} conflicts. Review the fields before importing.`;
    for(const row of preview.objects){
     const item=make('div',undefined,'import-row'),check=make('input');check.type='checkbox';check.setAttribute('aria-label',`Import ${row.source_key}: ${row.name}`);check.disabled=row.action!=='create';check.checked=row.action==='create'&&!row.warning;
     const body=make('div',undefined,'import-row-body'),label=make('strong',`${row.source_key}: ${row.name}`),summary=make('p',`${row.type}; quantity ${row.quantity}; ${row.action}`);
     const detail=make('details'),toggle=make('summary','View description and characteristics'),description=make('p',row.description);description.style.whiteSpace='pre-wrap';
     detail.append(toggle,description);
     for(const [name,value] of Object.entries(row.attributes))detail.append(make('p',`${name}: ${value}`));
     body.append(label,summary,detail);if(row.warning)body.append(make('p',row.warning,'import-warnings'));
     if(row.action==='conflict')body.append(make('p','This source key was imported with different data. Correct the file or edit the existing object; importing will not overwrite it.','import-warnings'));
     item.append(check,body);list.append(item);checks.push({check,key:row.source_key});check.addEventListener('change',refresh);
    }
   }catch(e){message.textContent=e.message;}
   finally{busy=false;input.disabled=cancel.disabled=false;refresh();}
  });
  confirm.addEventListener('click',async()=>{
   const keys=selection();if(!catalogue||!keys.length||busy)return;
   try{
    busy=true;input.disabled=cancel.disabled=true;checks.forEach(({check})=>check.disabled=true);refresh();message.textContent='Importing selected objects...';
    const result=await api('confirm',{parent_item_id:context.parentId,catalogue,source_keys:keys});
    catalogue=null;checks=[];list.replaceChildren();message.textContent=`Imported ${result.created.length} objects; skipped ${result.skipped} source keys already recorded. No existing records were overwritten.`;
    cancel.textContent='Close';await context.onImported();
   }catch(e){message.textContent=`${e.message}. Reload this file to preview before retrying.`;catalogue=null;checks=[];}
   finally{busy=false;input.disabled=cancel.disabled=false;refresh();}
  });
  input.focus();
 }
 return {open};
})();
