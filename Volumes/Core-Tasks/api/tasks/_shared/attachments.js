'use strict';
const {ensureSchema,authTenant,clean}=require('../../_shared/tasks');

function parseDataUrl(value){
  const match=String(value||'').match(/^data:([^;,]+);base64,(.+)$/);
  if(!match)return null;
  return {mimeType:match[1],base64:match[2]};
}

async function requireTask(ctx,access,taskId){
  const task=await ctx.broker('core_tasks','query',{
    text:`SELECT task_id
          FROM tasks_task
          WHERE tenant_id=$1
          AND task_id=$2
          AND status NOT IN('archived','deleted')`,
    values:[access.tenantId,taskId]
  });
  return !!task.rowCount;
}

async function listAttachments(ctx,type){
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const taskId=clean(ctx.query.task_id||ctx.body.task_id);
  if(!taskId)return ctx.send(400,{error:'Task id is required'});
  if(!await requireTask(ctx,access,taskId))return ctx.send(404,{error:'Task not found'});
  const r=await ctx.broker('core_tasks','query',{
    text:`SELECT attachment_id,file_name,mime_type,file_size,created_by_email,created_at,
                 'data:' || mime_type || ';base64,' || encode(file_data,'base64') AS data_url
          FROM tasks_task_attachment
          WHERE tenant_id=$1 AND task_id=$2 AND attachment_type=$3 AND deleted=false
          ORDER BY created_at DESC,file_name`,
    values:[access.tenantId,taskId,type]
  });
  return {attachments:r.rows};
}

async function uploadAttachment(ctx,type){
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  await ensureSchema(ctx);
  const taskId=clean(ctx.body.task_id);
  const fileName=clean(ctx.body.file_name);
  const parsed=parseDataUrl(ctx.body.data_url);
  if(!taskId||!fileName||!parsed)return ctx.send(400,{error:'Task id, file name and data are required'});
  if(!await requireTask(ctx,access,taskId))return ctx.send(404,{error:'Task not found'});
  const size=Buffer.from(parsed.base64,'base64').length;
  if(size>10*1024*1024)return ctx.send(400,{error:'Document must be 10MB or smaller'});
  const r=await ctx.broker('core_tasks','query',{
    text:`INSERT INTO tasks_task_attachment(
            tenant_id,task_id,attachment_type,file_name,mime_type,file_size,file_data,created_by_email
          )
          VALUES($1,$2,$3,$4,$5,$6,decode($7,'base64'),$8)
          RETURNING attachment_id,file_name,mime_type,file_size,created_by_email,created_at`,
    values:[access.tenantId,taskId,type,fileName,parsed.mimeType,size,parsed.base64,access.auth.email]
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
  const r=await ctx.broker('core_tasks','query',{
    text:`UPDATE tasks_task_attachment
          SET deleted=true,deleted_at=now(),updated_at=now()
          WHERE tenant_id=$1 AND attachment_id=$2 AND attachment_type=$3 AND deleted=false
          RETURNING attachment_id`,
    values:[access.tenantId,id,type]
  });
  if(!r.rowCount)return ctx.send(404,{error:'Attachment not found'});
  return {deleted:r.rowCount};
}

module.exports={listAttachments,uploadAttachment,deleteAttachment};
