'use strict';
const {ensureSchema,authTenant,clean}=require('../_shared/tasks');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST'&&ctx.req.method!=='DELETE')return ctx.send(405,{error:'POST or DELETE required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const id=clean(ctx.body.task_id||ctx.query.task_id);
  if(!id)return ctx.send(400,{error:'Task id is required'});
  const r=await ctx.broker('core_tasks','query',{
    text:`WITH RECURSIVE tree AS (
            SELECT task_id FROM tasks_task WHERE tenant_id=$1 AND task_id=$2
            UNION ALL
            SELECT child.task_id FROM tasks_task child JOIN tree ON child.parent_task_id=tree.task_id
            WHERE child.tenant_id=$1
          )
          UPDATE tasks_task
          SET status='deleted',deleted_at=now(),updated_by_email=$3,updated_at=now()
          WHERE tenant_id=$1 AND task_id IN(SELECT task_id FROM tree)
          RETURNING task_id`,
    values:[access.tenantId,id,access.auth.email]
  });
  return {deleted:r.rowCount};
};
