'use strict';
const {Blob}=require('buffer');
const {ensureSchema,authTenant,clean}=require('../../_shared/items');
const {decryptKey,loadOpenAISetting}=require('../../_shared/openai-settings');

const wireframePrompt=[
  'Convert the attached photograph into a labelled 3D architectural CAD wireframe.',
  '',
  'Preserve exactly from the photograph:',
  '- The original camera position, lens perspective, framing and aspect ratio',
  '- The architectural dimensions and spatial relationships',
  '- The location, scale and orientation of every major object',
  '- The recognizable overall shape of furniture, fittings and structural features',
  '',
  'Rendering style:',
  '- Flat near-black charcoal background, approximately #171B22',
  '- Main visible outlines in muted light grey, approximately #AEB3BA',
  '- Important contours and labels in soft off-white, approximately #D3D6DA',
  '- Secondary construction edges in darker cool grey',
  '- Precise, smooth, vector-like CAD linework',
  '- Hidden-line 3D perspective drawing',
  '- Thin and consistent technical line weights',
  '- Completely unfilled surfaces',
  '',
  'Simplification:',
  '- Represent objects using only their essential 3D contours and structural edges',
  '- Simplify cushions, furniture and decorative objects into clean geometric volumes',
  '- Omit insignificant photographic details',
  '- Keep enough internal lines to make every object recognizable',
  '- Remove floor grids, tile joints, wall subdivisions and surface patterns',
  '- Do not add geometry that is not visible in the photograph',
  '',
  'Labels:',
  'Identify the principal objects visible in the photograph.',
  'Use concise UPPERCASE technical sans-serif labels.',
  'Place labels in uncluttered areas around the scene.',
  'Connect each label to the correct object using a thin straight leader line ending in a small circular marker.',
  'Avoid overlapping labels, objects and leader lines.',
  '',
  'Remove completely:',
  '- Photographic colour',
  '- Material textures',
  '- Wicker patterns',
  '- Wood grain',
  '- Fabric texture and cushion wrinkles',
  '- Tile and grout patterns',
  '- Brick, stone or wall patterns',
  '- Plants fine texture',
  '- Shading and tonal modelling',
  '- Cast and contact shadows',
  '- Reflections',
  '- Gradients',
  '- Hatching and cross-hatching',
  '- Sketch marks and hand-drawn wobble',
  '- Glow, blueprint grids and decorative borders',
  '',
  'The finished image must resemble a clean professional 3D CAD wireframe exported from architectural modelling software, not a pencil sketch, illustration, floor plan or shaded render.'
].join('\n');

function imageDataFromResponse(json){
  const direct=json.data?.[0]?.b64_json;
  if(direct)return direct;
  const output=Array.isArray(json.output)?json.output:[];
  for(const item of output){
    if(item?.type==='image_generation_call'&&item.result)return item.result;
    const content=Array.isArray(item?.content)?item.content:[];
    for(const part of content){
      if(part?.type==='image_generation_call'&&part.result)return part.result;
      if(part?.type==='output_image'&&part.image_base64)return part.image_base64;
    }
  }
  return null;
}

function shouldTryResponsesFallback(json){
  const message=String(json?.error?.message||'').toLowerCase();
  return message.includes('invalid image file')||message.includes('invalid image')||message.includes('model for image');
}

function openAIErrorMessage(json,fallback='Wireframe generation failed'){
  const message=json?.error?.message||fallback;
  if(String(message).toLowerCase().includes('organization must be verified')){
    return `${message} Wireframe generation uses OpenAI image generation; verify the OpenAI organization for the saved API key, then retry after access propagates.`;
  }
  return message;
}

async function generateWithImageEdit(openaiKey,photo){
  const form=new FormData();
  form.append('model','gpt-image-1');
  form.append('prompt',wireframePrompt);
  form.append('image',new Blob([photo.file_data],{type:photo.mime_type}),photo.file_name||'source-photo.jpg');
  form.append('size','auto');
  form.append('quality','high');
  form.append('background','opaque');

  const response=await fetch('https://api.openai.com/v1/images/edits',{
    method:'POST',
    headers:{authorization:`Bearer ${openaiKey}`},
    body:form
  });
  const json=await response.json().catch(()=>({}));
  return {response,json,base64:imageDataFromResponse(json)};
}

async function generateWithResponses(openaiKey,openaiSetting,photo){
  const base64=Buffer.from(photo.file_data).toString('base64');
  const model=process.env.OPENAI_WIREFRAME_RESPONSE_MODEL||'gpt-5';
  const response=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{'content-type':'application/json',authorization:`Bearer ${openaiKey}`},
    body:JSON.stringify({
      model,
      input:[{
        role:'user',
        content:[
          {type:'input_text',text:wireframePrompt},
          {type:'input_image',image_url:`data:${photo.mime_type};base64,${base64}`,detail:'high'}
        ]
      }],
      tools:[{type:'image_generation',quality:'high',size:'auto'}]
    })
  });
  const json=await response.json().catch(()=>({}));
  return {response,json,base64:imageDataFromResponse(json)};
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
    {text:`SELECT item_id,item_name
           FROM objectsphere_item
           WHERE tenant_id=$1 AND item_id=$2 AND status='active'`,values:[access.tenantId,itemId]},
    {text:`SELECT attachment_id,file_name,mime_type,file_data
           FROM objectsphere_item_attachment
           WHERE tenant_id=$1 AND item_id=$2 AND attachment_type='photo' AND deleted=false
           ORDER BY created_at DESC,file_name
           LIMIT 1`,values:[access.tenantId,itemId]}
  ]});

  const item=meta.results[0].rows[0];
  if(!item)return ctx.send(404,{error:'Item not found'});
  const photo=meta.results[1].rows[0];
  if(!photo)return ctx.send(400,{error:'Upload at least one photo before generating a wireframe'});
  if(!String(photo.mime_type||'').startsWith('image/'))return ctx.send(400,{error:'The first attachment is not an image'});

  let result;
  try{
    result=await generateWithImageEdit(openaiKey,photo);
    if(!result.response.ok&&shouldTryResponsesFallback(result.json)){
      result=await generateWithResponses(openaiKey,openaiSetting,photo);
    }
  }catch(e){
    return ctx.send(502,{error:`Could not reach OpenAI from ObjectSphere: ${e.cause?.message||e.message}`});
  }

  if(!result.response.ok)return ctx.send(result.response.status,{error:openAIErrorMessage(result.json)});

  const base64=result.base64;
  if(!base64)return ctx.send(502,{error:'Wireframe generation did not return image data'});

  const fileName=`${String(item.item_name||'object').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').slice(0,60)||'object'}-wireframe.png`;
  const size=Buffer.from(base64,'base64').length;
  const saved=await ctx.broker('core_objectsphere','transaction',{statements:[
    {text:`UPDATE objectsphere_item_attachment
           SET deleted=true,deleted_at=now(),updated_at=now()
           WHERE tenant_id=$1 AND item_id=$2 AND attachment_type='wireframe' AND deleted=false`,values:[access.tenantId,itemId]},
    {text:`INSERT INTO objectsphere_item_attachment(
             tenant_id,item_id,attachment_type,file_name,mime_type,file_size,file_data,created_by_email
           )
           VALUES($1,$2,'wireframe',$3,'image/png',$4,decode($5,'base64'),$6)
           RETURNING attachment_id,file_name,mime_type,file_size,created_by_email,created_at,
                     'data:' || mime_type || ';base64,' || encode(file_data,'base64') AS data_url`,
     values:[access.tenantId,itemId,fileName,size,base64,access.auth.email]}
  ]});

  ctx.logger.info('item wireframe generated',{requestId:ctx.requestId,itemId,sourceAttachmentId:photo.attachment_id});
  return ctx.send(201,{wireframe:saved.results[1].rows[0]});
};
