'use strict';
const {ensureSchema,authTenant,clean}=require('../_shared/tasks');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);

  const id=clean(ctx.body.task_id);
  const targetId=clean(ctx.body.target_task_id);
  const position=String(ctx.body.position||'inside').toLowerCase();
  if(!id||!targetId||!['inside','before','after'].includes(position)){
    return ctx.send(400,{error:'Task id, target task id, and position are required'});
  }
  if(id===targetId)return ctx.send(400,{error:'A task cannot be dropped onto itself'});

  const pair=await ctx.broker('core_tasks','query',{
    text:`SELECT task_id
          FROM tasks_task
          WHERE tenant_id=$1 AND status NOT IN('archived','deleted') AND task_id = ANY($2::uuid[])`,
    values:[access.tenantId,[id,targetId]]
  });
  if(pair.rowCount!==2)return ctx.send(404,{error:'Task or target task not found'});

  const cycle=await ctx.broker('core_tasks','query',{
    text:`WITH RECURSIVE subtree AS (
            SELECT task_id FROM tasks_task WHERE tenant_id=$1 AND task_id=$2 AND status NOT IN('archived','deleted')
            UNION ALL
            SELECT child.task_id
            FROM tasks_task child
            JOIN subtree parent ON parent.task_id=child.parent_task_id
            WHERE child.tenant_id=$1 AND child.status NOT IN('archived','deleted')
          )
          SELECT 1 FROM subtree WHERE task_id=$3 LIMIT 1`,
    values:[access.tenantId,id,targetId]
  });
  if(cycle.rowCount)return ctx.send(400,{error:'A task cannot be moved relative to one of its children'});

  const r=await ctx.broker('core_tasks','query',{
    text:`WITH target AS (
            SELECT t.*,
                   CASE WHEN $4='inside' THEN t.task_id ELSE t.parent_task_id END new_parent_task_id,
                   CASE
                     WHEN $4='before' THEN t.sort_order::numeric - 0.5
                     WHEN $4='after' THEN t.sort_order::numeric + 0.5
                     ELSE (
                       SELECT COALESCE(MAX(child.sort_order),0)::numeric + 1
                       FROM tasks_task child
                       WHERE child.tenant_id=$1
                       AND child.status NOT IN('archived','deleted')
                       AND child.parent_task_id IS NOT DISTINCT FROM t.task_id
                     )
                   END desired_sort_order
            FROM tasks_task t
            WHERE t.tenant_id=$1 AND t.task_id=$3 AND t.status NOT IN('archived','deleted')
          ),
          moved AS (
            UPDATE tasks_task task
            SET parent_task_id=(SELECT new_parent_task_id FROM target),
                sort_order=(SELECT desired_sort_order::integer FROM target),
                updated_by_email=$5,
                updated_at=now()
            WHERE task.tenant_id=$1 AND task.task_id=$2 AND task.status NOT IN('archived','deleted')
            RETURNING task.task_id
          ),
          ordered AS (
            SELECT task.task_id,
                   (row_number() OVER (
                     ORDER BY
                       CASE WHEN task.task_id=$2 THEN target.desired_sort_order ELSE task.sort_order::numeric END,
                       CASE
                         WHEN $4='before' AND task.task_id=$2 THEN 0
                         WHEN $4='before' AND task.task_id=$3 THEN 1
                         WHEN $4='after' AND task.task_id=$3 THEN 0
                         WHEN $4='after' AND task.task_id=$2 THEN 1
                         ELSE 2
                       END,
                       task.task_name
                   ) * 10)::integer new_sort_order
            FROM tasks_task task
            CROSS JOIN target
            WHERE task.tenant_id=$1
            AND task.status NOT IN('archived','deleted')
            AND task.parent_task_id IS NOT DISTINCT FROM target.new_parent_task_id
          )
          UPDATE tasks_task task
          SET sort_order=ordered.new_sort_order,
              updated_by_email=$5,
              updated_at=now()
          FROM ordered
          WHERE task.task_id=ordered.task_id
          RETURNING task.task_id,task.tenant_id,task.parent_task_id,task.task_name,task.task_description,
                    task.importance,task.status,task.percent_complete::float AS percent_complete,task.start_date,
                    task.due_date,task.sort_order,task.created_at,task.updated_at`,
    values:[access.tenantId,id,targetId,position,access.auth.email]
  });
  return {tasks:r.rows};
};
