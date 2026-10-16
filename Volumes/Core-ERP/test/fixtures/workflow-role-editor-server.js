"use strict";
// Isolated presentation fixture built from the application's actual editor markup and functions.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
http.createServer((req,res)=>{
  if(req.url==='/style.css') {res.setHeader('Content-Type','text/css');res.end(fs.readFileSync(path.join(root,'public/style.css')));return;}
  if(req.url!=='/') {res.writeHead(404);res.end();return;}
  const source=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
  const start=source.indexOf('    section.innerHTML=',source.indexOf('  function installWorkflowSetup()'));
  const end=source.indexOf('\n',start);
  const markup=vm.runInNewContext(source.slice(start,end).replace('section.innerHTML=',''));
  const functions=source.slice(source.indexOf('  let workflowStatusEditorSequence'),source.indexOf('  function resourceLabel('));
  const defaults=JSON.parse(fs.readFileSync(path.join(root,'seeds/template-defaults.json'),'utf8'));
  const workflow=defaults.workflows.find(w=>w.path_name==='Transaction Management');
  const roles=defaults.roleSeeds.map((role,i)=>({role_id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,role_name:role[1],is_active:true}));
  const steps=workflow.steps.map(step=>({...step,workflow_path_id:'path'}));
  const actions=workflow.steps.flatMap(step=>step.actions.map(action=>({...action,current_step_code:step.step_code,workflow_path_id:'path',role_ids:step.step_code==='submitted'?roles.filter(role=>['Organisation Finance Manager','Organisation Approver'].includes(role.role_name)).map(role=>role.role_id):[]})));
  const script=`const state=${JSON.stringify({roles,workflowStatuses:defaults.workflowStatuses,workflowSteps:steps,workflowNext:actions})};
    const $=id=>document.getElementById(id);
    const ensurePermissions=async()=>{};
    const option=(select,rows,key,label,placeholder)=>{select.replaceChildren(new Option(placeholder,''));rows.forEach(row=>select.add(new Option(label(row),row[key])));};
    const workflowStepsForPath=id=>state.workflowSteps.filter(row=>row.workflow_path_id===id);
    const pretty=value=>String(value||'');
    const alert=message=>{$('fixture-message').textContent=message;};
    const workflowDot=colour=>{const dot=document.createElement('span');dot.className='workflow-dot';dot.style.background=colour;return dot;};
    ${functions}
    selectWorkflowPath({workflow_path_id:'path',path_name:'Transaction Management',is_active:true});
    $('fixture-read').onclick=()=>{$('fixture-message').textContent=JSON.stringify(collectWorkflowSteps().find(step=>step.step_code==='submitted').actions.map(action=>action.role_ids));};`;
  res.setHeader('Content-Type','text/html');
  res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><style>body{display:block;overflow:auto}#view-workflows{padding:20px;min-height:900px}.fixture-tools{margin:12px 20px}#fixture-message{overflow-wrap:anywhere}</style></head><body><div class="fixture-tools"><button id="fixture-read">Inspect selected role IDs</button><p id="fixture-message" role="status"></p></div><section class="view" id="view-workflows">${markup}</section><script>${script}</script></body></html>`);
}).listen(8766,'127.0.0.1',()=>console.log('Workflow roles fixture: http://127.0.0.1:8766'));
