'use strict';
const crypto=require('crypto');
const {ensureSchema,authTenant}=require('../_shared/items');

const adminRoles=['owner','tenant_administrator'];
const dataKeys=[
  'object_types',
  'attributes',
  'items',
  'item_types',
  'attribute_values',
  'attribute_value_history',
  'attachments',
  'event_types',
  'events'
];

function requireImportAccess(access){
  if(access.status)return access;
  if(!adminRoles.includes(access.role))return {status:403,body:{error:'Tenant administrator access required'}};
  return null;
}

function rows(data,key){
  return Array.isArray(data?.[key])?data[key]:[];
}

function mappedValue(map,id){
  if(!id)return null;
  return map.get(id)||null;
}

function cloneRows(exportData,targetTenantId,includeOpenAISettings){
  const typeMap=new Map();
  const attributeMap=new Map();
  const itemMap=new Map();
  const itemTypeMap=new Map();
  const valueMap=new Map();
  const historyMap=new Map();
  const attachmentMap=new Map();
  const eventTypeMap=new Map();
  const eventMap=new Map();

  rows(exportData,'object_types').forEach(row=>typeMap.set(row.object_type_id,crypto.randomUUID()));
  rows(exportData,'attributes').forEach(row=>attributeMap.set(row.attribute_id,crypto.randomUUID()));
  rows(exportData,'items').forEach(row=>itemMap.set(row.item_id,crypto.randomUUID()));
  rows(exportData,'item_types').forEach(row=>itemTypeMap.set(row.item_type_id,crypto.randomUUID()));
  rows(exportData,'attribute_values').forEach(row=>valueMap.set(row.value_id,crypto.randomUUID()));
  rows(exportData,'attribute_value_history').forEach(row=>historyMap.set(row.history_id,crypto.randomUUID()));
  rows(exportData,'attachments').forEach(row=>attachmentMap.set(row.attachment_id,crypto.randomUUID()));
  rows(exportData,'event_types').forEach(row=>eventTypeMap.set(row.event_type_id,crypto.randomUUID()));
  rows(exportData,'events').forEach(row=>eventMap.set(row.event_id,crypto.randomUUID()));

  const objectTypes=rows(exportData,'object_types').map(row=>({
    ...row,
    object_type_id:mappedValue(typeMap,row.object_type_id),
    tenant_id:targetTenantId
  }));
  const attributes=rows(exportData,'attributes').map(row=>({
    ...row,
    attribute_id:mappedValue(attributeMap,row.attribute_id),
    tenant_id:targetTenantId,
    object_type_id:mappedValue(typeMap,row.object_type_id)
  })).filter(row=>row.object_type_id);
  const items=rows(exportData,'items').map(row=>({
    ...row,
    item_id:mappedValue(itemMap,row.item_id),
    tenant_id:targetTenantId,
    parent_item_id:mappedValue(itemMap,row.parent_item_id)
  }));
  const itemTypes=rows(exportData,'item_types').map(row=>({
    ...row,
    item_type_id:mappedValue(itemTypeMap,row.item_type_id),
    tenant_id:targetTenantId,
    item_id:mappedValue(itemMap,row.item_id),
    object_type_id:mappedValue(typeMap,row.object_type_id)
  })).filter(row=>row.item_id&&row.object_type_id);
  const values=rows(exportData,'attribute_values').map(row=>({
    ...row,
    value_id:mappedValue(valueMap,row.value_id),
    tenant_id:targetTenantId,
    item_id:mappedValue(itemMap,row.item_id),
    attribute_id:mappedValue(attributeMap,row.attribute_id)
  })).filter(row=>row.item_id&&row.attribute_id);
  const histories=rows(exportData,'attribute_value_history').map(row=>({
    ...row,
    history_id:mappedValue(historyMap,row.history_id),
    tenant_id:targetTenantId,
    item_id:mappedValue(itemMap,row.item_id),
    attribute_id:mappedValue(attributeMap,row.attribute_id),
    object_type_id:mappedValue(typeMap,row.object_type_id)
  })).filter(row=>row.item_id&&row.attribute_id);
  const attachments=rows(exportData,'attachments').map(row=>({
    ...row,
    attachment_id:mappedValue(attachmentMap,row.attachment_id),
    tenant_id:targetTenantId,
    item_id:mappedValue(itemMap,row.item_id)
  })).filter(row=>row.item_id&&row.file_data_base64);
  const eventTypes=rows(exportData,'event_types').map(row=>({
    ...row,
    event_type_id:mappedValue(eventTypeMap,row.event_type_id),
    tenant_id:targetTenantId
  }));
  const events=rows(exportData,'events').map(row=>({
    ...row,
    event_id:mappedValue(eventMap,row.event_id),
    tenant_id:targetTenantId,
    item_id:mappedValue(itemMap,row.item_id),
    event_type_id:mappedValue(eventTypeMap,row.event_type_id)
  })).filter(row=>row.item_id&&row.event_type_id);
  const openAISetting=includeOpenAISettings&&exportData.openai_setting?{
    ...exportData.openai_setting,
    tenant_id:targetTenantId
  }:null;

  return {objectTypes,attributes,items,itemTypes,values,histories,attachments,eventTypes,events,openAISetting};
}

function insertStatement(key,table,columns,castSql,records){
  if(!records.length)return null;
  return {
    text:`INSERT INTO ${table}(${columns.join(',')})
          SELECT ${castSql}
          FROM jsonb_to_recordset($1::jsonb) AS r(${columns.map(column=>`${column} text`).join(',')})`,
    values:[JSON.stringify(records)]
  };
}

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  await ensureSchema(ctx);
  const access=await authTenant(ctx);
  const denied=requireImportAccess(access);
  if(denied)return ctx.send(denied.status,denied.body);

  const payload=ctx.body.export||ctx.body;
  if(payload?.format!=='objectsphere-tenant-export'||payload.version!==1){
    return ctx.send(400,{error:'Invalid ObjectSphere export format'});
  }
  const mode=ctx.body.mode||'append';
  if(!['append','replace'].includes(mode))return ctx.send(400,{error:'Invalid import mode'});
  const includeOpenAISettings=ctx.body.include_openai_settings===true;
  const cloned=cloneRows(payload.data||{},access.tenantId,includeOpenAISettings);

  const statements=[];
  if(mode==='replace'){
    statements.push(
      {text:`DELETE FROM objectsphere_attribute_value_history WHERE tenant_id=$1`,values:[access.tenantId]},
      {text:`DELETE FROM objectsphere_event WHERE tenant_id=$1`,values:[access.tenantId]},
      {text:`DELETE FROM objectsphere_item_attachment WHERE tenant_id=$1`,values:[access.tenantId]},
      {text:`DELETE FROM objectsphere_attribute_value WHERE tenant_id=$1`,values:[access.tenantId]},
      {text:`DELETE FROM objectsphere_item_type WHERE tenant_id=$1`,values:[access.tenantId]},
      {text:`DELETE FROM objectsphere_attribute WHERE tenant_id=$1`,values:[access.tenantId]},
      {text:`DELETE FROM objectsphere_event_type WHERE tenant_id=$1`,values:[access.tenantId]},
      {text:`DELETE FROM objectsphere_item WHERE tenant_id=$1`,values:[access.tenantId]},
      {text:`DELETE FROM objectsphere_object_type WHERE tenant_id=$1`,values:[access.tenantId]}
    );
    if(includeOpenAISettings)statements.push({text:`DELETE FROM objectsphere_tenant_openai_setting WHERE tenant_id=$1`,values:[access.tenantId]});
  }

  [
    insertStatement('object_types','objectsphere_object_type',
      ['object_type_id','tenant_id','type_name','type_description','sort_order','status','deleted','deleted_at','created_at','updated_at'],
      `r.object_type_id::uuid,r.tenant_id::uuid,r.type_name,COALESCE(r.type_description,''),COALESCE(r.sort_order::integer,0),COALESCE(r.status,'active'),COALESCE(r.deleted::boolean,false),r.deleted_at::timestamptz,COALESCE(r.created_at::timestamptz,now()),COALESCE(r.updated_at::timestamptz,now())`,
      cloned.objectTypes),
    insertStatement('attributes','objectsphere_attribute',
      ['attribute_id','tenant_id','object_type_id','attribute_name','attribute_type','sort_order','status','deleted','deleted_at','created_at','updated_at'],
      `r.attribute_id::uuid,r.tenant_id::uuid,r.object_type_id::uuid,r.attribute_name,r.attribute_type,COALESCE(r.sort_order::integer,0),COALESCE(r.status,'active'),COALESCE(r.deleted::boolean,false),r.deleted_at::timestamptz,COALESCE(r.created_at::timestamptz,now()),COALESCE(r.updated_at::timestamptz,now())`,
      cloned.attributes),
    insertStatement('items','objectsphere_item',
      ['item_id','tenant_id','parent_item_id','item_name','item_description','quantity','latitude','longitude','sort_order','status','created_by_email','updated_by_email','archived_at','deleted_at','created_at','updated_at'],
      `r.item_id::uuid,r.tenant_id::uuid,r.parent_item_id::uuid,r.item_name,COALESCE(r.item_description,''),COALESCE(r.quantity::integer,1),r.latitude::numeric,r.longitude::numeric,COALESCE(r.sort_order::integer,0),COALESCE(r.status,'active'),r.created_by_email,r.updated_by_email,r.archived_at::timestamptz,r.deleted_at::timestamptz,COALESCE(r.created_at::timestamptz,now()),COALESCE(r.updated_at::timestamptz,now())`,
      cloned.items),
    insertStatement('item_types','objectsphere_item_type',
      ['item_type_id','tenant_id','item_id','object_type_id','status','created_at','updated_at'],
      `r.item_type_id::uuid,r.tenant_id::uuid,r.item_id::uuid,r.object_type_id::uuid,COALESCE(r.status,'active'),COALESCE(r.created_at::timestamptz,now()),COALESCE(r.updated_at::timestamptz,now())`,
      cloned.itemTypes),
    insertStatement('attribute_values','objectsphere_attribute_value',
      ['value_id','tenant_id','item_id','attribute_id','value_text','created_at','updated_at'],
      `r.value_id::uuid,r.tenant_id::uuid,r.item_id::uuid,r.attribute_id::uuid,r.value_text,COALESCE(r.created_at::timestamptz,now()),COALESCE(r.updated_at::timestamptz,now())`,
      cloned.values),
    insertStatement('attribute_value_history','objectsphere_attribute_value_history',
      ['history_id','tenant_id','item_id','attribute_id','object_type_id','item_name','object_type_name','attribute_name','old_value_text','new_value_text','changed_by_email','changed_at'],
      `r.history_id::uuid,r.tenant_id::uuid,r.item_id::uuid,r.attribute_id::uuid,r.object_type_id::uuid,COALESCE(r.item_name,''),COALESCE(r.object_type_name,''),COALESCE(r.attribute_name,''),r.old_value_text,r.new_value_text,r.changed_by_email,COALESCE(r.changed_at::timestamptz,now())`,
      cloned.histories),
    insertStatement('event_types','objectsphere_event_type',
      ['event_type_id','tenant_id','type_name','type_description','sort_order','default_severity','status','deleted','deleted_at','created_at','updated_at'],
      `r.event_type_id::uuid,r.tenant_id::uuid,r.type_name,COALESCE(r.type_description,''),COALESCE(r.sort_order::integer,0),COALESCE(r.default_severity,'medium'),COALESCE(r.status,'active'),COALESCE(r.deleted::boolean,false),r.deleted_at::timestamptz,COALESCE(r.created_at::timestamptz,now()),COALESCE(r.updated_at::timestamptz,now())`,
      cloned.eventTypes),
    insertStatement('events','objectsphere_event',
      ['event_id','tenant_id','item_id','event_type_id','event_title','event_description','event_at','severity','status','reported_by_email','created_by_email','updated_by_email','deleted','deleted_at','created_at','updated_at'],
      `r.event_id::uuid,r.tenant_id::uuid,r.item_id::uuid,r.event_type_id::uuid,r.event_title,COALESCE(r.event_description,''),COALESCE(r.event_at::timestamptz,now()),COALESCE(r.severity,'medium'),COALESCE(r.status,'open'),r.reported_by_email,r.created_by_email,r.updated_by_email,COALESCE(r.deleted::boolean,false),r.deleted_at::timestamptz,COALESCE(r.created_at::timestamptz,now()),COALESCE(r.updated_at::timestamptz,now())`,
      cloned.events)
  ].filter(Boolean).forEach(statement=>statements.push(statement));

  if(cloned.attachments.length){
    statements.push({
      text:`INSERT INTO objectsphere_item_attachment(attachment_id,tenant_id,item_id,attachment_type,file_name,mime_type,file_size,file_data,deleted,deleted_at,created_by_email,created_at,updated_at)
            SELECT r.attachment_id::uuid,r.tenant_id::uuid,r.item_id::uuid,r.attachment_type,r.file_name,r.mime_type,
                   COALESCE(r.file_size::integer,0),decode(r.file_data_base64,'base64'),COALESCE(r.deleted::boolean,false),
                   r.deleted_at::timestamptz,r.created_by_email,COALESCE(r.created_at::timestamptz,now()),COALESCE(r.updated_at::timestamptz,now())
            FROM jsonb_to_recordset($1::jsonb) AS r(
              attachment_id text,tenant_id text,item_id text,attachment_type text,file_name text,mime_type text,file_size text,
              file_data_base64 text,deleted text,deleted_at text,created_by_email text,created_at text,updated_at text
            )`,
      values:[JSON.stringify(cloned.attachments)]
    });
  }

  if(cloned.openAISetting){
    statements.push({
      text:`INSERT INTO objectsphere_tenant_openai_setting(tenant_id,api_key_ciphertext,api_key_iv,api_key_tag,model,updated_by_email,updated_at)
            VALUES($1,$2,$3,$4,COALESCE($5,'gpt-4.1-mini'),$6,COALESCE($7::timestamptz,now()))
            ON CONFLICT(tenant_id) DO UPDATE
            SET api_key_ciphertext=excluded.api_key_ciphertext,
                api_key_iv=excluded.api_key_iv,
                api_key_tag=excluded.api_key_tag,
                model=excluded.model,
                updated_by_email=excluded.updated_by_email,
                updated_at=excluded.updated_at`,
      values:[
        cloned.openAISetting.tenant_id,
        cloned.openAISetting.api_key_ciphertext||null,
        cloned.openAISetting.api_key_iv||null,
        cloned.openAISetting.api_key_tag||null,
        cloned.openAISetting.model||null,
        cloned.openAISetting.updated_by_email||null,
        cloned.openAISetting.updated_at||null
      ]
    });
  }

  if(statements.length)await ctx.broker('core_objectsphere','transaction',{statements});
  return {
    imported:true,
    mode,
    target_tenant_id:access.tenantId,
    counts:{
      object_types:cloned.objectTypes.length,
      attributes:cloned.attributes.length,
      items:cloned.items.length,
      item_types:cloned.itemTypes.length,
      attribute_values:cloned.values.length,
      attribute_value_history:cloned.histories.length,
      attachments:cloned.attachments.length,
      event_types:cloned.eventTypes.length,
      events:cloned.events.length,
      openai_setting:cloned.openAISetting?1:0
    },
    skipped:{
      attributes:rows(payload.data,'attributes').length-cloned.attributes.length,
      item_types:rows(payload.data,'item_types').length-cloned.itemTypes.length,
      attribute_values:rows(payload.data,'attribute_values').length-cloned.values.length,
      attribute_value_history:rows(payload.data,'attribute_value_history').length-cloned.histories.length,
      attachments:rows(payload.data,'attachments').length-cloned.attachments.length,
      events:rows(payload.data,'events').length-cloned.events.length
    }
  };
};
