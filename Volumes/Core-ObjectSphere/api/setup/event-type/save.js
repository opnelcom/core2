'use strict';
const {ensureSchema,authTenant,clean}=require('../../_shared/items');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const id=clean(ctx.body.event_type_id);
  const name=clean(ctx.body.type_name);
  const description=String(ctx.body.type_description||'');
  const defaultSeverity=clean(ctx.body.default_severity)||'medium';
  const status=clean(ctx.body.status)||'active';
  if(!name)return ctx.send(400,{error:'Event type name is required'});
  if(!['low','medium','high','critical'].includes(defaultSeverity))return ctx.send(400,{error:'Invalid default severity'});
  if(!['active','disabled'].includes(status))return ctx.send(400,{error:'Invalid event type status'});
  const r=await ctx.broker('core_objectsphere','query',{
    text:`WITH next_order AS (
            SELECT COALESCE(MAX(sort_order),0)+10 sort_order FROM objectsphere_event_type WHERE tenant_id=$1
          )
          INSERT INTO objectsphere_event_type(event_type_id,tenant_id,type_name,type_description,sort_order,default_severity,status,deleted)
          SELECT COALESCE($2::uuid,gen_random_uuid()),$1,$3,$4,COALESCE($5::integer,sort_order),$6,$7,false FROM next_order
          ON CONFLICT(event_type_id) DO UPDATE
          SET type_name=excluded.type_name,
              type_description=excluded.type_description,
              default_severity=excluded.default_severity,
              status=excluded.status,
              updated_at=now()
          WHERE objectsphere_event_type.tenant_id=$1 AND objectsphere_event_type.deleted=false
          RETURNING event_type_id,tenant_id,type_name,type_description,sort_order,default_severity,status,deleted,created_at,updated_at`,
    values:[access.tenantId,id,name,description,ctx.body.sort_order||null,defaultSeverity,status]
  });
  if(!r.rowCount)return ctx.send(404,{error:'Event type not found'});
  return {event_type:r.rows[0]};
};
