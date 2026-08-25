'use strict';
const {ensureSchema,authTenant,clean}=require('../../_shared/items');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const eventId=clean(ctx.body.event_id);
  const itemId=clean(ctx.body.item_id);
  const eventTypeId=clean(ctx.body.event_type_id);
  const title=clean(ctx.body.event_title);
  const description=String(ctx.body.event_description||'');
  const eventAt=clean(ctx.body.event_at);
  const severity=clean(ctx.body.severity)||'medium';
  const eventStatus=clean(ctx.body.status)||'open';
  const reportedBy=String(ctx.body.reported_by_email||'').trim();
  if(!itemId||!eventTypeId)return ctx.send(400,{error:'Item id and event type are required'});
  if(!title)return ctx.send(400,{error:'Event title is required'});
  if(!['low','medium','high','critical'].includes(severity))return ctx.send(400,{error:'Invalid severity'});
  if(!['open','in_review','resolved','closed'].includes(eventStatus))return ctx.send(400,{error:'Invalid event status'});
  const ownership=await ctx.broker('core_objectsphere','query',{
    text:`SELECT i.item_id,et.event_type_id
          FROM objectsphere_item i
          JOIN objectsphere_event_type et ON et.tenant_id=i.tenant_id
          WHERE i.tenant_id=$1
          AND i.item_id=$2
          AND i.status='active'
          AND et.event_type_id=$3
          AND et.deleted=false
          AND (et.status='active' OR $4::uuid IS NOT NULL)`,
    values:[access.tenantId,itemId,eventTypeId,eventId]
  });
  if(!ownership.rowCount)return ctx.send(400,{error:'Active item and event type are required'});
  const r=await ctx.broker('core_objectsphere','query',{
    text:`INSERT INTO objectsphere_event(
            event_id,tenant_id,item_id,event_type_id,event_title,event_description,event_at,severity,status,reported_by_email,created_by_email,updated_by_email,deleted
          )
          VALUES(COALESCE($2::uuid,gen_random_uuid()),$1,$3,$4,$5,$6,COALESCE($7::timestamptz,now()),$8,$9,$10,$11,$11,false)
          ON CONFLICT(event_id) DO UPDATE
          SET event_type_id=excluded.event_type_id,
              event_title=excluded.event_title,
              event_description=excluded.event_description,
              event_at=excluded.event_at,
              severity=excluded.severity,
              status=excluded.status,
              reported_by_email=excluded.reported_by_email,
              updated_by_email=excluded.updated_by_email,
              updated_at=now()
          WHERE objectsphere_event.tenant_id=$1 AND objectsphere_event.item_id=$3 AND objectsphere_event.deleted=false
          RETURNING event_id,item_id,event_type_id,event_title,event_description,event_at,severity,status,reported_by_email,created_by_email,updated_by_email,created_at,updated_at`,
    values:[access.tenantId,eventId,itemId,eventTypeId,title,description,eventAt,severity,eventStatus,reportedBy,access.auth.email]
  });
  if(!r.rowCount)return ctx.send(404,{error:'Event not found'});
  return {event:r.rows[0]};
};
