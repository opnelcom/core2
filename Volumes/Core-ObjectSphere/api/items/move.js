'use strict';
const {ensureSchema,authTenant,clean}=require('../_shared/items');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const id=clean(ctx.body.item_id);
  const parentId=clean(ctx.body.parent_item_id);
  if(!id)return ctx.send(400,{error:'Item id is required'});
  if(id===parentId)return ctx.send(400,{error:'An item cannot be moved under itself'});
  const item=await ctx.broker('core_objectsphere','query',{text:`SELECT item_id FROM objectsphere_item WHERE tenant_id=$1 AND item_id=$2 AND status='active'`,values:[access.tenantId,id]});
  if(!item.rowCount)return ctx.send(404,{error:'Item not found'});
  if(parentId){
    const parent=await ctx.broker('core_objectsphere','query',{text:`SELECT item_id FROM objectsphere_item WHERE tenant_id=$1 AND item_id=$2 AND status='active'`,values:[access.tenantId,parentId]});
    if(!parent.rowCount)return ctx.send(400,{error:'New parent item not found'});
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
      values:[access.tenantId,id,parentId]
    });
    if(cycle.rowCount)return ctx.send(400,{error:'An item cannot be moved under one of its children'});
  }
  const r=await ctx.broker('core_objectsphere','query',{
    text:`WITH next_order AS (
            SELECT COALESCE(MAX(sort_order),0)+1 sort_order
            FROM objectsphere_item
            WHERE tenant_id=$1 AND parent_item_id IS NOT DISTINCT FROM $3::uuid AND status='active'
          )
          UPDATE objectsphere_item
          SET parent_item_id=$3::uuid,sort_order=(SELECT sort_order FROM next_order),updated_by_email=$4,updated_at=now()
          WHERE tenant_id=$1 AND item_id=$2 AND status='active'
          RETURNING item_id,tenant_id,parent_item_id,item_name,item_description,quantity,sort_order,status,created_at,updated_at`,
    values:[access.tenantId,id,parentId,access.auth.email]
  });
  return {item:r.rows[0]};
};
