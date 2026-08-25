'use strict';
const {ensureSchema,authTenant,clean}=require('../../_shared/items');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const itemId=clean(ctx.query.item_id||ctx.body.item_id);
  const attributeId=clean(ctx.query.attribute_id||ctx.body.attribute_id);
  if(!itemId||!attributeId)return ctx.send(400,{error:'Item id and attribute id are required'});
  const r=await ctx.broker('core_objectsphere','query',{
    text:`SELECT history_id,item_id,attribute_id,object_type_id,item_name,object_type_name,attribute_name,
                 old_value_text,new_value_text,changed_by_email,changed_at
          FROM objectsphere_attribute_value_history
          WHERE tenant_id=$1 AND item_id=$2 AND attribute_id=$3
          ORDER BY changed_at DESC
          LIMIT 100`,
    values:[access.tenantId,itemId,attributeId]
  });
  return {history:r.rows};
};
