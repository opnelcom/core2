'use strict';
const {ensureSchema,authTenant,clean}=require('../_shared/items');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);

  const id=clean(ctx.body.item_id);
  const targetId=clean(ctx.body.target_item_id);
  const position=String(ctx.body.position||'inside').toLowerCase();
  if(!id||!targetId||!['inside','before','after'].includes(position)){
    return ctx.send(400,{error:'Item id, target item id, and position are required'});
  }
  if(id===targetId)return ctx.send(400,{error:'An item cannot be dropped onto itself'});

  const pair=await ctx.broker('core_objectsphere','query',{
    text:`SELECT item_id
          FROM objectsphere_item
          WHERE tenant_id=$1 AND status='active' AND item_id = ANY($2::uuid[])`,
    values:[access.tenantId,[id,targetId]]
  });
  if(pair.rowCount!==2)return ctx.send(404,{error:'Item or target item not found'});

  const cycle=await ctx.broker('core_objectsphere','query',{
    text:`WITH RECURSIVE subtree AS (
            SELECT item_id FROM objectsphere_item WHERE tenant_id=$1 AND item_id=$2 AND status='active'
            UNION ALL
            SELECT child.item_id
            FROM objectsphere_item child
            JOIN subtree parent ON parent.item_id=child.parent_item_id
            WHERE child.tenant_id=$1 AND child.status='active'
          )
          SELECT 1 FROM subtree WHERE item_id=$3 LIMIT 1`,
    values:[access.tenantId,id,targetId]
  });
  if(cycle.rowCount)return ctx.send(400,{error:'An item cannot be moved relative to one of its children'});

  const r=await ctx.broker('core_objectsphere','query',{
    text:`WITH target AS (
            SELECT t.*,
                   CASE WHEN $4='inside' THEN t.item_id ELSE t.parent_item_id END new_parent_item_id,
                   CASE
                     WHEN $4='before' THEN t.sort_order::numeric - 0.5
                     WHEN $4='after' THEN t.sort_order::numeric + 0.5
                     ELSE (
                       SELECT COALESCE(MAX(child.sort_order),0)::numeric + 1
                       FROM objectsphere_item child
                       WHERE child.tenant_id=$1
                       AND child.status='active'
                       AND child.parent_item_id IS NOT DISTINCT FROM t.item_id
                     )
                   END desired_sort_order
            FROM objectsphere_item t
            WHERE t.tenant_id=$1 AND t.item_id=$3 AND t.status='active'
          ),
          moved AS (
            UPDATE objectsphere_item i
            SET parent_item_id=(SELECT new_parent_item_id FROM target),
                sort_order=(SELECT desired_sort_order::integer FROM target),
                updated_by_email=$5,
                updated_at=now()
            WHERE i.tenant_id=$1 AND i.item_id=$2 AND i.status='active'
            RETURNING i.item_id
          ),
          ordered AS (
            SELECT i.item_id,
                   (row_number() OVER (
                     ORDER BY
                       CASE WHEN i.item_id=$2 THEN target.desired_sort_order ELSE i.sort_order::numeric END,
                       CASE
                         WHEN $4='before' AND i.item_id=$2 THEN 0
                         WHEN $4='before' AND i.item_id=$3 THEN 1
                         WHEN $4='after' AND i.item_id=$3 THEN 0
                         WHEN $4='after' AND i.item_id=$2 THEN 1
                         ELSE 2
                       END,
                       i.item_name
                   ) * 10)::integer new_sort_order
            FROM objectsphere_item i
            CROSS JOIN target
            WHERE i.tenant_id=$1
            AND i.status='active'
            AND i.parent_item_id IS NOT DISTINCT FROM target.new_parent_item_id
          )
          UPDATE objectsphere_item i
          SET sort_order=ordered.new_sort_order,
              updated_by_email=$5,
              updated_at=now()
          FROM ordered
          WHERE i.item_id=ordered.item_id
          RETURNING i.item_id,tenant_id,parent_item_id,item_name,item_description,quantity,sort_order,status,created_at,updated_at`,
    values:[access.tenantId,id,targetId,position,access.auth.email]
  });
  return {items:r.rows};
};
