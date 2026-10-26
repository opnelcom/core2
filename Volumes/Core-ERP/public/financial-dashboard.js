(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.erpFinancialDashboard=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Keep exact cents while combining cost and contra-asset GL balances.
  function assetBalances(group){
    const records=new Map();
    for(const account of group.accounts){
      const key=account.account_id||`gl:${account.gl_account_id}`;
      if(!records.has(key))records.set(key,{...group,id:`${group.id}:${key}`,name:account.account_id?`${account.account_code} · ${account.account_name}`:group.name,total:0n,accounts:[]});
      const record=records.get(key),value=String(account.balance),negative=value.startsWith('-');
      const [whole,fraction='']=value.replace(/^-/, '').split('.');
      record.total+=(negative?-1n:1n)*(BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0')));record.accounts.push(account);
    }
    return [...records.values()].map(record=>{const value=record.total,absolute=value<0n?-value:value;return {...record,total:`${value<0n?'-':''}${absolute/100n}.${String(absolute%100n).padStart(2,'0')}`};});
  }
  function render({target,data,formatMoney,onAccount}){
    const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
    const amount=value=>formatMoney(value);
    const section=node('section',undefined,'financial-dashboard');target.append(section);
    section.append(node('h2','Organisation financial position'),node('p',`Posted balances through ${data.as_of} · Selected division scope · Organisation base currency`,'dashboard-description'));
    if(data.restricted)section.append(node('p','Partial financial position: your permissions exclude some posted entries. These figures do not represent the complete organisation.','financial-dashboard-warning'));
    const layout=node('div',undefined,'financial-dashboard-position');section.append(layout);
    const displayGroups=data.groups;
    const scale=Math.max(1,...displayGroups.map(group=>Math.abs(Number(group.total))));
    let selectedId=null;
    const detail=node('section',undefined,'financial-dashboard-detail');detail.setAttribute('aria-live','polite');
    const buttons=[];
    function showGroup(group,record=null){
      selectedId=group.id;buttons.forEach(([button,id])=>button.setAttribute('aria-pressed',String(id===selectedId)));
      const selected=record||group;
      detail.replaceChildren(node('h3',`${selected.name} · ${group.account_class==='asset'?'Assets':'Liabilities'}`),node('p',amount(selected.total),'financial-dashboard-detail-total'));
      if(group.account_class==='asset'&&!record){
        detail.append(node('p','Net balances per record. Select a record for its GL breakdown.','dashboard-description'));
        const list=node('div',undefined,'financial-dashboard-accounts');detail.append(list);
        for(const asset of assetBalances(group)){
          const row=node('button',undefined,'financial-dashboard-account');row.type='button';
          row.append(node('span',asset.name),node('span',amount(asset.total),'financial-dashboard-money'));
          row.addEventListener('click',()=>showGroup(group,asset));list.append(row);
        }
        return;
      }
      if(record){const back=node('button',`← ${group.name}`,'secondary');back.type='button';back.addEventListener('click',()=>showGroup(group));detail.append(back);}
      detail.append(node('p','Balances are split by GL account to preserve cost, depreciation, advances and liability classifications.','dashboard-description'));
      const list=node('div',undefined,'financial-dashboard-accounts');detail.append(list);
      for(const account of selected.accounts){
        const row=node(account.account_id?'button':'div',undefined,'financial-dashboard-account');
        const caption=node('span');caption.append(node('span',`${account.account_code} · ${account.account_name}`),node('small',`${account.gl_code} · ${account.gl_name}`));
        row.append(caption,node('span',amount(account.balance),'financial-dashboard-money'));
        if(account.account_id){row.type='button';row.setAttribute('aria-label',`${account.account_name}, ${account.gl_name}, ${amount(account.balance)}. Open statement`);row.addEventListener('click',()=>onAccount({type_id:account.type_id},account));}
        list.append(row);
      }
    }
    function side(kind,title,total){
      const panel=node('section',undefined,`financial-dashboard-panel financial-dashboard-${kind}`);
      panel.append(node('h3',title),node('p',amount(total),'financial-dashboard-total'));
      const denominator=Number(data.assets),numerator=Number(kind==='asset'?data.net_assets:data.liabilities);
      const percentage=denominator>0&&Number.isFinite(numerator/denominator)?`${(numerator/denominator*100).toFixed(2)}%`:'Not available';
      panel.append(node('p',`${kind==='asset'?'Net assets':'Liabilities'} / total assets: ${percentage}${data.restricted?' · partial scope':''}`,'dashboard-description financial-dashboard-percentage'));
      const groups=displayGroups.filter(group=>group.account_class===kind);
      if(!groups.length)panel.append(node('p','No posted balances in this scope.','dashboard-description'));
      for(const group of groups){
        const button=node('button',undefined,'financial-dashboard-group');button.type='button';button.setAttribute('aria-pressed','false');
        const label=node('span',undefined,'financial-dashboard-group-label');label.append(node('span',group.name),node('span',amount(group.total),'financial-dashboard-money'));
        const track=node('span',undefined,'financial-dashboard-track');const bar=node('span',undefined,'financial-dashboard-bar');bar.style.width=`${Math.abs(Number(group.total))/scale*100}%`;track.append(bar);track.setAttribute('aria-hidden','true');
        button.append(label,track);button.addEventListener('click',()=>showGroup(group));buttons.push([button,group.id]);panel.append(button);
      }
      return panel;
    }
    const assets=side('asset','Assets · what we own',data.assets),liabilities=side('liability','Liabilities · what we owe',data.liabilities);
    const centre=node('section',undefined,'financial-dashboard-panel financial-dashboard-net');
    centre.append(node('h3',data.restricted?'Net assets · partial':'Net assets'),node('p',amount(data.net_assets),'financial-dashboard-total'),node('p','Assets less liabilities','dashboard-description'));
    const graph=node('div',undefined,'financial-dashboard-comparison');graph.setAttribute('role','img');graph.setAttribute('aria-label',`Assets ${amount(data.assets)}; liabilities ${amount(data.liabilities)}. Shared scale starting at zero. Negative values retain their minus sign.`);
    const graphScale=Math.max(1,Math.abs(Number(data.assets)),Math.abs(Number(data.liabilities)));
    for(const [label,value,kind] of [['Assets',data.assets,'asset'],['Liabilities',data.liabilities,'liability']]){
      const caption=node('div',undefined,'financial-dashboard-group-label');caption.append(node('span',label),node('span',amount(value),'financial-dashboard-money'));
      const track=node('div',undefined,'financial-dashboard-comparison-track');const bar=node('div',undefined,`financial-dashboard-bar financial-dashboard-${kind}-bar`);bar.style.width=`${Math.abs(Number(value))/graphScale*100}%`;track.append(bar);graph.append(caption,track);
    }
    graph.append(node('p',`Bar lengths show magnitude · 0 to ${amount(String(graphScale))}`,'dashboard-description'));centre.append(graph);
    layout.append(assets,centre,liabilities);
    section.append(node('p',`Category bars share a magnitude scale: full width = ${amount(String(scale))}. Negative balances retain their sign. Includes GL balances without a visible sub-ledger allocation; module membership does not duplicate balances.`,'dashboard-description'),detail);
    if(displayGroups.length)showGroup(displayGroups[0]);else detail.append(node('p','No posted asset or liability entries in this scope.','dashboard-description'));
  }
  return {render,assetBalances};
});
