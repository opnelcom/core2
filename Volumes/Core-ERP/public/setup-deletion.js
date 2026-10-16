(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.erpSetupDeletion=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function confirmation(label,name){
   return `Permanently delete ${label}${name ? ' "'+name+'"' : ''}?\n\nThis destroys the saved entry and its owned configuration, including any owned detail rows or exchange-rate change history. This data loss cannot be undone. Records referenced elsewhere cannot be deleted.\n\nContinue with permanent deletion?`;
 }
 function install({form,kind,label,getRecord,context,api,afterDelete,close,notify,existingButton,actionContainer}){
   if(!form||form.querySelector('[data-setup-delete]'))return;
   const button=document.createElement('button');
   button.type='button';button.className='secondary danger';button.textContent='Delete';
   button.dataset.setupDelete=kind;button.id=existingButton?.id||`delete-setup-${kind}`;
   button.setAttribute('aria-label',`Permanently delete ${label}`);
   if(existingButton)existingButton.replaceWith(button);
   else (actionContainer || form.querySelector(':scope > .actions') || form.querySelector('.actions')).prepend(button);
   let pending=false;
   function refresh(){
     const record=getRecord();const hidden=!record?.id;
     if(button.hidden!==hidden)button.hidden=hidden;
     button.disabled=pending;
   }
   button.addEventListener('click',async()=>{
     const record=getRecord(),orgId=context().orgId;
     if(pending||!record?.id||!orgId)return;
     if(!window.confirm(confirmation(label,record.name||record.id)))return;
     pending=true;refresh();
     try{
       await api('setup/delete-entry',{method:'POST',body:JSON.stringify({organisation_id:orgId,kind,id:record.id,confirm_permanent_delete:true})});
       if(context().orgId!==orgId)return;
       close?.();await afterDelete();
     }catch(error){notify(error.message);}finally{pending=false;refresh();}
   });
   const observer=new MutationObserver(refresh);
   observer.observe(form,{attributes:true,attributeFilter:['hidden']});
   document.addEventListener('click',()=>queueMicrotask(refresh));
   document.addEventListener('focusin',refresh);
   refresh();
   return {refresh};
 }
 return {confirmation,install};
});
