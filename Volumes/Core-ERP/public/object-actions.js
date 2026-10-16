(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.erpObjectActions=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function accepts(definition,kind,object){
    if(kind==='subledger_account')return definition.subledger_requirement!=='not_used'&&definition.subledger_account_type_id===object.object_type_id;
    if(kind!=='accounting_object')return false;
    return (definition.object_requirements||[]).some(r=>r.accounting_object_type_id===object.object_type_id&&(r.value_behaviour!=='fixed'||r.accounting_object_id===object.object_id));
  }
  function prepareLines({definitions,lines,kind,object,definitionId,createLine}){
    const definition=definitions.find(d=>d.transaction_line_definition_id===definitionId);
    if(!definition||!accepts(definition,kind,object))throw new Error('The chosen line no longer accepts this object. Reopen Actions.');
    const result=lines.map(line=>({...line,accounting_objects:(line.accounting_objects||[]).map(a=>({...a})),accounting_dimensions:(line.accounting_dimensions||[]).map(a=>({...a}))}));
    let selected=result.find(l=>l.transaction_line_definition_id===definitionId);
    if(!selected){selected=createLine(definition);result.push(selected);}
    if(kind==='subledger_account')selected.subledger_account_id=object.object_id;
    else{
      selected.accounting_objects=(selected.accounting_objects||[]).filter(a=>a.accounting_object_type_id!==object.object_type_id);
      selected.accounting_objects.push({accounting_object_type_id:object.object_type_id,accounting_object_id:object.object_id});
    }
    const order=new Map(definitions.map(d=>[d.transaction_line_definition_id,Number(d.line_order)]));
    return result.sort((a,b)=>(order.get(a.transaction_line_definition_id)||0)-(order.get(b.transaction_line_definition_id)||0));
  }
  function create({api,context,openStatement,openTransaction,notify,beforeOpen=()=>{},iconMarkup=()=>''}){
    let epoch=0,active=null,choosePending=null;
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(()=>position());
    const editorButtons=new Map();
    const dialog=document.createElement('dialog');
    dialog.className='object-action-dialog';
    dialog.setAttribute('aria-labelledby','object-action-line-title');
    dialog.innerHTML='<form method="dialog"><button type="button" class="panel-close object-action-close" aria-label="Close transaction line selection">&times;</button><h2 id="object-action-line-title">Choose transaction line</h2><p class="object-action-line-context"></p><p>This transaction has more than one line that accepts this object. Choose where to prefill it.</p><div class="object-action-line-choices"></div><div class="actions"><button type="submit" class="object-action-continue" disabled>Open transaction</button></div></form>';
    document.body.append(dialog);
    function finishChoice(value){const pending=choosePending;choosePending=null;if(dialog.open)dialog.close();pending?.(value);}
    dialog.querySelector('.object-action-close').onclick=()=>finishChoice(null);
    dialog.addEventListener('cancel',event=>{event.preventDefault();finishChoice(null);});
    dialog.querySelector('form').onsubmit=event=>{event.preventDefault();finishChoice(dialog.querySelector('input:checked')?.value||null);};
    function closeMenu(restoreFocus=false){
      if(!active)return;
      const {button,menu}=active;active=null;observer?.unobserve(menu);
      if(menu.matches(':popover-open'))menu.hidePopover();
      menu.remove();button.setAttribute('aria-expanded','false');
      if(restoreFocus&&button.isConnected)button.focus();
    }
    function close({restoreFocus=false}={}){epoch++;closeMenu(restoreFocus);finishChoice(null);}
    function position(){
      if(!active)return;
      const {button,menu}=active;
      if(!button.isConnected||!button.getClientRects().length){close();return;}
      const edge=8,gap=6,rect=button.getBoundingClientRect(),width=document.documentElement.clientWidth,height=document.documentElement.clientHeight;
      const menuWidth=Math.min(340,Math.max(0,width-edge*2));
      menu.style.width=menuWidth+'px';
      const below=Math.max(0,height-rect.bottom-gap-edge),above=Math.max(0,rect.top-gap-edge);
      const useAbove=menu.scrollHeight>below&&above>below;
      menu.style.maxHeight=(useAbove?above:below)+'px';
      const bounds=menu.getBoundingClientRect();
      menu.style.left=Math.max(edge,Math.min(rect.right-bounds.width,width-bounds.width-edge))+'px';
      menu.style.top=Math.max(edge,useAbove?rect.top-gap-bounds.height:rect.bottom+gap)+'px';
    }
    function chooseLine(transaction,object){
      if(transaction.lines.length===1)return Promise.resolve(transaction.lines[0].transaction_line_definition_id);
      dialog.querySelector('.object-action-line-context').textContent=`${transaction.type_name} · ${object.object_code} / ${object.object_name}`;
      const choices=dialog.querySelector('.object-action-line-choices');choices.replaceChildren();
      dialog.querySelector('.object-action-continue').disabled=true;
      for(const line of transaction.lines){
        const label=document.createElement('label');label.className='object-action-line-choice';
        const input=document.createElement('input');input.type='radio';input.name='object-action-line';input.value=line.transaction_line_definition_id;
        const description=document.createElement('span');description.textContent=line.line_description||line.line_code;
        const detail=document.createElement('small');detail.textContent=`${line.debit_credit==='debit'?'Debit':'Credit'} · ${line.account_code} · ${line.account_name}`;
        description.append(document.createElement('br'),detail);label.append(input,description);choices.append(label);
        input.onchange=()=>{dialog.querySelector('.object-action-continue').disabled=false;};
      }
      dialog.showModal();return new Promise(resolve=>{choosePending=resolve;});
    }
    function params(selection){
      const q=new URLSearchParams({organisation_id:context().orgId,object_kind:selection.kind,object_id:selection.objectId});
      if(context().divisionId)q.set('source_division_id',context().divisionId);
      return q;
    }
    async function launch(selection,transaction,data){
      const token=epoch,org=context().orgId,division=context().divisionId;
      closeMenu();
      const definitionId=await chooseLine(transaction,data.object);
      if(!definitionId||token!==epoch||org!==context().orgId||division!==context().divisionId)return;
      const q=params(selection);q.set('source_division_id',data.source_division_id);q.set('transaction_type_id',transaction.transaction_type_id);q.set('transaction_line_definition_id',definitionId);
      const checked=await api(`object-actions/list?${q}`);
      if(token!==epoch||org!==context().orgId||division!==context().divisionId)return;
      await openTransaction({kind:selection.kind,object:checked.object,transaction:checked.transactions[0],definitionId,sourceDivisionId:checked.source_division_id,organisationId:org,workspaceDivisionId:division});
    }
    function menuItem(label,action,description,iconKind='transaction'){
      const button=document.createElement('button');button.type='button';button.className='object-action-menu-item';
      const icon=document.createElement('template');icon.innerHTML=iconMarkup(iconKind);
      const text=document.createElement('span');text.className='object-action-menu-label';text.textContent=label;
      button.append(icon.content,text);
      if(description)button.title=description;
      button.onclick=event=>{event.stopPropagation();Promise.resolve().then(action).catch(error=>notify(error.message));};
      return button;
    }
    function group(menu,label){
      const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent=label;
      details.append(summary);details.ontoggle=position;menu.append(details);return details;
    }
    async function show(button,selection){
      if(active?.button===button){close();return;}
      close();beforeOpen();const token=epoch,org=context().orgId,division=context().divisionId;
      const menu=document.createElement('div');menu.className='object-action-menu';menu.setAttribute('popover','auto');menu.setAttribute('aria-label',`Actions for ${selection.code||'selected object'}`);
      const title=document.createElement('div');title.className='object-action-menu-context';title.textContent=`${selection.code||''} · ${selection.name||''}`;menu.append(title);
      const reports=group(menu,'Reports');reports.append(menuItem('Statement',async()=>{close();await openStatement({kind:selection.kind,typeId:selection.typeId,objectId:selection.objectId});},null,'report'));
      const transactions=group(menu,'Transactions');const loading=document.createElement('p');loading.className='object-action-menu-empty';loading.textContent='Loading transactions…';transactions.append(loading);
      document.body.append(menu);active={button,menu};button.setAttribute('aria-expanded','true');menu.showPopover();position();observer?.observe(menu);
      menu.addEventListener('toggle',event=>{if(event.newState==='closed'&&active?.menu===menu)close();});
      try{
        const data=await api(`object-actions/list?${params(selection)}`);
        if(token!==epoch||org!==context().orgId||division!==context().divisionId||active?.menu!==menu)return;
        title.textContent=`${data.object.object_code} · ${data.object.object_name}`;loading.remove();
        for(const transaction of data.transactions)transactions.append(menuItem(transaction.type_name,()=>launch(selection,transaction,data),transaction.type_description));
        if(!data.transactions.length){loading.textContent=data.transaction_message||'No permitted transaction types accept this object.';transactions.append(loading);}
        position();
      }catch(error){if(token===epoch&&active?.menu===menu){loading.textContent=error.message;position();}}
    }
    function button(selection){
      const button=document.createElement('button');button.type='button';button.className='secondary object-action-button';button.textContent='Actions ▾';button.setAttribute('aria-expanded','false');button.setAttribute('aria-haspopup','true');
      button.setAttribute('aria-label',`Actions for ${selection.code||'selected object'} ${selection.name||''}`);
      button.onclick=event=>{event.stopPropagation();show(button,selection).catch(error=>notify(error.message));};return button;
    }
    function editor(prefix,selection){
      if(!['account','accounting-object'].includes(prefix))return;
      const form=document.getElementById(`${prefix}-form`),header=form.querySelector('.record-editor-header');if(!header)return;
      let existing=editorButtons.get(prefix);
      if(existing){if(active?.button===existing)close();existing.remove();}
      header.classList.toggle('record-editor-header--actions',!!selection?.objectId);
      if(selection?.objectId){existing=button(selection);existing.classList.add('object-record-action-button');form.append(existing);editorButtons.set(prefix,existing);}else editorButtons.delete(prefix);
      const statement=document.getElementById(`${prefix}-statement`);if(statement)statement.hidden=true;
    }
    document.addEventListener('scroll',event=>{if(active&&!active.menu.contains(event.target))close();},true);
    window.addEventListener('resize',()=>close());
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&active){event.preventDefault();close({restoreFocus:true});}});
    if(typeof MutationObserver!=='undefined')new MutationObserver(()=>{if(active&&!active.button.isConnected)close();}).observe(document.body,{childList:true,subtree:true});
    return {button,editor,close,reset:close};
  }
  return {create,accepts,prepareLines};
});
