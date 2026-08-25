'use strict';
const {ensureSchema,authTenant,clean,percent}=require('../_shared/tasks');

const statuses=['active','future','on_hold','blocked','complete','cancelled'];
const importanceValues=['low','normal','high','critical'];

function selected(action,ids){
  return !ids||ids.has(clean(action.action_id));
}

async function taskExists(ctx,tenantId,taskId){
  const r=await ctx.broker('core_tasks','query',{
    text:`SELECT task_id,parent_task_id,task_name,task_description,importance,status,percent_complete::float AS percent_complete,start_date,due_date
          FROM tasks_task
          WHERE tenant_id=$1 AND task_id=$2 AND status NOT IN('archived','deleted')`,
    values:[tenantId,taskId]
  });
  return r.rows[0]||null;
}

async function wouldCreateCycle(ctx,tenantId,taskId,parentId){
  if(!parentId)return false;
  const r=await ctx.broker('core_tasks','query',{
    text:`WITH RECURSIVE ancestors AS (
            SELECT task_id,parent_task_id
            FROM tasks_task
            WHERE tenant_id=$1 AND task_id=$2 AND status NOT IN('archived','deleted')
            UNION ALL
            SELECT parent.task_id,parent.parent_task_id
            FROM tasks_task parent
            JOIN ancestors child ON child.parent_task_id=parent.task_id
            WHERE parent.tenant_id=$1 AND parent.status NOT IN('archived','deleted')
          )
          SELECT 1 FROM ancestors WHERE task_id=$3 LIMIT 1`,
    values:[tenantId,parentId,taskId]
  });
  return r.rowCount>0;
}

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);

  const actions=Array.isArray(ctx.body.actions)?ctx.body.actions:[];
  const selectedIds=Array.isArray(ctx.body.selected_action_ids)?new Set(ctx.body.selected_action_ids.map(clean).filter(Boolean)):null;
  const chosen=actions.filter(action=>selected(action,selectedIds));
  if(!chosen.length)return ctx.send(400,{error:'Select at least one voice action to apply'});

  const applied=[];
  for(const action of chosen){
    const type=clean(action.action_type);
    if(type==='create_task'){
      const parentId=clean(action.parent_task_id);
      const name=clean(action.task_name);
      if(!name)throw new Error('Create task action is missing a task name');
      if(parentId&&!await taskExists(ctx,access.tenantId,parentId))throw new Error(`Parent task not found for "${name}"`);
      const importance=importanceValues.includes(clean(action.importance))?clean(action.importance):'normal';
      const taskStatus=statuses.includes(clean(action.status))?clean(action.status):'active';
      const pct=taskStatus==='complete'?100:percent(action.percent_complete);
      const r=await ctx.broker('core_tasks','query',{
        text:`WITH next_order AS (
                SELECT COALESCE(MAX(sort_order),0)+10 sort_order
                FROM tasks_task
                WHERE tenant_id=$1 AND parent_task_id IS NOT DISTINCT FROM $2::uuid AND status NOT IN('archived','deleted')
              )
              INSERT INTO tasks_task(tenant_id,parent_task_id,task_name,task_description,importance,status,percent_complete,start_date,due_date,sort_order,created_by_email,updated_by_email,completed_at)
              SELECT $1,$2::uuid,$3,$4,$5,$6,$7,$8::date,$9::date,sort_order,$10,$10,CASE WHEN $6='complete' THEN now() ELSE NULL END FROM next_order
              RETURNING task_id,task_name,parent_task_id`,
        values:[access.tenantId,parentId,name,String(action.task_description||''),importance,taskStatus,pct,clean(action.start_date),clean(action.due_date),access.auth.email]
      });
      applied.push({action_type:type,task_id:r.rows[0].task_id,task_name:r.rows[0].task_name,parent_task_id:r.rows[0].parent_task_id});
    }else if(type==='update_task'){
      const taskId=clean(action.task_id);
      const current=await taskExists(ctx,access.tenantId,taskId);
      if(!current)throw new Error('Task to update was not found');
      const nextStatus=statuses.includes(clean(action.status))?clean(action.status):current.status;
      const nextImportance=importanceValues.includes(clean(action.importance))?clean(action.importance):current.importance;
      const nextPercent=clean(action.percent_complete)?percent(action.percent_complete):Number(current.percent_complete)||0;
      const savedPercent=nextStatus==='complete'?100:nextPercent;
      const r=await ctx.broker('core_tasks','query',{
        text:`UPDATE tasks_task
              SET task_description=CASE WHEN $3<>'' THEN $3 ELSE task_description END,
                  importance=$4,status=$5,percent_complete=$6,
                  start_date=CASE WHEN $7<>'' THEN $7::date ELSE start_date END,
                  due_date=CASE WHEN $8<>'' THEN $8::date ELSE due_date END,
                  updated_by_email=$9,updated_at=now(),
                  completed_at=CASE WHEN $5='complete' AND status<>'complete' THEN now() WHEN $5<>'complete' THEN NULL ELSE completed_at END
              WHERE tenant_id=$1 AND task_id=$2 AND status NOT IN('archived','deleted')
              RETURNING task_id,task_name,status`,
        values:[access.tenantId,taskId,String(action.task_description||''),nextImportance,nextStatus,savedPercent,clean(action.start_date)||'',clean(action.due_date)||'',access.auth.email]
      });
      applied.push({action_type:type,task_id:r.rows[0].task_id,task_name:r.rows[0].task_name,status:r.rows[0].status});
    }else if(type==='rename_task'){
      const taskId=clean(action.task_id);
      const newName=clean(action.new_task_name);
      if(!newName)throw new Error('Rename action is missing a new name');
      if(!await taskExists(ctx,access.tenantId,taskId))throw new Error('Task to rename was not found');
      const r=await ctx.broker('core_tasks','query',{
        text:`UPDATE tasks_task SET task_name=$3,updated_by_email=$4,updated_at=now()
              WHERE tenant_id=$1 AND task_id=$2 AND status NOT IN('archived','deleted')
              RETURNING task_id,task_name`,
        values:[access.tenantId,taskId,newName,access.auth.email]
      });
      applied.push({action_type:type,task_id:r.rows[0].task_id,task_name:r.rows[0].task_name});
    }else if(type==='move_task'){
      const taskId=clean(action.task_id);
      const parentId=clean(action.target_parent_task_id);
      if(!await taskExists(ctx,access.tenantId,taskId))throw new Error('Task to move was not found');
      if(parentId&&!await taskExists(ctx,access.tenantId,parentId))throw new Error('Move target parent was not found');
      if(parentId===taskId||await wouldCreateCycle(ctx,access.tenantId,taskId,parentId))throw new Error('Cannot move a task under itself or its child');
      const r=await ctx.broker('core_tasks','query',{
        text:`WITH next_order AS (
                SELECT COALESCE(MAX(sort_order),0)+10 sort_order
                FROM tasks_task
                WHERE tenant_id=$1 AND parent_task_id IS NOT DISTINCT FROM $3::uuid AND status NOT IN('archived','deleted')
              )
              UPDATE tasks_task
              SET parent_task_id=$3::uuid,sort_order=next_order.sort_order,updated_by_email=$4,updated_at=now()
              FROM next_order
              WHERE tenant_id=$1 AND task_id=$2 AND status NOT IN('archived','deleted')
              RETURNING task_id,task_name,parent_task_id`,
        values:[access.tenantId,taskId,parentId,access.auth.email]
      });
      applied.push({action_type:type,task_id:r.rows[0].task_id,task_name:r.rows[0].task_name,parent_task_id:r.rows[0].parent_task_id});
    }else{
      throw new Error(`Unsupported voice action: ${type||'unknown'}`);
    }
  }
  return {applied};
};
