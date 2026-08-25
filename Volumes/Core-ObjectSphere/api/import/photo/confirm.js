'use strict';
const {ensureSchema,authTenant,clean,quantity}=require('../../_shared/items');

function parseDataUrl(value){
  const match=String(value||'').match(/^data:([^;,]+);base64,([a-zA-Z0-9+/=\r\n]+)$/);
  if(!match)return null;
  return {mimeType:match[1],base64:match[2].replace(/\s/g,'')};
}

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);

  const parentId=clean(ctx.body.parent_item_id);
  const objects=Array.isArray(ctx.body.objects)?ctx.body.objects:[];
  if(!parentId)return ctx.send(400,{error:'Parent item is required'});
  if(!objects.length)return ctx.send(400,{error:'At least one object is required'});
  if(objects.length>50)return ctx.send(400,{error:'Import is limited to 50 objects at a time'});

  const setup=await ctx.broker('core_objectsphere','transaction',{statements:[
    {text:`SELECT item_id,item_name FROM objectsphere_item WHERE tenant_id=$1 AND item_id=$2 AND status='active'`,values:[access.tenantId,parentId]},
    {text:`SELECT object_type_id,type_name FROM objectsphere_object_type WHERE tenant_id=$1 AND status='active' AND deleted=false`,values:[access.tenantId]},
    {text:`SELECT a.attribute_id,a.object_type_id,a.attribute_name,t.type_name
           FROM objectsphere_attribute a
           JOIN objectsphere_object_type t ON t.object_type_id=a.object_type_id
           WHERE a.tenant_id=$1 AND a.status='active' AND a.deleted=false AND t.deleted=false`,values:[access.tenantId]}
  ]});
  const parent=setup.results[0].rows[0];
  if(!parent)return ctx.send(404,{error:'Parent item not found'});
  const typeIds=new Set(setup.results[1].rows.map(type=>type.object_type_id));
  const attrById=new Map(setup.results[2].rows.map(attribute=>[attribute.attribute_id,attribute]));

  const created=[];
  for(const object of objects){
    const name=clean(object.item_name);
    if(!name)continue;
    const description=String(object.item_description||'');
    const itemQuantity=quantity(object.quantity)||1;
    const createdItem=await ctx.broker('core_objectsphere','query',{
      text:`WITH next_order AS (
              SELECT COALESCE(MAX(sort_order),0)+1 sort_order
              FROM objectsphere_item
              WHERE tenant_id=$1 AND parent_item_id=$2 AND status='active'
            )
            INSERT INTO objectsphere_item(tenant_id,parent_item_id,item_name,item_description,quantity,sort_order,created_by_email,updated_by_email)
            SELECT $1,$2,$3,$4,$5,sort_order,$6,$6 FROM next_order
            RETURNING item_id,item_name,quantity`,
      values:[access.tenantId,parentId,name,description,itemQuantity,access.auth.email]
    });
    const item=createdItem.rows[0];
    const typeId=clean(object.object_type_id);
    let attributeValueCount=0;
    if(typeId&&typeIds.has(typeId)){
      await ctx.broker('core_objectsphere','query',{
        text:`INSERT INTO objectsphere_item_type(tenant_id,item_id,object_type_id,status)
              VALUES($1,$2,$3,'active')
              ON CONFLICT(item_id,object_type_id) DO UPDATE
              SET status='active',updated_at=now()`,
        values:[access.tenantId,item.item_id,typeId]
      });
      for(const value of Array.isArray(object.attribute_values)?object.attribute_values:[]){
        const attributeId=clean(value.attribute_id);
        const meta=attrById.get(attributeId);
        const valueText=value.value_text===undefined?null:String(value.value_text);
        if(!meta||meta.object_type_id!==typeId||!clean(valueText))continue;
        await ctx.broker('core_objectsphere','query',{
          text:`WITH saved AS (
                  INSERT INTO objectsphere_attribute_value(tenant_id,item_id,attribute_id,value_text)
                  VALUES($1,$2,$3,$4)
                  ON CONFLICT(item_id,attribute_id) DO UPDATE
                  SET value_text=excluded.value_text,updated_at=now()
                  RETURNING value_id
                )
                INSERT INTO objectsphere_attribute_value_history(
                  tenant_id,item_id,attribute_id,object_type_id,item_name,object_type_name,attribute_name,new_value_text,changed_by_email
                )
                VALUES($1,$2,$3,$5,$6,$7,$8,$4,$9)`,
          values:[access.tenantId,item.item_id,attributeId,valueText,typeId,item.item_name,meta.type_name,meta.attribute_name,access.auth.email]
        });
        attributeValueCount+=1;
      }
    }
    created.push({...item,object_type_id:typeId&&typeIds.has(typeId)?typeId:null,attribute_value_count:attributeValueCount});
  }

  if(!created.length)return ctx.send(400,{error:'No valid objects were selected for import'});

  const parsed=parseDataUrl(ctx.body.source_photo?.data_url);
  const sourceFileName=clean(ctx.body.source_photo?.file_name);
  let attachedPhotoCount=0;
  if(parsed&&parsed.mimeType.startsWith('image/')&&sourceFileName){
    const size=Buffer.from(parsed.base64,'base64').length;
    for(const item of created){
      await ctx.broker('core_objectsphere','query',{
        text:`INSERT INTO objectsphere_item_attachment(
                tenant_id,item_id,attachment_type,file_name,mime_type,file_size,file_data,created_by_email
              )
              VALUES($1,$2,'photo',$3,$4,$5,decode($6,'base64'),$7)`,
        values:[access.tenantId,item.item_id,`Import - ${sourceFileName}`,parsed.mimeType,size,parsed.base64,access.auth.email]
      });
      attachedPhotoCount+=1;
    }
  }

  ctx.logger.info('photo import confirmed',{
    requestId:ctx.requestId,
    parentItemId:parentId,
    createdCount:created.length,
    attributeValueCount:created.reduce((total,item)=>total+(item.attribute_value_count||0),0),
    attachedPhotoCount
  });

  return ctx.send(201,{parent_item_id:parentId,created});
};
