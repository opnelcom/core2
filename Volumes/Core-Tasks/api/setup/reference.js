'use strict';
const {ensureSchema,authTenant}=require('../_shared/tasks');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const r=await ctx.broker('core_tasks','query',{
    text:`WITH ref AS (
            SELECT category_name,category_description,sort_order
            FROM tasks_reference_category
            WHERE status='active'
          ),
          inserted AS (
            INSERT INTO tasks_task(tenant_id,parent_task_id,task_name,task_description,importance,status,percent_complete,sort_order,created_by_email,updated_by_email)
            SELECT $1,NULL,category_name,category_description,'normal','active',0,sort_order,$2,$2
            FROM ref
            WHERE NOT EXISTS (
              SELECT 1 FROM tasks_task existing
              WHERE existing.tenant_id=$1
              AND existing.parent_task_id IS NULL
              AND lower(existing.task_name)=lower(ref.category_name)
              AND existing.status NOT IN('archived','deleted')
            )
            RETURNING task_id
          )
          SELECT COUNT(*)::int AS categories_created FROM inserted`,
    values:[access.tenantId,access.auth.email]
  });
  return r.rows[0];
};
