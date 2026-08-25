'use strict';
const {ensureSchema,authTenant,clean,quantity}=require('../_shared/items');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const name=clean(ctx.body.item_name);
  const description=String(ctx.body.item_description||'');
  const parentId=clean(ctx.body.parent_item_id);
  const itemQuantity=quantity(ctx.body.quantity)||1;
  if(!name)return ctx.send(400,{error:'Item name is required'});
  if(parentId){
    const parent=await ctx.broker('core_objectsphere','query',{text:`SELECT item_id FROM objectsphere_item WHERE tenant_id=$1 AND item_id=$2 AND status='active'`,values:[access.tenantId,parentId]});
    if(!parent.rowCount)return ctx.send(400,{error:'Parent item not found'});
  }
  const r=await ctx.broker('core_objectsphere','query',{
    text:`WITH next_order AS (
            SELECT COALESCE(MAX(sort_order),0)+1 sort_order
            FROM objectsphere_item
            WHERE tenant_id=$1 AND parent_item_id IS NOT DISTINCT FROM $2::uuid AND status='active'
          )
          INSERT INTO objectsphere_item(tenant_id,parent_item_id,item_name,item_description,quantity,sort_order,created_by_email,updated_by_email)
          SELECT $1,$2::uuid,$3,$4,$5,sort_order,$6,$6 FROM next_order
          RETURNING item_id,tenant_id,parent_item_id,item_name,item_description,quantity,latitude::float AS latitude,longitude::float AS longitude,sort_order,status,created_at,updated_at`,
    values:[access.tenantId,parentId,name,description,itemQuantity,access.auth.email]
  });
  return ctx.send(201,{item:r.rows[0]});
};
