'use strict';
const {ensureSchema,authTenant}=require('../_shared/tasks');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const r=await ctx.broker('core_tasks','query',{
    text:`SELECT task_id,tenant_id,parent_task_id,task_name,task_description,importance,status,
                 percent_complete::float AS percent_complete,start_date,due_date,sort_order,
                 created_by_email,updated_by_email,created_at,updated_at,completed_at,archived_at
          FROM tasks_task
          WHERE tenant_id=$1 AND status NOT IN('archived','deleted')
          ORDER BY COALESCE(parent_task_id::text,''),sort_order,task_name`,
    values:[access.tenantId]
  });
  return {tasks:r.rows,statuses:['active','future','on_hold','blocked','complete','cancelled'],importance:['low','normal','high','critical']};
};
