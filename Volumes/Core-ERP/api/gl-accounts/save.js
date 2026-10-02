'use strict';
const {randomUUID}=require('crypto');
const {authTenant,requireOrganisationResourcePermission,prepareResourceAssignments,clean,nullable,bool,parseJson}=require('../_shared/erp');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const submittedId=nullable(ctx.body.gl_account_id);
  const id=submittedId||randomUUID();
  const orgId=ctx.body.organisation_id;
  const code=clean(ctx.body.account_code);
  const name=clean(ctx.body.account_name);
  const typeId=nullable(ctx.body.gl_account_type_id);
  const requiredSubledgerTypeId=nullable(ctx.body.required_subledger_account_type_id);
  if(!orgId||!code||!name||!typeId)return ctx.send(400,{error:'Organisation, account type, code and name are required'});
  const denied=await requireOrganisationResourcePermission(ctx,access,{organisationId:orgId,resourceKind:'gl_account',resourceCode:'*',workflowStatus:'approved'});
  if(denied)return ctx.send(denied.status,denied.body);
  const type=await ctx.broker('core_erp','query',{text:`SELECT 1 FROM erp_gl_account_type WHERE tenant_id=$1 AND organisation_id=$2 AND gl_account_type_id=$3 AND is_active=true`,values:[access.tenantId,orgId,typeId]});
  if(!type.rowCount)return ctx.send(400,{error:'GL account type must be active and belong to this organisation'});
  if(requiredSubledgerTypeId){
    const subledgerType=await ctx.broker('core_erp','query',{text:`SELECT 1 FROM erp_subledger_account_type WHERE tenant_id=$1 AND organisation_id=$2 AND subledger_account_type_id=$3 AND is_active=true`,values:[access.tenantId,orgId,requiredSubledgerTypeId]});
    if(!subledgerType.rowCount)return ctx.send(400,{error:'Required subledger account type must be active and belong to this organisation'});
  }
  let validity={valid_from:new Date().toISOString().slice(0,10),valid_to:null};
  if(submittedId){
    const current=await ctx.broker('core_erp','query',{text:`SELECT valid_from,valid_to FROM erp_gl_account WHERE tenant_id=$1 AND organisation_id=$2 AND gl_account_id=$3 AND workflow_status<>'deleted'`,values:[access.tenantId,orgId,id]});
    if(!current.rowCount)return ctx.send(404,{error:'GL account not found or cannot be edited'});
    validity=current.rows[0];
  }
  const resourcePlan=await prepareResourceAssignments(ctx,access,{
    organisationId:orgId,
    objectKind:'gl_account',
    objectTypeId:typeId,
    objectId:id,
    validFrom:validity.valid_from,
    validTo:validity.valid_to,
    assignments:ctx.body.resource_assignments
  });
  if(resourcePlan.errors.length)return ctx.send(400,{error:'Resource assignments are invalid',errors:resourcePlan.errors});
  const values=[access.tenantId,orgId,code,name,typeId,bool(ctx.body.requires_subledger),requiredSubledgerTypeId,parseJson(ctx.body.additional_data,{}),access.auth.email,id];
  const text=submittedId
    ? `UPDATE erp_gl_account SET account_code=$3,account_name=$4,gl_account_type_id=$5,requires_subledger=$6,required_subledger_account_type_id=$7,additional_data=$8::jsonb,updated_by_email=$9,updated_at=now() WHERE tenant_id=$1 AND organisation_id=$2 AND gl_account_id=$10 AND workflow_status IN('draft','rejected','approved','blocked')`
    : `INSERT INTO erp_gl_account(gl_account_id,tenant_id,organisation_id,account_code,account_name,gl_account_type_id,requires_subledger,required_subledger_account_type_id,additional_data,workflow_status,created_by_email,updated_by_email,approved_by_email,approved_at) VALUES($10,$1,$2,$3,$4,$5,$6,$7,$8::jsonb,'approved',$9,$9,$9,now())`;
  const statements=[{text,values}];
  if(resourcePlan.replace)statements.push(...resourcePlan.statements);
  await ctx.broker('core_erp','transaction',{statements});
  const result=await ctx.broker('core_erp','query',{text:`SELECT * FROM erp_gl_account WHERE tenant_id=$1 AND organisation_id=$2 AND gl_account_id=$3`,values:[access.tenantId,orgId,id]});
  if(!result.rowCount)return ctx.send(404,{error:'GL account not found or cannot be edited'});
  return {gl_account:result.rows[0]};
};
