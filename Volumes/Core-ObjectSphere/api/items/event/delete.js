'use strict';
const {ensureSchema,authTenant,clean}=require('../../_shared/items');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST'&&ctx.req.method!=='DELETE')return ctx.send(405,{error:'POST or DELETE required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const eventId=clean(ctx.body.event_id||ctx.query.event_id);
  if(!eventId)return ctx.send(400,{error:'Event id is required'});
  const r=await ctx.broker('core_objectsphere','query',{
    text:`UPDATE objectsphere_event
          SET deleted=true,deleted_at=now(),updated_at=now(),updated_by_email=$3
          WHERE tenant_id=$1 AND event_id=$2 AND deleted=false
          RETURNING event_id`,
    values:[access.tenantId,eventId,access.auth.email]
  });
  if(!r.rowCount)return ctx.send(404,{error:'Event not found'});
  return {deleted:r.rowCount};
};
