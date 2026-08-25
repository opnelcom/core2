'use strict';
const {ensureSchema,authTenant,clean}=require('../../_shared/items');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const typeId=clean(ctx.query.object_type_id||ctx.body.object_type_id);
  if(!typeId)return ctx.send(400,{error:'Object type id is required'});
  const owner=await ctx.broker('core_objectsphere','query',{
    text:`SELECT object_type_id,type_name
          FROM objectsphere_object_type
          WHERE tenant_id=$1 AND object_type_id=$2 AND deleted=false`,
    values:[access.tenantId,typeId]
  });
  if(!owner.rowCount)return ctx.send(404,{error:'Object type not found'});
  const r=await ctx.broker('core_objectsphere','query',{
    text:`SELECT i.item_id,i.parent_item_id,i.item_name,i.item_description,i.quantity,i.sort_order,i.status,i.created_at,i.updated_at,
                 p.item_name AS parent_item_name
          FROM objectsphere_item_type it
          JOIN objectsphere_item i ON i.item_id=it.item_id
          LEFT JOIN objectsphere_item p ON p.item_id=i.parent_item_id
          WHERE it.tenant_id=$1
          AND it.object_type_id=$2
          AND it.status='active'
          AND i.status='active'
          ORDER BY i.item_name`,
    values:[access.tenantId,typeId]
  });
  return {object_type:owner.rows[0],items:r.rows};
};
