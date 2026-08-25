'use strict';
const {ensureSchema,authTenant,clean,percent}=require('../_shared/tasks');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST'&&ctx.req.method!=='PATCH')return ctx.send(405,{error:'POST or PATCH required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const id=clean(ctx.body.task_id);
  const name=clean(ctx.body.task_name);
  const description=String(ctx.body.task_description||'');
  const importance=clean(ctx.body.importance)||'normal';
  const status=clean(ctx.body.status)||'active';
  const pct=percent(ctx.body.percent_complete);
  const startDate=clean(ctx.body.start_date);
  const dueDate=clean(ctx.body.due_date);
  if(!id||!name)return ctx.send(400,{error:'Task id and name are required'});
  if(!['low','normal','high','critical'].includes(importance))return ctx.send(400,{error:'Invalid importance'});
  if(!['active','future','on_hold','blocked','complete','cancelled'].includes(status))return ctx.send(400,{error:'Invalid status'});
  const savedPercent=status==='complete'?100:pct;
  const r=await ctx.broker('core_tasks','query',{
    text:`UPDATE tasks_task
          SET task_name=$3,task_description=$4,importance=$5,status=$6,percent_complete=$7,
              start_date=$8::date,due_date=$9::date,updated_by_email=$10,updated_at=now(),
              completed_at=CASE WHEN $6='complete' AND status<>'complete' THEN now() WHEN $6<>'complete' THEN NULL ELSE completed_at END
          WHERE tenant_id=$1 AND task_id=$2 AND status NOT IN('archived','deleted')
          RETURNING task_id,tenant_id,parent_task_id,task_name,task_description,importance,status,percent_complete::float AS percent_complete,start_date,due_date,sort_order,created_at,updated_at,completed_at`,
    values:[access.tenantId,id,name,description,importance,status,savedPercent,startDate,dueDate,access.auth.email]
  });
  if(!r.rowCount)return ctx.send(404,{error:'Task not found'});
  return {task:r.rows[0]};
};
