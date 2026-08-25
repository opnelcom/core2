'use strict';
const {ensureSchema,authTenant,clean}=require('../../_shared/items');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const id=clean(ctx.body.attribute_id);
  const typeId=clean(ctx.body.object_type_id);
  const name=clean(ctx.body.attribute_name);
  const attributeType=clean(ctx.body.attribute_type)||'text';
  const status=clean(ctx.body.status)||'active';
  if(!typeId||!name)return ctx.send(400,{error:'Object type and attribute name are required'});
  if(!['text','large_text','date','number','float','currency'].includes(attributeType))return ctx.send(400,{error:'Invalid attribute type'});
  if(!['active','disabled'].includes(status))return ctx.send(400,{error:'Invalid attribute status'});
  const owner=await ctx.broker('core_objectsphere','query',{text:`SELECT object_type_id FROM objectsphere_object_type WHERE tenant_id=$1 AND object_type_id=$2 AND deleted=false`,values:[access.tenantId,typeId]});
  if(!owner.rowCount)return ctx.send(404,{error:'Object type not found'});
  const r=await ctx.broker('core_objectsphere','query',{
    text:`WITH next_order AS (
            SELECT COALESCE(MAX(sort_order),0)+10 sort_order FROM objectsphere_attribute WHERE tenant_id=$1 AND object_type_id=$2
          )
          INSERT INTO objectsphere_attribute(attribute_id,tenant_id,object_type_id,attribute_name,attribute_type,sort_order,status,deleted)
          SELECT COALESCE($3::uuid,gen_random_uuid()),$1,$2,$4,$5,COALESCE($6::integer,sort_order),$7,false FROM next_order
          ON CONFLICT(attribute_id) DO UPDATE
          SET attribute_name=excluded.attribute_name,attribute_type=excluded.attribute_type,status=excluded.status,updated_at=now()
          WHERE objectsphere_attribute.deleted=false
          RETURNING attribute_id,tenant_id,object_type_id,attribute_name,attribute_type,sort_order,status,deleted,created_at,updated_at`,
    values:[access.tenantId,typeId,id,name,attributeType,ctx.body.sort_order||null,status]
  });
  if(!r.rowCount)return ctx.send(404,{error:'Attribute not found'});
  return {attribute:r.rows[0]};
};
