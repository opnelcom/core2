'use strict';
const {ensureSchema,authTenant,clean}=require('../../_shared/items');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);

  const itemId=clean(ctx.body.item_id);
  const values=Array.isArray(ctx.body.values)?ctx.body.values:[];
  if(!itemId)return ctx.send(400,{error:'Item id is required'});
  if(!values.length)return ctx.send(400,{error:'At least one attribute value is required'});
  if(values.length>60)return ctx.send(400,{error:'Enhancement is limited to 60 values at a time'});

  const meta=await ctx.broker('core_objectsphere','transaction',{statements:[
    {text:`SELECT item_id,item_name FROM objectsphere_item WHERE tenant_id=$1 AND item_id=$2 AND status='active'`,values:[access.tenantId,itemId]},
    {text:`SELECT a.attribute_id,a.object_type_id,a.attribute_name,t.type_name
           FROM objectsphere_attribute a
           JOIN objectsphere_object_type t ON t.object_type_id=a.object_type_id
           JOIN objectsphere_item_type it ON it.object_type_id=a.object_type_id
           WHERE a.tenant_id=$1
           AND it.item_id=$2
           AND it.status='active'
           AND a.status='active'
           AND a.deleted=false
           AND t.status='active'
           AND t.deleted=false`,values:[access.tenantId,itemId]}
  ]});
  const item=meta.results[0].rows[0];
  if(!item)return ctx.send(404,{error:'Item not found'});
  const attrById=new Map(meta.results[1].rows.map(attribute=>[attribute.attribute_id,attribute]));

  const saved=[];
  for(const incoming of values){
    const attributeId=clean(incoming.attribute_id);
    const valueText=incoming.value_text===undefined?null:String(incoming.value_text).trim();
    const attribute=attrById.get(attributeId);
    if(!attribute||!valueText)continue;
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
      values:[access.tenantId,itemId,attributeId,valueText,attribute.object_type_id,item.item_name||'',attribute.type_name||'',attribute.attribute_name||'',access.auth.email]
    });
    saved.push({
      value_id:r.rows[0].value_id,
      attribute_id:r.rows[0].attribute_id,
      value_text:r.rows[0].value_text,
      updated_at:r.rows[0].updated_at,
      history_recorded:r.rows[0].history_recorded
    });
  }

  if(!saved.length)return ctx.send(400,{error:'No valid enhancement values were selected'});
  ctx.logger.info('item enhancement confirmed',{requestId:ctx.requestId,itemId,savedCount:saved.length});
  return {item_id:itemId,saved};
};
