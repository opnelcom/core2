'use strict';
const {authTenant,requireAdmin,clean,nullable,bool,validateWorkflowPath}=require('../_shared/erp');
const {moduleIds,validateModules,replaceLinks}=require('../_shared/erp/modules');

function object(value){try{const parsed=JSON.parse(clean(value,'{}'));return parsed&&!Array.isArray(parsed)&&typeof parsed==='object'?parsed:null;}catch{return null;}}

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);
  const id=nullable(ctx.body.subledger_account_type_id);
  const orgId=ctx.body.organisation_id;
  const code=clean(ctx.body.type_code).toLowerCase().replace(/\s+/g,'_');
  const name=clean(ctx.body.type_name);
  const workflowPathId=nullable(ctx.body.workflow_path_id);
  const schema=object(ctx.body.schema_json);
  const uiSchema=object(ctx.body.ui_schema_json);
  const selectedModules=moduleIds(ctx.body);
  if(!orgId||!code||!name||!workflowPathId)return ctx.send(400,{error:'Organisation, code, name and workflow path are required'});
  if(!schema||!uiSchema)return ctx.send(400,{error:'Schema and UI schema must be valid JSON objects'});
  const invalidWorkflow=await validateWorkflowPath(ctx,access,{organisationId:orgId,workflowPathId});
  if(invalidWorkflow)return ctx.send(invalidWorkflow.status,invalidWorkflow.body);
  const invalidModules=await validateModules(ctx,access,orgId,selectedModules);
  if(invalidModules)return ctx.send(invalidModules.status,invalidModules.body);
  const result=id
    ? await ctx.broker('core_erp','query',{text:`UPDATE erp_subledger_account_type SET type_code=$3,type_name=$4,type_description=$5,workflow_path_id=$6,requires_legal_entity=$7,schema_json=$8::jsonb,ui_schema_json=$9::jsonb,is_active=$10,updated_at=now() WHERE tenant_id=$1 AND subledger_account_type_id=$2 RETURNING *`,values:[access.tenantId,id,code,name,clean(ctx.body.type_description),workflowPathId,bool(ctx.body.requires_legal_entity),JSON.stringify(schema),JSON.stringify(uiSchema),bool(ctx.body.is_active)]})
    : await ctx.broker('core_erp','query',{text:`INSERT INTO erp_subledger_account_type(tenant_id,organisation_id,type_code,type_name,type_description,workflow_path_id,requires_legal_entity,schema_json,ui_schema_json,is_seeded,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,false,$10) RETURNING *`,values:[access.tenantId,orgId,code,name,clean(ctx.body.type_description),workflowPathId,bool(ctx.body.requires_legal_entity),JSON.stringify(schema),JSON.stringify(uiSchema),bool(ctx.body.is_active)]});
  if(!result.rowCount)return ctx.send(404,{error:'Subledger account type not found'});
  const type=result.rows[0];
  await replaceLinks(ctx,access,orgId,{table:'erp_subledger_account_type_module',idColumn:'subledger_account_type_id',idValue:type.subledger_account_type_id,moduleIds:selectedModules});
  return {subledger_account_type:type};
};
