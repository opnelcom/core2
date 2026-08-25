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

function normalizeImageDataUrl(value){
  const match=String(value||'').match(/^data:(image\/[^;,]+);base64,([a-zA-Z0-9+/=\r\n\s]+)$/);
  if(!match)return null;
  return `data:${match[1]};base64,${match[2].replace(/\s/g,'')}`;
}

function appendDescription(existing,addition){
  const current=String(existing||'').trim();
  const next=String(addition||'').trim();
  if(!next)return current;
  if(!current)return next;
  return `${current}\n\n${next}`;
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
    {text:`SELECT attachment_id,file_name,mime_type,file_size,
                  'data:' || mime_type || ';base64,' || encode(file_data,'base64') AS data_url
           FROM objectsphere_item_attachment
           WHERE tenant_id=$1 AND item_id=$2 AND attachment_type='photo' AND deleted=false
           ORDER BY created_at DESC,file_name
           LIMIT 1`,values:[access.tenantId,itemId]}
  ]});

  const item=meta.results[0].rows[0];
  if(!item)return ctx.send(404,{error:'Item not found'});
  const photo=meta.results[1].rows
    .map(row=>({...row,data_url:normalizeImageDataUrl(row.data_url)}))
    .find(row=>String(row.mime_type||'').startsWith('image/')&&row.data_url);
  if(!photo)return ctx.send(400,{error:'Upload at least one photo before describing this object'});

  const prompt=[
    `Describe the ObjectSphere item "${item.item_name}" from the attached photo.`,
    `Existing description: ${item.item_description||'none'}. Quantity: ${item.quantity||1}.`,
    'Write one concise overall description suitable for appending to an asset or object record.',
    'Describe only what is visible or strongly implied by the image.',
    'Mention condition, distinguishing visible features, location context, labels, or notable details when visible.',
    'Do not invent serial numbers, dates, prices, addresses, or private identifiers.',
    'Return only the description text, with no heading, bullets, markdown, or preamble.'
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
            {type:'input_image',image_url:photo.data_url,detail:'high'}
          ]
        }]
      })
    });
  }catch(e){
    return ctx.send(502,{error:`Could not reach OpenAI from ObjectSphere: ${e.cause?.message||e.message}`});
  }

  const json=await response.json().catch(()=>({}));
  if(!response.ok)return ctx.send(response.status,{error:json.error?.message||'Item description failed'});

  const generated=extractText(json).replace(/^["']|["']$/g,'').trim();
  if(!generated)return ctx.send(502,{error:'Item description returned no text'});

  const nextDescription=appendDescription(item.item_description,generated).slice(0,20000);
  const saved=await ctx.broker('core_objectsphere','query',{
    text:`UPDATE objectsphere_item
          SET item_description=$3,updated_by_email=$4,updated_at=now()
          WHERE tenant_id=$1 AND item_id=$2 AND status='active'
          RETURNING item_id,tenant_id,parent_item_id,item_name,item_description,quantity,latitude::float AS latitude,longitude::float AS longitude,sort_order,status,created_at,updated_at`,
    values:[access.tenantId,itemId,nextDescription,access.auth.email]
  });

  ctx.logger.info('item described from photo',{requestId:ctx.requestId,itemId,photoId:photo.attachment_id});
  return {item:saved.rows[0],description:generated};
};
