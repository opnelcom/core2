'use strict';
const {ensureSchema,authTenant,clean}=require('../_shared/tasks');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const id=clean(ctx.body.task_id);
  const parentId=clean(ctx.body.parent_task_id);
  if(!id)return ctx.send(400,{error:'Task id is required'});
  if(parentId===id)return ctx.send(400,{error:'A task cannot be its own parent'});
  const cycle=parentId?await ctx.broker('core_tasks','query',{
    text:`WITH RECURSIVE descendants AS (
            SELECT task_id FROM tasks_task WHERE tenant_id=$1 AND parent_task_id=$2
            UNION ALL
            SELECT child.task_id FROM tasks_task child JOIN descendants d ON child.parent_task_id=d.task_id
            WHERE child.tenant_id=$1
          )
          SELECT 1 FROM descendants WHERE task_id=$3`,
    values:[access.tenantId,id,parentId]
  }):{rowCount:0};
  if(cycle.rowCount)return ctx.send(400,{error:'Cannot move a task under its descendant'});
  const r=await ctx.broker('core_tasks','query',{
    text:`WITH next_order AS (
            SELECT COALESCE(MAX(sort_order),0)+10 sort_order
            FROM tasks_task
            WHERE tenant_id=$1 AND parent_task_id IS NOT DISTINCT FROM $3::uuid AND status NOT IN('archived','deleted')
          )
          UPDATE tasks_task
          SET parent_task_id=$3,sort_order=(SELECT sort_order FROM next_order),updated_by_email=$4,updated_at=now()
          WHERE tenant_id=$1 AND task_id=$2 AND status NOT IN('archived','deleted')
          RETURNING task_id,parent_task_id,sort_order`,
    values:[access.tenantId,id,parentId,access.auth.email]
  });
  if(!r.rowCount)return ctx.send(404,{error:'Task not found'});
  return {task:r.rows[0]};
};
