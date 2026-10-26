(() => {
  'use strict';
  function fillUserSelect(select,users,email='') {
    select.replaceChildren(new Option('Select user',''));
    const key=email.toLowerCase();
    const options=users.filter(user=>user.is_current||user.email.toLowerCase()===key);
    options.forEach(user=>select.add(new Option(`${user.known_name||user.full_name||user.email} — ${user.email}${user.is_current?'':' (inactive)'}`,user.email)));
    if(email&&!options.some(user=>user.email.toLowerCase()===key))select.add(new Option(`${email} (inactive)`,email));
    select.value=options.find(user=>user.email.toLowerCase()===key)?.email||email;select.required=true;
  }
  function create({state,api,table,dateOnly,refresh,onError}) {
    const $=id=>document.getElementById(id),form=$('erp-user-form');
    const fields=['email','known_name','full_name','title','description','valid_from','valid_to'];
    function showTab(tab) {
      form.querySelectorAll('[data-user-tab]').forEach(button=>{const active=button.dataset.userTab===tab;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));});
      ['identification','roles','divisions'].forEach(name=>$(`erp-user-tab-${name}`).hidden=name!==tab);
    }
    function addAssignment(kind,line={}) {
      const role=kind==='roles',key=role?'role_id':'division_id';
      const rows=role?state.roles:state.divisions;
      const row=document.createElement('tr');
      const select=document.createElement('select');select.required=true;select.setAttribute('aria-label',role?'Role':'Division');
      select.add(new Option(role?'Select role':'Select division',''));
      rows.filter(item=>item.is_active!==false||item[key]===line[key]).forEach(item=>select.add(new Option((role?item.role_name:`${item.division_code} — ${item.division_name}`)+(item.is_active===false?' (inactive)':''),item[key])));
      if(line[key]&&!rows.some(item=>item[key]===line[key]))select.add(new Option('Unavailable assignment',line[key]));
      select.value=line[key]||'';
      const cell=document.createElement('td');cell.append(select);row.append(cell);
      for(const date of ['valid_from','valid_to']){const td=document.createElement('td'),input=document.createElement('input');input.type='date';input.value=dateOnly(line[date]);input.dataset.date=date;input.setAttribute('aria-label',date==='valid_from'?'Assignment valid from':'Assignment valid to');td.append(input);row.append(td);}
      const action=document.createElement('td'),remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='\u2212';remove.setAttribute('aria-label',role?'Remove role assignment':'Remove division assignment');remove.onclick=()=>row.remove();action.append(remove);row.append(action);row.dataset.kind=kind;
      $(`erp-user-${kind}-rows`).append(row);
    }
    function render() {
      const term=$('erp-user-search').value.trim().toLowerCase();
      const users=state.organisationUsers.filter(user=>[user.email,user.known_name,user.full_name,user.title,user.description].some(value=>String(value||'').toLowerCase().includes(term)));
      table($('erp-user-list'),[
        ['Email',user=>user.email],['Known name',user=>user.known_name],['Full name',user=>user.full_name],
        ['Enabled',user=>user.is_enabled?'Yes':'No'],['Valid from',user=>dateOnly(user.valid_from)],['Valid to',user=>dateOnly(user.valid_to)],
        ['Active roles',user=>user.active_roles],['Active divisions',user=>user.active_divisions],
      ],users,open);
    }
    function open(user=null) {
      form.reset();$('erp-user-id').value=user?.user_id||'';
      fields.forEach(field=>$(`erp-user-${field}`).value=field.startsWith('valid_')?dateOnly(user?.[field]):user?.[field]||'');
      $('erp-user-enabled').checked=user?.is_enabled!==false;
      $('erp-user-heading').textContent=user?'Edit user':'Add user';
      $('erp-user-roles-rows').replaceChildren();$('erp-user-divisions-rows').replaceChildren();
      if(user){state.roleUsers.filter(row=>row.email.toLowerCase()===user.email.toLowerCase()).forEach(row=>addAssignment('roles',row));state.userDivisions.filter(row=>row.user_id===user.user_id).forEach(row=>addAssignment('divisions',row));}
      showTab('identification');form.hidden=false;
    }
    form.querySelectorAll('[data-user-tab]').forEach(button=>button.onclick=()=>showTab(button.dataset.userTab));
    $('add-erp-user').onclick=()=>open();$('erp-user-search').oninput=render;
    $('erp-user-add-role').onclick=()=>addAssignment('roles');$('erp-user-add-division').onclick=()=>addAssignment('divisions');
    form.addEventListener('submit',async event=>{
      event.preventDefault();const submit=form.querySelector('[type=submit]');submit.disabled=true;
      try {
        const payload={organisation_id:state.orgId,user_id:$('erp-user-id').value||null,is_enabled:$('erp-user-enabled').checked};
        fields.forEach(field=>payload[field]=$(`erp-user-${field}`).value);
        for(const kind of ['roles','divisions'])payload[kind]=[...$(`erp-user-${kind}-rows`).rows].map(row=>({[kind==='roles'?'role_id':'division_id']:row.querySelector('select').value,valid_from:row.querySelector('[data-date=valid_from]').value,valid_to:row.querySelector('[data-date=valid_to]').value}));
        await api('users/save',{method:'POST',body:JSON.stringify(payload)});form.hidden=true;await refresh();render();
      }catch(error){onError(error.message);}finally{submit.disabled=false;}
    });
    return {render,open,reset:()=>{form.hidden=true;}};
  }
  window.erpOrganisationUsers={create,fillUserSelect};
})();
