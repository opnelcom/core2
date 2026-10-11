'use strict';
const {authTenant,clean,requireModuleAccess,requireResourcePermission}=require('../../_shared/erp');

const entityKinds=new Set(['gl_account','subledger_account','journal','legal_entity','accounting_object']);

function parseDataUrl(value){
  const match=String(value||'').match(/^data:([^;,]+);base64,(.+)$/);
  if(!match)return null;
  return {mimeType:match[1],base64:match[2]};
}

async function requireEntity(ctx,access,orgId,kind,id,workflowStatus='view'){
  const tables={
    gl_account:['erp_gl_account','gl_account_id'],
    subledger_account:['erp_subledger_account','subledger_account_id'],
    journal:['erp_journal','journal_id'],
    legal_entity:['erp_legal_entity','legal_entity_id'],
    accounting_object:['erp_accounting_object','accounting_object_id']
  };
  const [table,column]=tables[kind]||[];
  if(!table)return false;
  const r=await ctx.broker('core_erp','query',{
    text:`SELECT ${kind==='accounting_object'?'accounting_object_type_id,owner_division_id':'1'} FROM ${table}
          WHERE tenant_id=$1 AND organisation_id=$2 AND ${column}=$3
          AND workflow_status <> 'deleted'`,
    values:[access.tenantId,orgId,id]
  });
  if(!r.rowCount)return false;
  if(kind==='accounting_object'){
    const object=r.rows[0];
    const moduleDenied=await requireModuleAccess(ctx,access,{organisationId:orgId,resourceKind:'accounting_object_type',resourceCode:object.accounting_object_type_id});
    if(moduleDenied)return moduleDenied;
    const denied=await requireResourcePermission(ctx,access,{organisationId:orgId,divisionId:object.owner_division_id,resourceKind:'accounting_object',resourceCode:object.accounting_object_type_id,workflowStatus});
    if(denied)return denied;
  }
  return true;
}

async function listDocuments(ctx){
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=clean(ctx.query.organisation_id||ctx.body.organisation_id);
  const kind=clean(ctx.query.entity_kind||ctx.body.entity_kind);
  const entityId=clean(ctx.query.entity_id||ctx.body.entity_id);
  if(!orgId||!kind||!entityId)return ctx.send(400,{error:'Organisation, entity kind and entity id are required'});
  if(!entityKinds.has(kind))return ctx.send(400,{error:'Unsupported entity kind'});
  const entity=await requireEntity(ctx,access,orgId,kind,entityId);
  if(!entity)return ctx.send(404,{error:'Entity not found'});
  if(entity.status)return ctx.send(entity.status,entity.body);
  const r=await ctx.broker('core_erp','query',{
    text:`SELECT document_id,entity_kind,entity_id,document_type,file_name,mime_type,file_size,description,created_by_email,created_at,
                 'data:' || mime_type || ';base64,' || encode(file_data,'base64') AS data_url
          FROM erp_supporting_document
          WHERE tenant_id=$1 AND organisation_id=$2 AND entity_kind=$3 AND entity_id=$4 AND deleted=false
          ORDER BY created_at DESC,file_name`,
    values:[access.tenantId,orgId,kind,entityId]
  });
  return {documents:r.rows};
}

async function uploadDocument(ctx){
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=clean(ctx.body.organisation_id);
  const kind=clean(ctx.body.entity_kind);
  const entityId=clean(ctx.body.entity_id);
  const fileName=clean(ctx.body.file_name);
  const documentType=clean(ctx.body.document_type,'other');
  const description=clean(ctx.body.description);
  const parsed=parseDataUrl(ctx.body.data_url);
  if(!orgId||!kind||!entityId||!fileName||!parsed)return ctx.send(400,{error:'Organisation, entity, file name and data are required'});
  if(!entityKinds.has(kind))return ctx.send(400,{error:'Unsupported entity kind'});
  const entity=await requireEntity(ctx,access,orgId,kind,entityId,'*');
  if(!entity)return ctx.send(404,{error:'Entity not found'});
  if(entity.status)return ctx.send(entity.status,entity.body);
  const size=Buffer.from(parsed.base64,'base64').length;
  if(size>10*1024*1024)return ctx.send(400,{error:'Document must be 10MB or smaller'});
  const r=await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_supporting_document(
            tenant_id,organisation_id,entity_kind,entity_id,document_type,file_name,mime_type,file_size,file_data,description,created_by_email
          )
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,decode($9,'base64'),$10,$11)
          RETURNING document_id,entity_kind,entity_id,document_type,file_name,mime_type,file_size,description,created_by_email,created_at`,
    values:[access.tenantId,orgId,kind,entityId,documentType,fileName,parsed.mimeType,size,parsed.base64,description,access.auth.email]
  });
  return ctx.send(201,{document:r.rows[0]});
}

async function deleteDocument(ctx){
  if(ctx.req.method!=='POST'&&ctx.req.method!=='DELETE')return ctx.send(405,{error:'POST or DELETE required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const id=clean(ctx.body.document_id||ctx.query.document_id);
  if(!id)return ctx.send(400,{error:'Document id is required'});
  const document=await ctx.broker('core_erp','query',{
    text:`SELECT organisation_id,entity_kind,entity_id FROM erp_supporting_document WHERE tenant_id=$1 AND document_id=$2 AND deleted=false`,
    values:[access.tenantId,id]
  });
  if(!document.rowCount)return ctx.send(404,{error:'Document not found'});
  const record=document.rows[0];
  if(record.entity_kind==='accounting_object'){
    const entity=await requireEntity(ctx,access,record.organisation_id,record.entity_kind,record.entity_id,'*');
    if(!entity)return ctx.send(404,{error:'Entity not found'});
    if(entity.status)return ctx.send(entity.status,entity.body);
  }
  const r=await ctx.broker('core_erp','query',{
    text:`UPDATE erp_supporting_document
          SET deleted=true,deleted_at=now(),updated_at=now()
          WHERE tenant_id=$1 AND document_id=$2 AND deleted=false
          RETURNING document_id`,
    values:[access.tenantId,id]
  });
  if(!r.rowCount)return ctx.send(404,{error:'Document not found'});
  return {deleted:r.rowCount};
}

module.exports={listDocuments,uploadDocument,deleteDocument};
