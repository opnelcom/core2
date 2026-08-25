'use strict';
const {ensureSchema,authTenant,clean}=require('../../_shared/items');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const typeId=clean(ctx.body.object_type_id);
  const ids=Array.isArray(ctx.body.attribute_ids)?ctx.body.attribute_ids.map(clean).filter(Boolean):[];
  if(!typeId||!ids.length)return ctx.send(400,{error:'Object type id and attribute ids are required'});
  const r=await ctx.broker('core_objectsphere','query',{
    text:`WITH ordered AS (
            SELECT attribute_id,ordinality::int * 10 AS sort_order
            FROM unnest($3::uuid[]) WITH ORDINALITY AS ordered(attribute_id,ordinality)
          ),
          owned AS (
            SELECT a.attribute_id
            FROM objectsphere_attribute a
            JOIN objectsphere_object_type t ON t.object_type_id=a.object_type_id
            WHERE a.tenant_id=$1
            AND a.object_type_id=$2
            AND a.deleted=false
            AND t.deleted=false
          )
          UPDATE objectsphere_attribute a
          SET sort_order=o.sort_order,updated_at=now()
          FROM ordered o
          JOIN owned own ON own.attribute_id=o.attribute_id
          WHERE a.attribute_id=o.attribute_id
          RETURNING a.attribute_id,a.sort_order`,
    values:[access.tenantId,typeId,ids]
  });
  if(r.rowCount!==ids.length)return ctx.send(400,{error:'One or more attributes do not belong to this object type'});
  return {attributes:r.rows};
};
