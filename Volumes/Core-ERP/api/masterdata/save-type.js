'use strict';
const {authTenant,requireAdmin,clean,nullable,parseJson}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);
  const id=nullable(ctx.body.master_data_type_id);
  const orgId=ctx.body.organisation_id;
  const family=clean(ctx.body.ledger_family_code);
  const code=clean(ctx.body.type_code).toLowerCase();
  const name=clean(ctx.body.type_name);
  if(!orgId||!family||!code||!name)return ctx.send(400,{error:'Organisation, ledger family, type code and name are required'});
  let schema;
  let uiSchema;
  try{
    schema=parseJson(ctx.body.schema_json,{type:'object',properties:{}});
    uiSchema=parseJson(ctx.body.ui_schema_json,{sections:[]});
  }catch{
    return ctx.send(400,{error:'Schema and UI schema must be valid JSON'});
  }
  const values=[access.tenantId,orgId,family,code,name,JSON.stringify(schema),JSON.stringify(uiSchema)];
  const text=id
    ? `UPDATE erp_master_data_type
       SET ledger_family_code=$3,type_code=$4,type_name=$5,schema_json=$6::jsonb,ui_schema_json=$7::jsonb,schema_version=schema_version+1,updated_at=now()
       WHERE tenant_id=$1 AND organisation_id=$2 AND master_data_type_id=$8
       RETURNING *`
    : `INSERT INTO erp_master_data_type(tenant_id,organisation_id,ledger_family_code,type_code,type_name,schema_json,ui_schema_json,schema_version,workflow_status)
       VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,1,'approved') RETURNING *`;
  const r=await ctx.broker('core_erp','query',{text,values:id?[...values,id]:values});
  if(!r.rowCount)return ctx.send(404,{error:'Master data type not found'});
  return {type:r.rows[0]};
};
