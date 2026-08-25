'use strict';
const {authTenant,clean,nullable,parseJson,topLevelSearch,validateSchema}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const id=nullable(ctx.body.master_data_record_id);
  const orgId=ctx.body.organisation_id;
  const typeId=ctx.body.master_data_type_id;
  const divisionId=ctx.body.owner_division_id;
  const code=clean(ctx.body.record_code);
  const display=clean(ctx.body.display_name);
  if(!orgId||!typeId||!divisionId||!code||!display)return ctx.send(400,{error:'Organisation, type, division, code and display name are required'});
  const type=await ctx.broker('core_erp','query',{text:`SELECT * FROM erp_master_data_type WHERE tenant_id=$1 AND organisation_id=$2 AND master_data_type_id=$3`,values:[access.tenantId,orgId,typeId]});
  if(!type.rowCount)return ctx.send(404,{error:'Master data type not found'});
  let data;
  try{
    data=parseJson(ctx.body.additional_data,{});
  }catch{
    return ctx.send(400,{error:'Additional data must be valid JSON'});
  }
  const errors=validateSchema(type.rows[0].schema_json,data);
  if(errors.length)return ctx.send(400,{error:'Additional data is invalid',errors});
  const search=topLevelSearch(type.rows[0].schema_json,data);
  const values=[access.tenantId,orgId,divisionId,typeId,nullable(ctx.body.ledger_account_id),code,display,type.rows[0].schema_version,JSON.stringify(data),JSON.stringify(search),access.auth.email];
  const text=id
    ? `UPDATE erp_master_data_record
       SET owner_division_id=$3,master_data_type_id=$4,ledger_account_id=$5,record_code=$6,display_name=$7,schema_version=$8,additional_data=$9::jsonb,top_level_search=$10::jsonb,updated_by_email=$11,updated_at=now()
       WHERE tenant_id=$1 AND organisation_id=$2 AND master_data_record_id=$12 AND workflow_status IN('draft','rejected','approved')
       RETURNING *`
    : `INSERT INTO erp_master_data_record(tenant_id,organisation_id,owner_division_id,master_data_type_id,ledger_account_id,record_code,display_name,schema_version,additional_data,top_level_search,workflow_status,created_by_email,updated_by_email)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,'draft',$11,$11) RETURNING *`;
  const r=await ctx.broker('core_erp','query',{text,values:id?[...values,id]:values});
  if(!r.rowCount)return ctx.send(404,{error:'Master data record not found or cannot be edited'});
  return {record:r.rows[0]};
};
