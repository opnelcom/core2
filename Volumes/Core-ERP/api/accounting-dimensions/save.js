'use strict';
const {authTenant,clean,nullable,parseJson,validateSchema,requireModuleAccess}=require('../_shared/erp');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const id=nullable(ctx.body.accounting_dimension_id);
  const orgId=ctx.body.organisation_id;
  const typeId=ctx.body.accounting_dimension_type_id;
  const divisionId=ctx.body.owner_division_id;
  const code=clean(ctx.body.dimension_code);
  const name=clean(ctx.body.dimension_name);
  if(!orgId||!typeId||!divisionId||!code||!name)return ctx.send(400,{error:'Organisation, type, division, code and name are required'});
  const moduleDenied=await requireModuleAccess(ctx,access,{organisationId:orgId,resourceKind:'accounting_dimension_type',resourceCode:typeId});
  if(moduleDenied)return ctx.send(moduleDenied.status,moduleDenied.body);
  const type=await ctx.broker('core_erp','query',{text:`SELECT * FROM erp_accounting_dimension_type WHERE tenant_id=$1 AND organisation_id=$2 AND accounting_dimension_type_id=$3`,values:[access.tenantId,orgId,typeId]});
  if(!type.rowCount)return ctx.send(404,{error:'Accounting dimension type not found'});
  let data;
  try{data=parseJson(ctx.body.additional_data,{});}catch{return ctx.send(400,{error:'Additional data must be valid JSON'});}
  const errors=validateSchema(type.rows[0].schema_json,data);
  if(errors.length)return ctx.send(400,{error:'Additional data is invalid',errors});
  const values=[access.tenantId,orgId,divisionId,typeId,code,name,nullable(ctx.body.valid_from),nullable(ctx.body.valid_to),JSON.stringify(data),access.auth.email];
  const text=id
    ? `UPDATE erp_accounting_dimension
       SET owner_division_id=$3,accounting_dimension_type_id=$4,dimension_code=$5,dimension_name=$6,valid_from=COALESCE($7::date,CURRENT_DATE),valid_to=$8::date,additional_data=$9::jsonb,updated_by_email=$10,updated_at=now()
       WHERE tenant_id=$1 AND organisation_id=$2 AND accounting_dimension_id=$11
       RETURNING *`
    : `INSERT INTO erp_accounting_dimension(tenant_id,organisation_id,owner_division_id,accounting_dimension_type_id,dimension_code,dimension_name,workflow_status,valid_from,valid_to,additional_data,created_by_email,updated_by_email)
       VALUES($1,$2,$3,$4,$5,$6,'draft',COALESCE($7::date,CURRENT_DATE),$8::date,$9::jsonb,$10,$10) RETURNING *`;
  const r=await ctx.broker('core_erp','query',{text,values:id?[...values,id]:values});
  if(!r.rowCount)return ctx.send(404,{error:'Accounting dimension not found'});
  return {record:r.rows[0]};
};
