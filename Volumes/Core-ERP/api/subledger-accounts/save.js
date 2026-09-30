'use strict';
const {authTenant,requireModuleAccess,requireResourcePermission,clean,nullable,parseJson}=require('../_shared/erp');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const id=nullable(ctx.body.subledger_account_id);
  const orgId=ctx.body.organisation_id;
  const divisionId=ctx.body.owner_division_id;
  const typeId=nullable(ctx.body.subledger_account_type_id);
  const legalEntityId=nullable(ctx.body.legal_entity_id);
  const code=clean(ctx.body.account_code);
  const name=clean(ctx.body.account_name);
  if(!orgId||!divisionId||!typeId||!code||!name)return ctx.send(400,{error:'Organisation, owner division, subledger account type, code and name are required'});
  const moduleDenied=await requireModuleAccess(ctx,access,{organisationId:orgId,resourceKind:'subledger_account_type',resourceCode:typeId});
  if(moduleDenied)return ctx.send(moduleDenied.status,moduleDenied.body);
  const permissionDenied=await requireResourcePermission(ctx,access,{organisationId:orgId,divisionId,resourceKind:'subledger_account',resourceCode:typeId,workflowStatus:'approved'});
  if(permissionDenied)return ctx.send(permissionDenied.status,permissionDenied.body);
  const type=await ctx.broker('core_erp','query',{text:`SELECT requires_legal_entity FROM erp_subledger_account_type WHERE tenant_id=$1 AND organisation_id=$2 AND subledger_account_type_id=$3 AND is_active=true`,values:[access.tenantId,orgId,typeId]});
  if(!type.rowCount)return ctx.send(400,{error:'Subledger account type must be active and belong to this organisation'});
  if(type.rows[0].requires_legal_entity&&!legalEntityId)return ctx.send(400,{error:'This subledger account type requires a legal entity'});
  const values=[access.tenantId,orgId,divisionId,typeId,legalEntityId,code,name,parseJson(ctx.body.additional_data,{}),access.auth.email];
  const result=id
    ? await ctx.broker('core_erp','query',{text:`UPDATE erp_subledger_account SET owner_division_id=$3,subledger_account_type_id=$4,legal_entity_id=$5,account_code=$6,account_name=$7,additional_data=$8::jsonb,updated_by_email=$9,updated_at=now() WHERE tenant_id=$1 AND organisation_id=$2 AND subledger_account_id=$10 AND workflow_status IN('draft','rejected','approved','blocked') RETURNING *`,values:[...values,id]})
    : await ctx.broker('core_erp','query',{text:`INSERT INTO erp_subledger_account(tenant_id,organisation_id,owner_division_id,subledger_account_type_id,legal_entity_id,account_code,account_name,additional_data,workflow_status,created_by_email,updated_by_email,approved_by_email,approved_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'approved',$9,$9,$9,now()) RETURNING *`,values});
  if(!result.rowCount)return ctx.send(404,{error:'Subledger account not found or cannot be edited'});
  return {subledger_account:result.rows[0]};
};
