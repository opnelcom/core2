'use strict';
const {ensureSchema,authTenant,clean}=require('../../_shared/items');

function parseDataUrl(value){
  const match=String(value||'').match(/^data:([^;,]+);base64,(.+)$/);
  if(!match)return null;
  return {mimeType:match[1],base64:match[2]};
}

async function requireItem(ctx,access,itemId){
  const item=await ctx.broker('core_objectsphere','query',{
    text:`SELECT item_id FROM objectsphere_item WHERE tenant_id=$1 AND item_id=$2 AND status='active'`,
    values:[access.tenantId,itemId]
  });
  return !!item.rowCount;
}

async function listAttachments(ctx,type){
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const itemId=clean(ctx.query.item_id||ctx.body.item_id);
  if(!itemId)return ctx.send(400,{error:'Item id is required'});
  if(!await requireItem(ctx,access,itemId))return ctx.send(404,{error:'Item not found'});
  const r=await ctx.broker('core_objectsphere','query',{
    text:`SELECT attachment_id,file_name,mime_type,file_size,created_by_email,created_at,
                 'data:' || mime_type || ';base64,' || encode(file_data,'base64') AS data_url
          FROM objectsphere_item_attachment
          WHERE tenant_id=$1 AND item_id=$2 AND attachment_type=$3 AND deleted=false
          ORDER BY created_at DESC,file_name`,
    values:[access.tenantId,itemId,type]
  });
  return {attachments:r.rows};
}

async function uploadAttachment(ctx,type,allowed){
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const itemId=clean(ctx.body.item_id);
  const fileName=clean(ctx.body.file_name);
  const parsed=parseDataUrl(ctx.body.data_url);
  if(!itemId||!fileName||!parsed)return ctx.send(400,{error:'Item id, file name and data are required'});
  if(allowed&&!allowed.some(prefix=>parsed.mimeType.startsWith(prefix)))return ctx.send(400,{error:'Invalid file type'});
  if(!await requireItem(ctx,access,itemId))return ctx.send(404,{error:'Item not found'});
  const size=Buffer.from(parsed.base64,'base64').length;
  const r=await ctx.broker('core_objectsphere','query',{
    text:`INSERT INTO objectsphere_item_attachment(
            tenant_id,item_id,attachment_type,file_name,mime_type,file_size,file_data,created_by_email
          )
          VALUES($1,$2,$3,$4,$5,$6,decode($7,'base64'),$8)
          RETURNING attachment_id,file_name,mime_type,file_size,created_by_email,created_at`,
    values:[access.tenantId,itemId,type,fileName,parsed.mimeType,size,parsed.base64,access.auth.email]
  });
  return ctx.send(201,{attachment:r.rows[0]});
}

async function deleteAttachment(ctx,type){
  if(ctx.req.method!=='POST'&&ctx.req.method!=='DELETE')return ctx.send(405,{error:'POST or DELETE required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const id=clean(ctx.body.attachment_id||ctx.query.attachment_id);
  if(!id)return ctx.send(400,{error:'Attachment id is required'});
  const r=await ctx.broker('core_objectsphere','query',{
    text:`UPDATE objectsphere_item_attachment
          SET deleted=true,deleted_at=now(),updated_at=now()
          WHERE tenant_id=$1 AND attachment_id=$2 AND attachment_type=$3 AND deleted=false
          RETURNING attachment_id`,
    values:[access.tenantId,id,type]
  });
  if(!r.rowCount)return ctx.send(404,{error:'Attachment not found'});
  return {deleted:r.rowCount};
}

module.exports={listAttachments,uploadAttachment,deleteAttachment};
