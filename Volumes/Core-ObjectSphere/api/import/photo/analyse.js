'use strict';
const {ensureSchema,authTenant,clean,quantity}=require('../../_shared/items');
const {decryptKey,loadOpenAISetting}=require('../../_shared/openai-settings');

function parseDataUrl(value){
  const match=String(value||'').match(/^data:([^;,]+);base64,([a-zA-Z0-9+/=\r\n]+)$/);
  if(!match)return null;
  return {mimeType:match[1],base64:match[2].replace(/\s/g,'')};
}

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

function normalizeName(value){
  return String(value||'').trim().toLowerCase();
}

function clampConfidence(value){
  const n=Number(value);
  if(!Number.isFinite(n))return null;
  return Math.max(0,Math.min(1,n));
}

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);

  const parentId=clean(ctx.body.parent_item_id);
  const fileName=clean(ctx.body.file_name)||'import-photo.jpg';
  const parsed=parseDataUrl(ctx.body.data_url);
  if(!parentId||!parsed)return ctx.send(400,{error:'Parent item and photo are required'});
  if(!parsed.mimeType.startsWith('image/'))return ctx.send(400,{error:'Photo must be an image'});

  const openaiSetting=await loadOpenAISetting(ctx,access.tenantId);
  const openaiKey=decryptKey(ctx,openaiSetting);
  if(!openaiKey)return ctx.send(503,{error:'OpenAI API key is not configured for this tenant'});

  const meta=await ctx.broker('core_objectsphere','transaction',{statements:[
    {text:`SELECT item_id,item_name FROM objectsphere_item WHERE tenant_id=$1 AND item_id=$2 AND status='active'`,values:[access.tenantId,parentId]},
    {text:`SELECT object_type_id,type_name,type_description
           FROM objectsphere_object_type
           WHERE tenant_id=$1 AND status='active' AND deleted=false
           ORDER BY sort_order,type_name`,values:[access.tenantId]},
    {text:`SELECT attribute_id,object_type_id,attribute_name,attribute_type
           FROM objectsphere_attribute
           WHERE tenant_id=$1 AND status='active' AND deleted=false
           ORDER BY sort_order,attribute_name`,values:[access.tenantId]}
  ]});
  const parent=meta.results[0].rows[0];
  if(!parent)return ctx.send(404,{error:'Parent item not found'});

  const types=meta.results[1].rows;
  const attributes=meta.results[2].rows;
  const typeByName=new Map(types.map(type=>[normalizeName(type.type_name),type]));
  const attrsByType=new Map();
  attributes.forEach(attribute=>{
    if(!attrsByType.has(attribute.object_type_id))attrsByType.set(attribute.object_type_id,[]);
    attrsByType.get(attribute.object_type_id).push(attribute);
  });
  const catalog=types.map(type=>({
    type_name:type.type_name,
    type_description:type.type_description,
    attributes:(attrsByType.get(type.object_type_id)||[]).map(attribute=>({
      attribute_name:attribute.attribute_name,
      attribute_type:attribute.attribute_type
    }))
  }));

  const schema={
    type:'object',
    additionalProperties:false,
    required:['objects','analysis_notes'],
    properties:{
      analysis_notes:{type:'string'},
      objects:{
        type:'array',
        maxItems:20,
        items:{
          type:'object',
          additionalProperties:false,
          required:['name','description','quantity','suggested_type_name','confidence','attributes','warnings'],
          properties:{
            name:{type:'string'},
            description:{type:'string'},
            quantity:{type:'integer',minimum:1,maximum:999},
            suggested_type_name:{type:'string'},
            confidence:{type:'number',minimum:0,maximum:1},
            attributes:{
              type:'array',
              maxItems:20,
              items:{
                type:'object',
                additionalProperties:false,
                required:['name','value','confidence'],
                properties:{
                  name:{type:'string'},
                  value:{type:'string'},
                  confidence:{type:'number',minimum:0,maximum:1}
                }
              }
            },
            warnings:{type:'array',items:{type:'string'},maxItems:8}
          }
        }
      }
    }
  };

  const prompt=[
    `The selected ObjectSphere parent is "${parent.item_name}".`,
    'Analyze the photo and identify visible child objects that should be added under this parent.',
    'Break the image down into separate inventory objects. Do not return the whole image, shelf, room, scene, or collection as one object unless that is the only meaningful visible subject.',
    'Create one object per distinct visible item. If several identical items are visible, create one object with quantity equal to the visible count.',
    'Use specific item names such as "red fire extinguisher", "Bosch cordless drill", or "white extension cord", not generic names such as "equipment" or "object".',
    'Use only the provided object type names and their attribute names. Do not invent new types or attributes.',
    'For each object, choose the best matching type_name exactly from the allowed catalog. If unsure, prefer Asset or Equipment when available.',
    'Populate every allowed attribute that can be visually inferred, including visible manufacturer, brand, model, colour, condition, material, size, location, or category when those matching attributes exist.',
    'Prefer concrete physical objects over background clutter. Combine identical repeated objects into one object with quantity.',
    'Use short plain text values. Do not guess serial numbers, registration numbers, VINs, prices, dates, or account numbers unless they are legible.',
    'Leave truly uncertain attributes out and mention uncertainty in warnings.',
    'Return an empty objects array when the image is too unclear.',
    '',
    `Allowed catalog JSON: ${JSON.stringify(catalog)}`
  ].join('\n');

  let response;
  try{
    response=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{'content-type':'application/json',authorization:`Bearer ${openaiKey}`},
      body:JSON.stringify({
        model:openaiSetting?.model||'gpt-4.1-mini',
        input:[{
          role:'user',
          content:[
            {type:'input_text',text:prompt},
            {type:'input_image',image_url:`data:${parsed.mimeType};base64,${parsed.base64}`,detail:'high'}
          ]
        }],
        text:{
          format:{
            type:'json_schema',
            name:'objectsphere_photo_import',
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
  if(!response.ok)return ctx.send(response.status,{error:json.error?.message||'Photo analysis failed'});

  let raw;
  try{
    raw=JSON.parse(extractText(json));
  }catch{
    return ctx.send(502,{error:'Photo analysis returned invalid data'});
  }

  const drafts=(Array.isArray(raw.objects)?raw.objects:[]).map(object=>{
    const name=clean(object.name);
    if(!name)return null;
    const type=typeByName.get(normalizeName(object.suggested_type_name));
    const typeAttrs=type?attrsByType.get(type.object_type_id)||[]:[];
    const attrByName=new Map(typeAttrs.map(attribute=>[normalizeName(attribute.attribute_name),attribute]));
    const values=(Array.isArray(object.attributes)?object.attributes:[]).map(attribute=>{
      const matched=attrByName.get(normalizeName(attribute.name));
      const value=clean(attribute.value);
      if(!matched||!value)return null;
      return {
        attribute_id:matched.attribute_id,
        attribute_name:matched.attribute_name,
        attribute_type:matched.attribute_type,
        value_text:value,
        confidence:clampConfidence(attribute.confidence)
      };
    }).filter(Boolean);
    return {
      item_name:name,
      item_description:String(object.description||'').trim(),
      quantity:quantity(object.quantity)||1,
      object_type_id:type?.object_type_id||null,
      object_type_name:type?.type_name||'',
      confidence:clampConfidence(object.confidence),
      attribute_values:values,
      warnings:Array.isArray(object.warnings)?object.warnings.map(String).map(v=>v.trim()).filter(Boolean).slice(0,8):[]
    };
  }).filter(Boolean);

  ctx.logger.info('photo import analysed',{
    requestId:ctx.requestId,
    parentItemId:parent.item_id,
    objectCount:drafts.length,
    attributeValueCount:drafts.reduce((total,object)=>total+(object.attribute_values?.length||0),0),
    unmatchedTypeCount:drafts.filter(object=>!object.object_type_id).length,
    analysisNotes:String(raw.analysis_notes||'').slice(0,500)
  });

  return {
    parent_item:{item_id:parent.item_id,item_name:parent.item_name},
    source_photo:{file_name:fileName,mime_type:parsed.mimeType,data_url:`data:${parsed.mimeType};base64,${parsed.base64}`},
    objects:drafts
  };
};
