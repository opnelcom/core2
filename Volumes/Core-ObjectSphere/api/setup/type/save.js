'use strict';
const {ensureSchema,authTenant,clean}=require('../../_shared/items');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const id=clean(ctx.body.object_type_id);
  const name=clean(ctx.body.type_name);
  const description=String(ctx.body.type_description||'');
  const status=clean(ctx.body.status)||'active';
  if(!name)return ctx.send(400,{error:'Object type name is required'});
  if(!['active','disabled'].includes(status))return ctx.send(400,{error:'Invalid object type status'});
  const r=await ctx.broker('core_objectsphere','query',{
    text:`WITH next_order AS (
            SELECT COALESCE(MAX(sort_order),0)+10 sort_order FROM objectsphere_object_type WHERE tenant_id=$1
          )
          INSERT INTO objectsphere_object_type(object_type_id,tenant_id,type_name,type_description,sort_order,status,deleted)
          SELECT COALESCE($2::uuid,gen_random_uuid()),$1,$3,$4,COALESCE($5::integer,sort_order),$6,false FROM next_order
          ON CONFLICT(object_type_id) DO UPDATE
          SET type_name=excluded.type_name,type_description=excluded.type_description,status=excluded.status,updated_at=now()
          WHERE objectsphere_object_type.deleted=false
          RETURNING object_type_id,tenant_id,type_name,type_description,sort_order,status,deleted,created_at,updated_at`,
    values:[access.tenantId,id,name,description,ctx.body.sort_order||null,status]
  });
  if(!r.rowCount)return ctx.send(404,{error:'Object type not found'});
  return {object_type:r.rows[0]};
};
