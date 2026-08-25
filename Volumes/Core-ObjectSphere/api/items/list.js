'use strict';
const {ensureSchema,authTenant}=require('../_shared/items');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const r=await ctx.broker('core_objectsphere','query',{
    text:`SELECT item_id,tenant_id,parent_item_id,item_name,item_description,quantity,latitude::float AS latitude,longitude::float AS longitude,sort_order,status,created_at,updated_at
          FROM objectsphere_item
          WHERE tenant_id=$1 AND status='active'
          ORDER BY COALESCE(parent_item_id::text,''),sort_order,item_name`,
    values:[access.tenantId]
  });
  return {items:r.rows};
};
