'use strict';
const {ensureSchema,authTenant,clean}=require('../../_shared/items');
const {decryptKey,loadOpenAISetting}=require('../../_shared/openai-settings');

function extractText(response){
  if(typeof response.output_text==='string')return response.output_text;
  const parts=[];
  (response.output||[]).forEach(item=>{
    (item.content||[]).forEach(content=>{
      if(typeof content.text==='string')parts.push(content.text);
      if(typeof content.output_text==='string')parts.push(content.output_text);
    });
  });
  return parts.join('\n').trim();
}

function normalizeValue(value,type){
  const text=clean(value);
  if(!text)return null;
  if(type==='date'){
    const match=text.match(/^\d{4}-\d{2}-\d{2}$/);
    return match?text:null;
  }
  if(['number','float','currency'].includes(type)){
    const number=Number(String(text).replace(/[^0-9.-]/g,''));
    if(!Number.isFinite(number))return null;
    return String(number);
  }
  return text.slice(0,4000);
}

function clampConfidence(value){
  const n=Number(value);
  if(!Number.isFinite(n))return null;
  return Math.max(0,Math.min(1,n));
}

function normalizeImageDataUrl(value){
  const match=String(value||'').match(/^data:(image\/[^;,]+);base64,([a-zA-Z0-9+/=\r\n\s]+)$/);
  if(!match)return null;
  return `data:${match[1]};base64,${match[2].replace(/\s/g,'')}`;
}

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);

  const itemId=clean(ctx.body.item_id);
  if(!itemId)return ctx.send(400,{error:'Item id is required'});

  const openaiSetting=await loadOpenAISetting(ctx,access.tenantId);
  const openaiKey=decryptKey(ctx,openaiSetting);
  if(!openaiKey)return ctx.send(503,{error:'OpenAI API key is not configured for this tenant'});

  const meta=await ctx.broker('core_objectsphere','transaction',{statements:[
    {text:`SELECT item_id,item_name,item_description,quantity
           FROM objectsphere_item
           WHERE tenant_id=$1 AND item_id=$2 AND status='active'`,values:[access.tenantId,itemId]},
    {text:`SELECT t.object_type_id,t.type_name,t.type_description
           FROM objectsphere_item_type it
           JOIN objectsphere_object_type t ON t.object_type_id=it.object_type_id
           WHERE it.tenant_id=$1 AND it.item_id=$2 AND it.status='active' AND t.status='active' AND t.deleted=false
           ORDER BY t.sort_order,t.type_name`,values:[access.tenantId,itemId]},
    {text:`SELECT a.attribute_id,a.object_type_id,a.attribute_name,a.attribute_type,t.type_name
           FROM objectsphere_item_type it
           JOIN objectsphere_attribute a ON a.object_type_id=it.object_type_id
           JOIN objectsphere_object_type t ON t.object_type_id=a.object_type_id
           WHERE it.tenant_id=$1 AND it.item_id=$2 AND it.status='active'
           AND a.status='active' AND a.deleted=false AND t.status='active' AND t.deleted=false
           ORDER BY t.sort_order,a.sort_order,a.attribute_name`,values:[access.tenantId,itemId]},
    {text:`SELECT attribute_id,value_text
           FROM objectsphere_attribute_value
           WHERE tenant_id=$1 AND item_id=$2`,values:[access.tenantId,itemId]},
    {text:`SELECT attachment_id,file_name,mime_type,file_size,
                  'data:' || mime_type || ';base64,' || encode(file_data,'base64') AS data_url
           FROM objectsphere_item_attachment
           WHERE tenant_id=$1 AND item_id=$2 AND attachment_type='photo' AND deleted=false
           ORDER BY created_at DESC,file_name
           LIMIT 4`,values:[access.tenantId,itemId]}
  ]});

  const item=meta.results[0].rows[0];
  if(!item)return ctx.send(404,{error:'Item not found'});
  const types=meta.results[1].rows;
  const attributes=meta.results[2].rows;
  const currentValues=new Map(meta.results[3].rows.map(row=>[row.attribute_id,row.value_text||'']));
  const photos=meta.results[4].rows
    .map(photo=>({...photo,data_url:normalizeImageDataUrl(photo.data_url)}))
    .filter(photo=>String(photo.mime_type||'').startsWith('image/')&&photo.data_url);
  if(!types.length)return ctx.send(400,{error:'Enable at least one object type before enhancing attributes'});
  if(!attributes.length)return ctx.send(400,{error:'No active attributes are available for this item'});
  if(!photos.length)return ctx.send(400,{error:'Upload at least one photo before enhancing attributes'});

  const attrById=new Map(attributes.map(attribute=>[attribute.attribute_id,attribute]));
  const catalog=types.map(type=>({
    type_name:type.type_name,
    type_description:type.type_description,
    attributes:attributes.filter(attribute=>attribute.object_type_id===type.object_type_id).map(attribute=>({
      attribute_id:attribute.attribute_id,
      attribute_name:attribute.attribute_name,
      attribute_type:attribute.attribute_type,
      current_value:currentValues.get(attribute.attribute_id)||''
    }))
  }));

  const schema={
    type:'object',
    additionalProperties:false,
    required:['summary','values','sources','warnings'],
    properties:{
      summary:{type:'string'},
      values:{
        type:'array',
        maxItems:40,
        items:{
          type:'object',
          additionalProperties:false,
          required:['attribute_id','value','confidence','evidence','source_urls'],
          properties:{
            attribute_id:{type:'string'},
            value:{type:'string'},
            confidence:{type:'number',minimum:0,maximum:1},
            evidence:{type:'string'},
            source_urls:{type:'array',items:{type:'string'},maxItems:5}
          }
        }
      },
      sources:{
        type:'array',
        maxItems:12,
        items:{
          type:'object',
          additionalProperties:false,
          required:['title','url'],
          properties:{title:{type:'string'},url:{type:'string'}}
        }
      },
      warnings:{type:'array',items:{type:'string'},maxItems:8}
    }
  };

  const prompt=[
    `Enhance the existing ObjectSphere item "${item.item_name}".`,
    `Description: ${item.item_description||'none'}. Quantity: ${item.quantity||1}.`,
    'Use the photos to identify the object, visible make/model/serial text, labels, design, product category, and other concrete clues.',
    'Use web search to verify product or public factual details when the photos reveal enough identifying information.',
    'Return proposed values only for the provided attribute_id values. Do not invent attributes.',
    'Prefer filling blank attributes. You may propose a replacement for an existing value only when the evidence is strong.',
    'Do not guess private identifiers, account numbers, VINs, serial numbers, registration numbers, prices, dates, or addresses unless they are visible in the photos or verified by a source.',
    'For date attributes, use YYYY-MM-DD only. For numeric and currency attributes, return only a plain number.',
    'Keep values short and suitable for direct storage. Put uncertainty in evidence or warnings.',
    '',
    `Allowed object types and attributes JSON: ${JSON.stringify(catalog)}`
  ].join('\n');

  let response;
  try{
    response=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{'content-type':'application/json',authorization:`Bearer ${openaiKey}`},
      body:JSON.stringify({
        model:openaiSetting?.model||'gpt-4.1-mini',
        tools:[{type:'web_search_preview'}],
        input:[{
          role:'user',
          content:[
            {type:'input_text',text:prompt},
            ...photos.map(photo=>({type:'input_image',image_url:photo.data_url,detail:'high'}))
          ]
        }],
        text:{
          format:{
            type:'json_schema',
            name:'objectsphere_item_enhancement',
            schema,
            strict:true
          }
        }
      })
    });
  }catch(e){
    return ctx.send(502,{error:`Could not reach OpenAI from ObjectSphere: ${e.cause?.message||e.message}`});
  }

  const json=await response.json().catch(()=>({}));
  if(!response.ok)return ctx.send(response.status,{error:json.error?.message||'Item enhancement failed'});

  let raw;
  try{
    raw=JSON.parse(extractText(json));
  }catch{
    return ctx.send(502,{error:'Item enhancement returned invalid data'});
  }

  const values=(Array.isArray(raw.values)?raw.values:[]).map(value=>{
    const attribute=attrById.get(clean(value.attribute_id));
    if(!attribute)return null;
    const valueText=normalizeValue(value.value,attribute.attribute_type);
    if(!valueText)return null;
    return {
      attribute_id:attribute.attribute_id,
      attribute_name:attribute.attribute_name,
      attribute_type:attribute.attribute_type,
      object_type_id:attribute.object_type_id,
      object_type_name:attribute.type_name,
      current_value:currentValues.get(attribute.attribute_id)||'',
      value_text:valueText,
      confidence:clampConfidence(value.confidence),
      evidence:String(value.evidence||'').trim().slice(0,1000),
      source_urls:Array.isArray(value.source_urls)?value.source_urls.map(String).map(v=>v.trim()).filter(Boolean).slice(0,5):[]
    };
  }).filter(Boolean);

  ctx.logger.info('item enhancement analysed',{
    requestId:ctx.requestId,
    itemId:item.item_id,
    photoCount:photos.length,
    proposedValueCount:values.length
  });

  return {
    item:{item_id:item.item_id,item_name:item.item_name},
    photo_count:photos.length,
    summary:String(raw.summary||'').trim(),
    values,
    sources:Array.isArray(raw.sources)?raw.sources.map(source=>({
      title:String(source.title||'').trim(),
      url:String(source.url||'').trim()
    })).filter(source=>source.url).slice(0,12):[],
    warnings:Array.isArray(raw.warnings)?raw.warnings.map(String).map(v=>v.trim()).filter(Boolean).slice(0,8):[]
  };
};
