'use strict';
const {ensureSchema,authTenant,clean}=require('../../_shared/items');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const itemId=clean(ctx.body.item_id);
  const typeId=clean(ctx.body.object_type_id);
  const enabled=ctx.body.enabled===true||ctx.body.enabled==='true';
  if(!itemId||!typeId)return ctx.send(400,{error:'Item id and object type id are required'});
  const ownership=await ctx.broker('core_objectsphere','query',{
    text:`SELECT
            EXISTS(SELECT 1 FROM objectsphere_item WHERE tenant_id=$1 AND item_id=$2 AND status='active') item_exists,
            EXISTS(SELECT 1 FROM objectsphere_object_type WHERE tenant_id=$1 AND object_type_id=$3 AND status='active' AND deleted=false) type_exists`,
    values:[access.tenantId,itemId,typeId]
  });
  if(!ownership.rows[0]?.item_exists)return ctx.send(404,{error:'Item not found'});
  if(!ownership.rows[0]?.type_exists)return ctx.send(404,{error:'Object type not found'});
  const r=await ctx.broker('core_objectsphere','query',{
    text:`INSERT INTO objectsphere_item_type(tenant_id,item_id,object_type_id,status)
          VALUES($1,$2,$3,$4)
          ON CONFLICT(item_id,object_type_id) DO UPDATE
          SET status=excluded.status,updated_at=now()
          RETURNING item_type_id,object_type_id,status`,
    values:[access.tenantId,itemId,typeId,enabled?'active':'disabled']
  });
  return {item_type:r.rows[0]};
};
