'use strict';
const {ensureSchema,authTenant}=require('../_shared/items');

const adminRoles=['owner','tenant_administrator'];

function requireExportAccess(access){
  if(access.status)return access;
  if(!adminRoles.includes(access.role))return {status:403,body:{error:'Tenant administrator access required'}};
  return null;
}

module.exports=async ctx=>{
  if(ctx.req.method!=='GET'&&ctx.req.method!=='POST')return ctx.send(405,{error:'GET or POST required'});
  await ensureSchema(ctx);
  const access=await authTenant(ctx);
  const denied=requireExportAccess(access);
  if(denied)return ctx.send(denied.status,denied.body);

  const includeOpenAISettings=ctx.body?.include_openai_settings===true||ctx.query.include_openai_settings==='true';
  const statements=[
    {text:`SELECT object_type_id,tenant_id,type_name,type_description,sort_order,status,deleted,deleted_at,created_at,updated_at
           FROM objectsphere_object_type
           WHERE tenant_id=$1
           ORDER BY sort_order,type_name`,values:[access.tenantId]},
    {text:`SELECT attribute_id,tenant_id,object_type_id,attribute_name,attribute_type,sort_order,status,deleted,deleted_at,created_at,updated_at
           FROM objectsphere_attribute
           WHERE tenant_id=$1
           ORDER BY sort_order,attribute_name`,values:[access.tenantId]},
    {text:`SELECT item_id,tenant_id,parent_item_id,item_name,item_description,quantity,latitude::float AS latitude,longitude::float AS longitude,sort_order,status,created_by_email,updated_by_email,
                  archived_at,deleted_at,created_at,updated_at
           FROM objectsphere_item
           WHERE tenant_id=$1
           ORDER BY created_at,item_name`,values:[access.tenantId]},
    {text:`SELECT item_type_id,tenant_id,item_id,object_type_id,status,created_at,updated_at
           FROM objectsphere_item_type
           WHERE tenant_id=$1
           ORDER BY created_at`,values:[access.tenantId]},
    {text:`SELECT value_id,tenant_id,item_id,attribute_id,value_text,created_at,updated_at
           FROM objectsphere_attribute_value
           WHERE tenant_id=$1
           ORDER BY created_at`,values:[access.tenantId]},
    {text:`SELECT history_id,tenant_id,item_id,attribute_id,object_type_id,item_name,object_type_name,attribute_name,
                  old_value_text,new_value_text,changed_by_email,changed_at
           FROM objectsphere_attribute_value_history
           WHERE tenant_id=$1
           ORDER BY changed_at`,values:[access.tenantId]},
    {text:`SELECT attachment_id,tenant_id,item_id,attachment_type,file_name,mime_type,file_size,encode(file_data,'base64') file_data_base64,
                  deleted,deleted_at,created_by_email,created_at,updated_at
           FROM objectsphere_item_attachment
           WHERE tenant_id=$1
           ORDER BY created_at,file_name`,values:[access.tenantId]},
    {text:`SELECT event_type_id,tenant_id,type_name,type_description,sort_order,default_severity,status,deleted,deleted_at,created_at,updated_at
           FROM objectsphere_event_type
           WHERE tenant_id=$1
           ORDER BY sort_order,type_name`,values:[access.tenantId]},
    {text:`SELECT event_id,tenant_id,item_id,event_type_id,event_title,event_description,event_at,severity,status,reported_by_email,
                  created_by_email,updated_by_email,deleted,deleted_at,created_at,updated_at
           FROM objectsphere_event
           WHERE tenant_id=$1
           ORDER BY event_at,created_at`,values:[access.tenantId]}
  ];
  if(includeOpenAISettings){
    statements.push({
      text:`SELECT tenant_id,api_key_ciphertext,api_key_iv,api_key_tag,model,updated_by_email,updated_at
            FROM objectsphere_tenant_openai_setting
            WHERE tenant_id=$1`,
      values:[access.tenantId]
    });
  }

  const r=await ctx.broker('core_objectsphere','transaction',{statements});
  const keys=[
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
  const data=Object.fromEntries(keys.map((key,index)=>[key,r.results[index].rows]));
  if(includeOpenAISettings)data.openai_setting=r.results[9].rows[0]||null;

  return {
    format:'objectsphere-tenant-export',
    version:1,
    exported_at:new Date().toISOString(),
    source_tenant_id:access.tenantId,
    exported_by_email:access.auth.email,
    includes_openai_settings:includeOpenAISettings,
    data,
    counts:Object.fromEntries(keys.map(key=>[key,data[key].length]))
  };
};
