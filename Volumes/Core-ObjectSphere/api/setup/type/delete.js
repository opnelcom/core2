'use strict';
const {ensureSchema,authTenant,clean}=require('../../_shared/items');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST'&&ctx.req.method!=='DELETE')return ctx.send(405,{error:'POST or DELETE required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const id=clean(ctx.body.object_type_id||ctx.query.object_type_id);
  if(!id)return ctx.send(400,{error:'Object type id is required'});
  const r=await ctx.broker('core_objectsphere','query',{
    text:`UPDATE objectsphere_object_type
          SET deleted=true,deleted_at=now(),updated_at=now()
          WHERE tenant_id=$1 AND object_type_id=$2 AND deleted=false
          RETURNING object_type_id`,
    values:[access.tenantId,id]
  });
  if(!r.rowCount)return ctx.send(404,{error:'Object type not found'});
  return {deleted:r.rowCount};
};
