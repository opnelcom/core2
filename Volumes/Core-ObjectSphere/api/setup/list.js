'use strict';
const {ensureSchema,authTenant}=require('../_shared/items');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const r=await ctx.broker('core_objectsphere','transaction',{statements:[
    {text:`SELECT object_type_id,tenant_id,type_name,type_description,sort_order,status,deleted,created_at,updated_at
           FROM objectsphere_object_type
           WHERE tenant_id=$1 AND deleted=false
           ORDER BY sort_order,type_name`,values:[access.tenantId]},
    {text:`SELECT a.attribute_id,a.tenant_id,a.object_type_id,t.type_name,a.attribute_name,a.attribute_type,a.sort_order,a.status,a.deleted,a.created_at,a.updated_at
           FROM objectsphere_attribute a
           JOIN objectsphere_object_type t ON t.object_type_id=a.object_type_id
           WHERE a.tenant_id=$1 AND a.deleted=false AND t.deleted=false
           ORDER BY t.sort_order,t.type_name,a.sort_order,a.attribute_name`,values:[access.tenantId]},
    {text:`SELECT it.object_type_id,COUNT(*)::int AS item_count
           FROM objectsphere_item_type it
           JOIN objectsphere_object_type t ON t.object_type_id=it.object_type_id
           WHERE it.tenant_id=$1 AND it.status='active' AND t.deleted=false
           GROUP BY it.object_type_id`,values:[access.tenantId]},
    {text:`SELECT event_type_id,tenant_id,type_name,type_description,sort_order,default_severity,status,deleted,created_at,updated_at
           FROM objectsphere_event_type
           WHERE tenant_id=$1 AND deleted=false
           ORDER BY sort_order,type_name`,values:[access.tenantId]},
    {text:`SELECT event_type_id,COUNT(*)::int AS event_count
           FROM objectsphere_event
           WHERE tenant_id=$1 AND deleted=false
           GROUP BY event_type_id`,values:[access.tenantId]}
  ]});
  return {
    object_types:r.results[0].rows,
    attributes:r.results[1].rows,
    type_counts:r.results[2].rows,
    event_types:r.results[3].rows,
    event_type_counts:r.results[4].rows,
    attribute_types:['text','large_text','date','number','float','currency'],
    event_severities:['low','medium','high','critical'],
    event_statuses:['open','in_review','resolved','closed']
  };
};
