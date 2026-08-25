'use strict';
const {ensureSchema,authTenant,clean}=require('../_shared/tasks');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const parentId=clean(ctx.body.parent_task_id);
  const name=clean(ctx.body.task_name);
  if(!name)return ctx.send(400,{error:'Task name is required'});
  if(parentId){
    const parent=await ctx.broker('core_tasks','query',{
      text:`SELECT task_id FROM tasks_task WHERE tenant_id=$1 AND task_id=$2 AND status NOT IN('archived','deleted')`,
      values:[access.tenantId,parentId]
    });
    if(!parent.rowCount)return ctx.send(404,{error:'Parent task not found'});
  }
  const r=await ctx.broker('core_tasks','query',{
    text:`WITH next_order AS (
            SELECT COALESCE(MAX(sort_order),0)+10 sort_order
            FROM tasks_task
            WHERE tenant_id=$1 AND parent_task_id IS NOT DISTINCT FROM $2::uuid AND status NOT IN('archived','deleted')
          )
          INSERT INTO tasks_task(tenant_id,parent_task_id,task_name,task_description,sort_order,created_by_email,updated_by_email)
          SELECT $1,$2,$3,'',sort_order,$4,$4 FROM next_order
          RETURNING task_id,tenant_id,parent_task_id,task_name,task_description,importance,status,percent_complete::float AS percent_complete,start_date,due_date,sort_order,created_at,updated_at`,
    values:[access.tenantId,parentId,name,access.auth.email]
  });
  return {task:r.rows[0]};
};
