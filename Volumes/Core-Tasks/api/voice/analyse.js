'use strict';
const {ensureSchema,authTenant,clean}=require('../_shared/tasks');
const {decryptKey,loadOpenAISetting}=require('../_shared/openai-settings');

const statuses=['active','future','on_hold','blocked','complete','cancelled'];
const importanceValues=['low','normal','high','critical'];

function extractText(response){
  if(typeof response.output_text==='string')return response.output_text;
  const parts=[];
  (response.output||[]).forEach(item=>{
    (item.content||[]).forEach(content=>{
      if(typeof content.text==='string')parts.push(content.text);
      if(typeof content.output_text==='string')parts.push(content.output_text);
    });
  });
  return parts.join('\n').trim();
}

function normalizeUuid(value){
  const text=clean(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text||'')?text:null;
}

function dateOrBlank(value){
  const text=clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text||'')?text:'';
}

function percentOrBlank(value){
  if(value===''||value===null||value===undefined)return '';
  const n=Number(value);
  if(!Number.isFinite(n))return '';
  return String(Math.min(100,Math.max(0,Math.round(n))));
}

function normalizeAction(action,index,tasksById){
  const type=clean(action.action_type);
  if(!['create_task','update_task','rename_task','move_task'].includes(type))return null;
  const taskId=normalizeUuid(action.task_id);
  const parentId=normalizeUuid(action.parent_task_id);
  const targetParentId=normalizeUuid(action.target_parent_task_id);
  const task=taskId?tasksById.get(taskId):null;
  const parent=parentId?tasksById.get(parentId):null;
  const targetParent=targetParentId?tasksById.get(targetParentId):null;
  const taskName=clean(action.task_name);
  const newName=clean(action.new_task_name);
  const description=String(action.description||'').trim().slice(0,500);
  const taskDescription=String(action.task_description||'').trim().slice(0,4000);
  const status=statuses.includes(clean(action.status))?clean(action.status):'';
  const importance=importanceValues.includes(clean(action.importance))?clean(action.importance):'';
  const dueDate=dateOrBlank(action.due_date);
  const startDate=dateOrBlank(action.start_date);
  const percentComplete=percentOrBlank(action.percent_complete);

  if(type==='create_task'){
    if(!taskName)return null;
    return {
      action_id:`voice-task-action-${index+1}`,
      action_type:type,
      description:description||`Create task "${taskName}"${parent?` under "${parent.task_name}"`:''}.`,
      parent_task_id:parent?.task_id||null,
      parent_task_name:parent?.task_name||'Top level',
      task_name:taskName,
      task_description:taskDescription,
      importance:importance||'normal',
      status:status||'active',
      percent_complete:percentComplete||'0',
      start_date:startDate,
      due_date:dueDate
    };
  }

  if(type==='update_task'){
    if(!task)return null;
    return {
      action_id:`voice-task-action-${index+1}`,
      action_type:type,
      description:description||`Update "${task.task_name}".`,
      task_id:task.task_id,
      task_name:task.task_name,
      task_description:taskDescription,
      importance,
      status,
      percent_complete:percentComplete,
      start_date:startDate,
      due_date:dueDate,
      current:{status:task.status,importance:task.importance,percent_complete:String(Math.round(Number(task.percent_complete)||0)),start_date:task.start_date||'',due_date:task.due_date||''}
    };
  }

  if(type==='rename_task'){
    if(!task||!newName)return null;
    return {
      action_id:`voice-task-action-${index+1}`,
      action_type:type,
      description:description||`Rename "${task.task_name}" to "${newName}".`,
      task_id:task.task_id,
      task_name:task.task_name,
      new_task_name:newName
    };
  }

  if(type==='move_task'){
    if(!task)return null;
    return {
      action_id:`voice-task-action-${index+1}`,
      action_type:type,
      description:description||`Move "${task.task_name}" ${targetParent?`under "${targetParent.task_name}"`:'to the top level'}.`,
      task_id:task.task_id,
      task_name:task.task_name,
      target_parent_task_id:targetParent?.task_id||null,
      target_parent_task_name:targetParent?.task_name||'Top level'
    };
  }

  return null;
}

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);

  const transcript=clean(ctx.body.transcript);
  if(!transcript)return ctx.send(400,{error:'Voice transcript is required'});
  const openaiSetting=await loadOpenAISetting(ctx,access.tenantId);
  const openaiKey=decryptKey(ctx,openaiSetting);
  if(!openaiKey)return ctx.send(503,{error:'OpenAI API key is not configured for Vision'});

  const r=await ctx.broker('core_tasks','query',{
    text:`SELECT task_id,parent_task_id,task_name,task_description,importance,status,percent_complete::float AS percent_complete,start_date,due_date
          FROM tasks_task
          WHERE tenant_id=$1 AND status NOT IN('archived','deleted')
          ORDER BY COALESCE(parent_task_id::text,''),sort_order,task_name`,
    values:[access.tenantId]
  });
  const tasks=r.rows;

  const schema={
    type:'object',
    additionalProperties:false,
    required:['summary','actions','warnings'],
    properties:{
      summary:{type:'string'},
      actions:{
        type:'array',
        maxItems:12,
        items:{
          type:'object',
          additionalProperties:false,
          required:['action_type','description','task_id','parent_task_id','target_parent_task_id','task_name','new_task_name','task_description','importance','status','percent_complete','start_date','due_date'],
          properties:{
            action_type:{type:'string',enum:['create_task','update_task','rename_task','move_task']},
            description:{type:'string'},
            task_id:{type:'string'},
            parent_task_id:{type:'string'},
            target_parent_task_id:{type:'string'},
            task_name:{type:'string'},
            new_task_name:{type:'string'},
            task_description:{type:'string'},
            importance:{type:'string'},
            status:{type:'string'},
            percent_complete:{type:'string'},
            start_date:{type:'string'},
            due_date:{type:'string'}
          }
        }
      },
      warnings:{type:'array',items:{type:'string'},maxItems:8}
    }
  };

  const prompt=[
    'Convert the user voice transcript into Vision changes.',
    'Use an empty string for fields that do not apply to an action.',
    'Return only actions that are clearly requested and can be mapped to supplied ids, except create_task which can create a new task name.',
    'Use task names case-insensitively and tolerate minor speech-to-text errors.',
    'Supported actions: create_task, update_task, rename_task, move_task.',
    'For "add X under Y" create a task named X with parent Y. If no parent is clear, create a top-level task.',
    'For "mark X complete", update status to complete and percent_complete to 100.',
    'For "set X to high priority" use importance high. Use critical only when explicitly said.',
    'Dates must be YYYY-MM-DD. If a relative date is spoken, infer it from today when obvious.',
    'Do not delete or archive anything from voice commands.',
    '',
    `Today: ${new Date().toISOString().slice(0,10)}`,
    `Transcript: ${transcript}`,
    '',
    `Task catalog JSON: ${JSON.stringify({tasks,statuses,importance:importanceValues})}`
  ].join('\n');

  let response;
  try{
    response=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{'content-type':'application/json',authorization:`Bearer ${openaiKey}`},
      body:JSON.stringify({
        model:openaiSetting?.model||'gpt-4.1-mini',
        input:[{role:'user',content:[{type:'input_text',text:prompt}]}],
        text:{format:{type:'json_schema',name:'core_tasks_voice_actions',schema,strict:true}}
      })
    });
  }catch(e){
    return ctx.send(502,{error:`Could not reach OpenAI from Vision: ${e.cause?.message||e.message}`});
  }
  const json=await response.json().catch(()=>({}));
  if(!response.ok)return ctx.send(response.status,{error:json.error?.message||'Voice action analysis failed'});

  let raw;
  try{
    raw=JSON.parse(extractText(json));
  }catch{
    return ctx.send(502,{error:'Voice action analysis returned invalid data'});
  }
  const tasksById=new Map(tasks.map(task=>[task.task_id,task]));
  const actions=(Array.isArray(raw.actions)?raw.actions:[])
    .map((action,index)=>normalizeAction(action,index,tasksById))
    .filter(Boolean);
  return {
    transcript,
    summary:String(raw.summary||'').trim(),
    actions,
    warnings:Array.isArray(raw.warnings)?raw.warnings.map(String).map(v=>v.trim()).filter(Boolean).slice(0,8):[]
  };
};
