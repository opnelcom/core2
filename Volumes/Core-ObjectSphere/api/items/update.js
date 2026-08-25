'use strict';
const {ensureSchema,authTenant,clean,quantity}=require('../_shared/items');

function coordinate(value,min,max){
  if(value===''||value===null||value===undefined)return null;
  const parsed=Number(value);
  if(!Number.isFinite(parsed)||parsed<min||parsed>max)return undefined;
  return parsed;
}

module.exports=async ctx=>{
  if(ctx.req.method!=='POST'&&ctx.req.method!=='PATCH')return ctx.send(405,{error:'POST or PATCH required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const id=clean(ctx.body.item_id);
  const name=clean(ctx.body.item_name);
  const description=String(ctx.body.item_description||'');
  const itemQuantity=quantity(ctx.body.quantity);
  const locationProvided=Object.prototype.hasOwnProperty.call(ctx.body,'latitude')||Object.prototype.hasOwnProperty.call(ctx.body,'longitude');
  const latitude=coordinate(ctx.body.latitude,-90,90);
  const longitude=coordinate(ctx.body.longitude,-180,180);
  if(!id||!name)return ctx.send(400,{error:'Item id and name are required'});
  if(!itemQuantity)return ctx.send(400,{error:'Quantity must be greater than zero'});
  if(locationProvided&&(latitude===undefined||longitude===undefined))return ctx.send(400,{error:'Invalid latitude or longitude'});
  if(locationProvided&&((latitude===null)!==(longitude===null)))return ctx.send(400,{error:'Latitude and longitude must both be set'});
  const r=await ctx.broker('core_objectsphere','query',{
    text:`UPDATE objectsphere_item
          SET item_name=$3,
              item_description=$4,
              quantity=$5,
              updated_by_email=$6,
              latitude=CASE WHEN $7 THEN $8::numeric ELSE latitude END,
              longitude=CASE WHEN $7 THEN $9::numeric ELSE longitude END,
              updated_at=now()
          WHERE tenant_id=$1 AND item_id=$2 AND status='active'
          RETURNING item_id,tenant_id,parent_item_id,item_name,item_description,quantity,latitude::float AS latitude,longitude::float AS longitude,sort_order,status,created_at,updated_at`,
    values:[access.tenantId,id,name,description,itemQuantity,access.auth.email,locationProvided,latitude,longitude]
  });
  if(!r.rowCount)return ctx.send(404,{error:'Item not found'});
  return {item:r.rows[0]};
};
