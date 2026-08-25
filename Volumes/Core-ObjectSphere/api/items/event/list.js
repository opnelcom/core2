'use strict';
const {ensureSchema,authTenant,clean}=require('../../_shared/items');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const itemId=clean(ctx.query.item_id||ctx.body.item_id);
  const scope=clean(ctx.query.scope||ctx.body.scope)||'direct';
  if(!itemId)return ctx.send(400,{error:'Item id is required'});
  if(!['direct','children','all'].includes(scope))return ctx.send(400,{error:'Invalid event scope'});
  const r=await ctx.broker('core_objectsphere','query',{
    text:`WITH RECURSIVE tree AS (
            SELECT item_id,parent_item_id,item_name,item_name::text AS path,0 AS depth
            FROM objectsphere_item
            WHERE tenant_id=$1 AND item_id=$2 AND status='active'
            UNION ALL
            SELECT child.item_id,child.parent_item_id,child.item_name,(tree.path || ' > ' || child.item_name)::text,tree.depth+1
            FROM objectsphere_item child
            JOIN tree ON child.parent_item_id=tree.item_id
            WHERE child.tenant_id=$1 AND child.status='active'
          ),
          scoped AS (
            SELECT * FROM tree
            WHERE ($3='direct' AND depth=0)
               OR ($3='children' AND depth>0)
               OR ($3='all')
          )
          SELECT e.event_id,e.item_id,i.path AS item_path,i.item_name,e.event_type_id,et.type_name AS event_type_name,
                 e.event_title,e.event_description,e.event_at,e.severity,e.status,e.reported_by_email,
                 e.created_by_email,e.updated_by_email,e.created_at,e.updated_at,i.depth
          FROM objectsphere_event e
          JOIN scoped i ON i.item_id=e.item_id
          JOIN objectsphere_event_type et ON et.event_type_id=e.event_type_id
          WHERE e.tenant_id=$1 AND e.deleted=false AND et.deleted=false
          ORDER BY e.event_at DESC,e.created_at DESC`,
    values:[access.tenantId,itemId,scope]
  });
  return {events:r.rows};
};
