'use strict';
const {ensureSchema,authTenant,clean}=require('../_shared/items');
const {decryptKey,loadOpenAISetting}=require('../_shared/openai-settings');

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

function normalizeUuid(value){
  const text=clean(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text||'')?text:null;
}

function normalizeAction(action,index,lookups){
  const type=clean(action.action_type);
  if(!['create_child','set_attribute','rename_item','move_item'].includes(type))return null;
  const itemId=normalizeUuid(action.item_id);
  const parentId=normalizeUuid(action.parent_item_id);
  const attributeId=normalizeUuid(action.attribute_id);
  const objectTypeId=normalizeUuid(action.object_type_id);
  const targetParentId=normalizeUuid(action.target_parent_item_id);
  const item=itemId?lookups.items.get(itemId):null;
  const parent=parentId?lookups.items.get(parentId):null;
  const targetParent=targetParentId?lookups.items.get(targetParentId):null;
  const attribute=attributeId?lookups.attributes.get(attributeId):null;
  const objectType=objectTypeId?lookups.types.get(objectTypeId):null;
  const description=String(action.description||'').trim().slice(0,500);
  const valueText=action.value_text===undefined?null:String(action.value_text||'').trim().slice(0,4000);
  const newName=clean(action.new_item_name);
  const childName=clean(action.child_item_name);
  const warnings=[];
  const attributeValues=Array.isArray(action.attribute_values)?action.attribute_values.map(value=>{
    const attribute=lookups.attributes.get(normalizeUuid(value.attribute_id));
    const text=String(value.value_text||'').trim().slice(0,4000);
    if(!attribute||!text)return null;
    return {
      attribute_id:attribute.attribute_id,
      attribute_name:attribute.attribute_name,
      attribute_type:attribute.attribute_type,
      object_type_id:attribute.object_type_id,
      object_type_name:lookups.types.get(attribute.object_type_id)?.type_name||'',
      value_text:text
    };
  }).filter(Boolean):[];

  if(type==='create_child'){
    if(!parent)return null;
    if(!childName)return null;
    if(objectTypeId&&!objectType)warnings.push('The requested object type was not found and will be ignored.');
    return {
      action_id:`voice-action-${index+1}`,
      action_type:type,
      description:description||`Create "${childName}" under "${parent.item_name}".`,
      parent_item_id:parent.item_id,
      parent_item_name:parent.item_name,
      child_item_name:childName,
      object_type_id:objectType?.object_type_id||null,
      object_type_name:objectType?.type_name||'',
      attribute_values:attributeValues,
      warnings
    };
  }

  if(type==='set_attribute'){
    if(!item||!attribute)return null;
    if(!valueText)return null;
    return {
      action_id:`voice-action-${index+1}`,
      action_type:type,
      description:description||`Set ${attribute.attribute_name} on "${item.item_name}" to "${valueText}".`,
      item_id:item.item_id,
      item_name:item.item_name,
      attribute_id:attribute.attribute_id,
      attribute_name:attribute.attribute_name,
      attribute_type:attribute.attribute_type,
      object_type_id:attribute.object_type_id,
      object_type_name:lookups.types.get(attribute.object_type_id)?.type_name||'',
      value_text:valueText,
      current_value:lookups.values.get(`${item.item_id}:${attribute.attribute_id}`)||'',
      requires_type_assignment:!lookups.itemTypes.has(`${item.item_id}:${attribute.object_type_id}`),
      warnings
    };
  }

  if(type==='rename_item'){
    if(!item||!newName)return null;
    return {
      action_id:`voice-action-${index+1}`,
      action_type:type,
      description:description||`Rename "${item.item_name}" to "${newName}".`,
      item_id:item.item_id,
      item_name:item.item_name,
      new_item_name:newName,
      warnings
    };
  }

  if(type==='move_item'){
    if(!item)return null;
    return {
      action_id:`voice-action-${index+1}`,
      action_type:type,
      description:description||`Move "${item.item_name}" ${targetParent?`under "${targetParent.item_name}"`:'to the top level'}.`,
      item_id:item.item_id,
      item_name:item.item_name,
      target_parent_item_id:targetParent?.item_id||null,
      target_parent_item_name:targetParent?.item_name||'Top level',
      warnings
    };
  }

  return null;
}

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);

  const transcript=clean(ctx.body.transcript);
  if(!transcript)return ctx.send(400,{error:'Voice transcript is required'});

  const openaiSetting=await loadOpenAISetting(ctx,access.tenantId);
  const openaiKey=decryptKey(ctx,openaiSetting);
  if(!openaiKey)return ctx.send(503,{error:'OpenAI API key is not configured for this tenant'});

  const data=await ctx.broker('core_objectsphere','transaction',{statements:[
    {text:`SELECT item_id,parent_item_id,item_name,item_description,quantity
           FROM objectsphere_item
           WHERE tenant_id=$1 AND status='active'
           ORDER BY COALESCE(parent_item_id::text,''),sort_order,item_name`,values:[access.tenantId]},
    {text:`SELECT object_type_id,type_name,type_description
           FROM objectsphere_object_type
           WHERE tenant_id=$1 AND status='active' AND deleted=false
           ORDER BY sort_order,type_name`,values:[access.tenantId]},
    {text:`SELECT a.attribute_id,a.object_type_id,a.attribute_name,a.attribute_type,t.type_name
           FROM objectsphere_attribute a
           JOIN objectsphere_object_type t ON t.object_type_id=a.object_type_id
           WHERE a.tenant_id=$1 AND a.status='active' AND a.deleted=false AND t.status='active' AND t.deleted=false
           ORDER BY t.sort_order,a.sort_order,a.attribute_name`,values:[access.tenantId]},
    {text:`SELECT item_id,object_type_id
           FROM objectsphere_item_type
           WHERE tenant_id=$1 AND status='active'`,values:[access.tenantId]},
    {text:`SELECT item_id,attribute_id,value_text
           FROM objectsphere_attribute_value
           WHERE tenant_id=$1`,values:[access.tenantId]}
  ]});

  const items=data.results[0].rows;
  const types=data.results[1].rows;
  const attributes=data.results[2].rows;
  const itemTypes=data.results[3].rows;
  const values=data.results[4].rows;
  if(!items.length)return ctx.send(400,{error:'Create at least one item before using voice actions'});

  const schema={
    type:'object',
    additionalProperties:false,
    required:['summary','actions','warnings'],
    properties:{
      summary:{type:'string'},
      actions:{
        type:'array',
        maxItems:12,
        items:{
          type:'object',
          additionalProperties:false,
          required:['action_type','description','item_id','parent_item_id','target_parent_item_id','child_item_name','new_item_name','attribute_id','object_type_id','value_text','attribute_values'],
          properties:{
            action_type:{type:'string',enum:['create_child','set_attribute','rename_item','move_item']},
            description:{type:'string'},
            item_id:{type:'string'},
            parent_item_id:{type:'string'},
            target_parent_item_id:{type:'string'},
            child_item_name:{type:'string'},
            new_item_name:{type:'string'},
            attribute_id:{type:'string'},
            object_type_id:{type:'string'},
            value_text:{type:'string'},
            attribute_values:{
              type:'array',
              maxItems:8,
              items:{
                type:'object',
                additionalProperties:false,
                required:['attribute_id','value_text'],
                properties:{
                  attribute_id:{type:'string'},
                  value_text:{type:'string'}
                }
              }
            }
          }
        }
      },
      warnings:{type:'array',items:{type:'string'},maxItems:8}
    }
  };

  const catalog={
    items:items.map(item=>({
      item_id:item.item_id,
      parent_item_id:item.parent_item_id,
      item_name:item.item_name,
      item_description:item.item_description||''
    })),
    object_types:types.map(type=>({
      object_type_id:type.object_type_id,
      type_name:type.type_name,
      type_description:type.type_description||''
    })),
    attributes:attributes.map(attribute=>({
      attribute_id:attribute.attribute_id,
      object_type_id:attribute.object_type_id,
      object_type_name:attribute.type_name,
      attribute_name:attribute.attribute_name,
      attribute_type:attribute.attribute_type
    })),
    item_type_assignments:itemTypes,
    existing_values:values
  };

  const prompt=[
    'Convert the user voice transcript into ObjectSphere changes.',
    'Return only actions that are clearly requested and can be mapped to the supplied ids.',
    'Use an empty string for fields that do not apply to an action.',
    'Use item names case-insensitively and tolerate minor speech-to-text errors. Prefer exact or near-exact item matches.',
    'For "for X, add Y" or "under X, add Y", create a child under item X.',
    'If a create-child command includes details for the new child, such as "brand Giant" or "model SNA 5000", put those in attribute_values on the create_child action.',
    'For "set A to B for X" or "for X, set A to B", set the matching attribute on item X.',
    'If setting an attribute whose object type is not assigned to the item, still return the attribute_id; the app can assign that type during confirmation.',
    'If the command says a product has a brand, manufacturer, model number, serial number, supplier, or similar, use the closest matching active attribute.',
    'Do not invent item ids, type ids, or attribute ids. If a requested item or attribute cannot be matched, put the problem in warnings and omit that action.',
    'Do not delete or archive anything from voice commands.',
    '',
    `Transcript: ${transcript}`,
    '',
    `ObjectSphere catalog JSON: ${JSON.stringify(catalog)}`
  ].join('\n');

  let response;
  try{
    response=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{'content-type':'application/json',authorization:`Bearer ${openaiKey}`},
      body:JSON.stringify({
        model:openaiSetting?.model||'gpt-4.1-mini',
        input:[{role:'user',content:[{type:'input_text',text:prompt}]}],
        text:{
          format:{
            type:'json_schema',
            name:'objectsphere_voice_actions',
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
  if(!response.ok)return ctx.send(response.status,{error:json.error?.message||'Voice action analysis failed'});

  let raw;
  try{
    raw=JSON.parse(extractText(json));
  }catch{
    return ctx.send(502,{error:'Voice action analysis returned invalid data'});
  }

  const lookups={
    items:new Map(items.map(item=>[item.item_id,item])),
    types:new Map(types.map(type=>[type.object_type_id,type])),
    attributes:new Map(attributes.map(attribute=>[attribute.attribute_id,attribute])),
    itemTypes:new Set(itemTypes.map(row=>`${row.item_id}:${row.object_type_id}`)),
    values:new Map(values.map(row=>[`${row.item_id}:${row.attribute_id}`,row.value_text||'']))
  };
  const actions=(Array.isArray(raw.actions)?raw.actions:[])
    .map((action,index)=>normalizeAction(action,index,lookups))
    .filter(Boolean);

  return {
    transcript,
    summary:String(raw.summary||'').trim(),
    actions,
    warnings:Array.isArray(raw.warnings)?raw.warnings.map(String).map(v=>v.trim()).filter(Boolean).slice(0,8):[]
  };
};
