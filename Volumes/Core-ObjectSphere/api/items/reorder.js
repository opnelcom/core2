'use strict';
const {ensureSchema,authTenant,clean}=require('../_shared/items');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const id=clean(ctx.body.item_id);
  const direction=String(ctx.body.direction||'').toLowerCase();
  if(!id||!['up','down'].includes(direction))return ctx.send(400,{error:'Item id and direction are required'});
  const r=await ctx.broker('core_objectsphere','query',{
    text:`WITH current_item AS (
            SELECT * FROM objectsphere_item WHERE tenant_id=$1 AND item_id=$2 AND status='active'
          ),
          sibling AS (
            SELECT s.*
            FROM objectsphere_item s
            CROSS JOIN current_item c
            WHERE s.tenant_id=$1
            AND s.status='active'
            AND s.parent_item_id IS NOT DISTINCT FROM c.parent_item_id
            AND s.item_id<>c.item_id
            AND (($3='up' AND (s.sort_order,s.item_name) < (c.sort_order,c.item_name))
              OR ($3='down' AND (s.sort_order,s.item_name) > (c.sort_order,c.item_name)))
            ORDER BY
              CASE WHEN $3='up' THEN s.sort_order END DESC,
              CASE WHEN $3='down' THEN s.sort_order END ASC,
              s.item_name
            LIMIT 1
          ),
          update_current AS (
            UPDATE objectsphere_item i
            SET sort_order=(SELECT sort_order FROM sibling),updated_by_email=$4,updated_at=now()
            WHERE i.item_id=(SELECT item_id FROM current_item) AND EXISTS(SELECT 1 FROM sibling)
            RETURNING i.item_id
          )
          UPDATE objectsphere_item i
          SET sort_order=(SELECT sort_order FROM current_item),updated_by_email=$4,updated_at=now()
          WHERE i.item_id=(SELECT item_id FROM sibling) AND EXISTS(SELECT 1 FROM update_current)
          RETURNING i.item_id`,
    values:[access.tenantId,id,direction,access.auth.email]
  });
  return {moved:r.rowCount>0};
};
