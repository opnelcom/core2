'use strict';
const {ensureSchema,authTenant,clean}=require('../_shared/items');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const itemId=clean(ctx.query.item_id||ctx.body.item_id);
  if(!itemId)return ctx.send(400,{error:'Item id is required'});
  const r=await ctx.broker('core_objectsphere','transaction',{statements:[
    {text:`SELECT object_type_id,type_name,type_description,sort_order,status
           FROM objectsphere_object_type
           WHERE tenant_id=$1 AND status='active' AND deleted=false
           ORDER BY sort_order,type_name`,values:[access.tenantId]},
    {text:`SELECT attribute_id,object_type_id,attribute_name,attribute_type,sort_order,status
           FROM objectsphere_attribute
           WHERE tenant_id=$1 AND status='active' AND deleted=false
           ORDER BY object_type_id,sort_order,attribute_name`,values:[access.tenantId]},
    {text:`SELECT object_type_id,status
           FROM objectsphere_item_type
           WHERE tenant_id=$1 AND item_id=$2`,values:[access.tenantId,itemId]},
    {text:`SELECT v.attribute_id,v.value_text
           FROM objectsphere_attribute_value v
           JOIN objectsphere_attribute a ON a.attribute_id=v.attribute_id
           JOIN objectsphere_object_type t ON t.object_type_id=a.object_type_id
           WHERE v.tenant_id=$1 AND v.item_id=$2 AND a.status='active' AND a.deleted=false AND t.deleted=false`,values:[access.tenantId,itemId]}
  ]});
  return {
    object_types:r.results[0].rows,
    attributes:r.results[1].rows,
    item_types:r.results[2].rows,
    values:r.results[3].rows
  };
};
