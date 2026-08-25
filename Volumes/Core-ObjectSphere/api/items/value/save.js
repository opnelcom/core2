'use strict';
const {ensureSchema,authTenant,clean}=require('../../_shared/items');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const itemId=clean(ctx.body.item_id);
  const attributeId=clean(ctx.body.attribute_id);
  const value=ctx.body.value_text===undefined?null:String(ctx.body.value_text);
  if(!itemId||!attributeId)return ctx.send(400,{error:'Item id and attribute id are required'});
  const ownership=await ctx.broker('core_objectsphere','query',{
    text:`SELECT a.attribute_id,a.object_type_id,a.attribute_name,t.type_name,i.item_name
          FROM objectsphere_attribute a
          JOIN objectsphere_object_type t ON t.object_type_id=a.object_type_id
          JOIN objectsphere_item_type it ON it.object_type_id=a.object_type_id
          JOIN objectsphere_item i ON i.item_id=it.item_id
          WHERE a.tenant_id=$1
          AND a.attribute_id=$3
          AND a.status='active'
          AND a.deleted=false
          AND t.deleted=false
          AND it.item_id=$2
          AND it.status='active'
          AND i.status='active'`,
    values:[access.tenantId,itemId,attributeId]
  });
  if(!ownership.rowCount)return ctx.send(400,{error:'Attribute is not active for this item'});
  const meta=ownership.rows[0];
  const r=await ctx.broker('core_objectsphere','query',{
    text:`WITH previous AS (
            SELECT value_text
            FROM objectsphere_attribute_value
            WHERE tenant_id=$1 AND item_id=$2 AND attribute_id=$3
          ),
          saved AS (
            INSERT INTO objectsphere_attribute_value(tenant_id,item_id,attribute_id,value_text)
            VALUES($1,$2,$3,$4)
            ON CONFLICT(item_id,attribute_id) DO UPDATE
            SET value_text=excluded.value_text,updated_at=now()
            RETURNING value_id,attribute_id,value_text,updated_at
          ),
          history AS (
            INSERT INTO objectsphere_attribute_value_history(
              tenant_id,item_id,attribute_id,object_type_id,item_name,object_type_name,attribute_name,old_value_text,new_value_text,changed_by_email
            )
            SELECT $1,$2,$3,$5,$6,$7,$8,(SELECT value_text FROM previous),$4,$9
            WHERE (SELECT value_text FROM previous) IS DISTINCT FROM $4
            RETURNING history_id
          )
          SELECT saved.value_id,saved.attribute_id,saved.value_text,saved.updated_at,EXISTS(SELECT 1 FROM history) AS history_recorded
          FROM saved`,
    values:[access.tenantId,itemId,attributeId,value,meta.object_type_id,meta.item_name||'',meta.type_name||'',meta.attribute_name||'',access.auth.email]
  });
  return {
    value:{
      value_id:r.rows[0].value_id,
      attribute_id:r.rows[0].attribute_id,
      value_text:r.rows[0].value_text,
      updated_at:r.rows[0].updated_at
    },
    history_recorded:r.rows[0].history_recorded
  };
};
