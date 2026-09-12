'use strict';
const {authTenant,requireAdmin,clean,nullable,bool,parseJson}=require('../_shared/erp');
const {moduleIds,validateModules,replaceLinks}=require('../_shared/erp/modules');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);
  const id=nullable(ctx.body.accounting_object_type_id);
  const orgId=ctx.body.organisation_id;
  const code=clean(ctx.body.type_code).toLowerCase().replace(/\s+/g,'_');
  const name=clean(ctx.body.type_name);
  const selectedModules=moduleIds(ctx.body);
  if(!orgId||!code||!name)return ctx.send(400,{error:'Organisation, type code and name are required'});
  const invalidModules=await validateModules(ctx,access,orgId,selectedModules);
  if(invalidModules)return ctx.send(invalidModules.status,invalidModules.body);
  let schema;
  let uiSchema;
  try{
    schema=parseJson(ctx.body.schema_json,{type:'object',properties:{}});
    uiSchema=parseJson(ctx.body.ui_schema_json,{sections:[]});
  }catch{
    return ctx.send(400,{error:'Schema and UI schema must be valid JSON'});
  }
  const values=[access.tenantId,orgId,code,name,JSON.stringify(schema),JSON.stringify(uiSchema),bool(ctx.body.is_active)];
  const text=id
    ? `UPDATE erp_accounting_object_type
       SET type_code=$3,type_name=$4,schema_json=$5::jsonb,ui_schema_json=$6::jsonb,is_active=$7,updated_at=now()
       WHERE tenant_id=$1 AND organisation_id=$2 AND accounting_object_type_id=$8
       RETURNING *`
    : `INSERT INTO erp_accounting_object_type(tenant_id,organisation_id,type_code,type_name,schema_json,ui_schema_json,is_seeded,is_active)
       VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,false,$7) RETURNING *`;
  const r=await ctx.broker('core_erp','query',{text,values:id?[...values,id]:values});
  if(!r.rowCount)return ctx.send(404,{error:'Accounting object type not found'});
  await replaceLinks(ctx,access,orgId,{table:'erp_accounting_object_type_module',idColumn:'accounting_object_type_id',idValue:r.rows[0].accounting_object_type_id,moduleIds:selectedModules});
  return {type:r.rows[0]};
};
