'use strict';
const {ensureSchema,authTenant,clean}=require('../../_shared/items');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const start=clean(ctx.query.start||ctx.body.start);
  const end=clean(ctx.query.end||ctx.body.end);
  if(!start||!end)return ctx.send(400,{error:'Start and end are required'});
  const r=await ctx.broker('core_objectsphere','query',{
    text:`WITH RECURSIVE item_paths AS (
            SELECT item_id,parent_item_id,item_name,item_name::text AS path
            FROM objectsphere_item
            WHERE tenant_id=$1 AND parent_item_id IS NULL AND status='active'
            UNION ALL
            SELECT child.item_id,child.parent_item_id,child.item_name,(item_paths.path || ' > ' || child.item_name)::text
            FROM objectsphere_item child
            JOIN item_paths ON child.parent_item_id=item_paths.item_id
            WHERE child.tenant_id=$1 AND child.status='active'
          )
          SELECT e.event_id,e.item_id,COALESCE(p.path,i.item_name) AS item_path,i.item_name,
                 e.event_type_id,et.type_name AS event_type_name,e.event_title,e.event_at,e.severity,e.status
          FROM objectsphere_event e
          JOIN objectsphere_item i ON i.item_id=e.item_id
          LEFT JOIN item_paths p ON p.item_id=e.item_id
          JOIN objectsphere_event_type et ON et.event_type_id=e.event_type_id
          WHERE e.tenant_id=$1
          AND i.status='active'
          AND e.deleted=false
          AND et.deleted=false
          AND e.event_at >= $2::timestamptz
          AND e.event_at < $3::timestamptz
          ORDER BY e.event_at,e.created_at`,
    values:[access.tenantId,start,end]
  });
  return {events:r.rows};
};
