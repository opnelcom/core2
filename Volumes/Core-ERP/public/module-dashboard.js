(function(root,factory){
  if(typeof module==='object' && module.exports)module.exports=factory();
  else root.erpModuleDashboard=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function render({target,data,moduleId,onModule,onOverview,onStatus,formatMoney,onAccount}){
    const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
    const button=(label,action,className)=>{const el=node('button',label,className);el.type='button';el.addEventListener('click',action);return el;};
    target.replaceChildren();
    if(!data){target.append(node('p','Loading module dashboards…','empty'));return;}
    const selected=data.modules.find(module=>module.module_id===moduleId);
    if(moduleId && !selected){target.append(node('p','This module is no longer available.','empty'),button('All modules',onOverview,'secondary'));return;}
    if(!selected){
      if(data.financial && globalThis.erpFinancialDashboard){
        globalThis.erpFinancialDashboard.render({target,data:data.financial,formatMoney,onAccount});
        target.append(node('h2','Module dashboards'));
      }
      if(data.financial_error)target.append(node('p',data.financial_error,'dashboard-description'));
      target.append(node('p','Records in transitional workflow statuses within the selected division scope.','dashboard-description'));
      if(!data.modules.length){target.append(node('p','No modules are available for your assigned roles.','empty'));return;}
      const pendingModules=data.modules.filter(module=>Number(module.total)>0);
      if(!pendingModules.length){target.append(node('p','No records in transitional statuses.','empty'));return;}
      const grid=node('div',undefined,'module-dashboard-grid');
      for(const module of pendingModules){
        const card=button('',()=>onModule(module.module_id),'module-dashboard-card');
        card.append(node('h2',module.module_name),node('strong',String(module.total),'module-dashboard-total'),
          node('span','Records in transitional statuses'),
          node('span','View dashboard →','module-dashboard-link'));
        grid.append(card);
      }
      target.append(grid,node('p',`${data.total_records} distinct records across accessible modules. Records linked to several modules appear in each module.`, 'dashboard-description'));
      return;
    }
    target.append(button('← All modules',onOverview,'secondary'),
      node('p',`${selected.total} ${selected.total===1?'record':'records'} in transitional statuses within the selected division scope.`,'dashboard-description'));
    if(!selected.types.length)target.append(node('p','No records in transitional statuses.','empty'));
    const classes={subledger_account:'Sub Ledger',accounting_object:'Accounting Object',accounting_dimension:'Accounting Dimension',transaction:'Transaction'};
    const grid=node('div',undefined,'module-dashboard-type-grid');
    for(const type of selected.types){
      const section=node('section',undefined,'panel module-dashboard-type');
      section.append(node('h2',type.type_name),node('p',`${classes[type.kind]} · ${type.total} ${type.total===1?'record':'records'}`,'dashboard-description'));
      for(const status of type.statuses){
        const row=button('',()=>onStatus(type,status),'module-dashboard-status');
        row.append(node('span',status.status_label));
        const values=node('span',undefined,'module-dashboard-status-values');
        const debit=type.kind==='transaction'?formatMoney(status.debit_total??'0'):null;
        if(debit!==null){
          const amount=node('span',undefined,'module-dashboard-debit');
          amount.append(node('small','Debit total'),node('strong',debit));
          values.append(amount);
        }
        values.append(node('strong',`${status.count} →`));
        row.append(values);
        row.setAttribute('aria-label',`${type.type_name}: ${status.status_label}, ${status.count} ${status.count===1?'record':'records'}${debit!==null?`, debit total ${debit}`:''}`);
        section.append(row);
      }
      grid.append(section);
    }
    target.append(grid);
    const balanceTypes=selected.subledger_types||[];
    const heading=node('div',undefined,'module-dashboard-balance-heading');
    heading.append(node('h2','Sub-ledger balances'),node('span',`Posted entries through ${data.as_of||''} · Selected division scope`,'dashboard-description'));
    target.append(heading);
    if(!balanceTypes.length){target.append(node('p','No visible sub-ledger accounts are linked to this module.','empty'));return;}
    const controls=node('label',undefined,'check');const zero=document.createElement('input');zero.type='checkbox';zero.checked=true;
    controls.append(zero,document.createTextNode('Show zero balances'));target.append(controls);
    const balances=node('div',undefined,'module-dashboard-type-grid');target.append(balances);
    function drawBalances(){
      balances.replaceChildren();
      for(const type of balanceTypes){
        const accounts=type.accounts.filter(account=>zero.checked||Number(account.balance)!==0);
        if(!zero.checked&&!accounts.length)continue;
        const section=node('section',undefined,'panel module-dashboard-type');
        section.append(node('h2',type.type_name));
        section.append(node('p',`${accounts.length} ${accounts.length===1?'account':'accounts'} · Organisation base currency`,'dashboard-description'));
        if(!accounts.length)section.append(node('p','No accounts to display.','empty'));
        for(const account of accounts){
          const negative=String(account.balance).startsWith('-');
          const amount=formatMoney(negative?String(account.balance).slice(1):account.balance);
          const balance=Number(account.balance)===0?amount:`${amount} ${negative?'CR':'DR'}`;
          const row=button('',()=>onAccount(type,account),'module-dashboard-account');
          const name=node('span',undefined,'module-dashboard-account-name');
          name.append(node('span',account.account_name),node('small',account.account_code));
          const value=node('span',undefined,'module-dashboard-account-balance');
          value.append(node('strong',`${balance} →`));
          if(account.restricted)value.append(node('small','Partial balance'));
          row.append(name,value);row.setAttribute('aria-label',`${account.account_code} ${account.account_name}: ${balance}${account.restricted?', partial balance':''}. Open statement`);
          section.append(row);
        }
        balances.append(section);
      }
    }
    zero.addEventListener('change',drawBalances);drawBalances();
  }
  return {render};
});
