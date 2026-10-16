const fs=require('fs');
(async()=>{
 const {instance}=await import('file:///C:/Users/JoeO/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@viz-js/viz/dist/viz.js');
 const viz=await instance(); const data=JSON.parse(fs.readFileSync('seeds/template-defaults.json','utf8'));
 const labels=Object.fromEntries(data.workflowStatuses.map(s=>[s.status_code,s.status_label]));
 const layouts=[
 [['active'],['deleted'],['archived']],
 [['draft'],['active','deleted'],['blocked','archived']],
 [['draft','deleted'],['submitted','blocked'],['active'],['requesting_archive','requesting_reactivation'],['archived']],
 [['draft'],['submitted','deleted'],['posted','archived']],
 [['draft'],['submitted','deleted'],['team_allocation_pending'],['in_progress','cancelled'],['resolved'],['closed']]
 ];
 const mains=[['active','deleted'],['draft','active','blocked'],['draft','submitted','active','requesting_archive','archived'],['draft','submitted','posted'],['draft','submitted','team_allocation_pending','in_progress','resolved','closed']];
 const out=[];
 for(const [index,w] of data.workflows.entries()){
 let dot='digraph G { rankdir=LR; graph [bgcolor="transparent",nodesep=1.1,ranksep=0.85,splines=spline]; node [shape=box,style="rounded,filled",fontname="Helvetica",fontsize=14,margin="0.18,0.12"]; edge [fontname="Helvetica",fontsize=11];';
 for(const s of w.steps){const label=labels[s.step_code]+(s.is_initial?'\\nInitial':'')+(s.enabled_for_use?'\\nEnabled for use':'');dot+=`${s.step_code} [label="${label}",group="${layouts[index].some(col=>col[0]===s.step_code)?'main':'lower'}",fillcolor="${s.enabled_for_use?'#E3F2EA':'#F1F4F8'}"];`;}
 for(const col of layouts[index])dot+=`{rank=same; ${col.join(';')};}`;
 
 const lower=layouts[index].flatMap(col=>col.slice(1));if(lower.length>1)dot+=lower.join(' -> ')+' [style=invis,weight=100];';
 for(const s of w.steps)for(const a of s.actions){const main=mains[index];const forward=main.indexOf(a.next_step_code)===main.indexOf(s.step_code)+1 && main.includes(s.step_code);dot+=`${s.step_code} -> ${a.next_step_code} [label=${JSON.stringify(a.action_label)},constraint=${forward?true:false}${forward?',weight=100,tailport=e,headport=w':''}];`;}
 dot+='}';const result=viz.render(dot,{format:'json'});if(result.status!=='success')throw Error(JSON.stringify(result.errors));out.push({name:w.path_name,graph:JSON.parse(result.output)});
 }
 fs.writeFileSync('tmp/pdfs/workflows.json',JSON.stringify(out));
})();


