"use strict";
const {randomUUID}=require('crypto');
const {authTenant,requireAdmin,requireBusinessAccess,nullable}=require('../_shared/erp');
const {normaliseWorkflow,workflowStatements}=require('../_shared/erp/workflow-configuration');
module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.req.method==='GET'?ctx.query.organisation_id:ctx.body.organisation_id;
  if(!orgId)return ctx.send(400,{error:'organisation_id is required'});
  if(ctx.req.method==='GET'){
    const denied=await requireBusinessAccess(ctx,access,orgId);
    if(denied)return ctx.send(denied.status,denied.body);
    const results=await Promise.all(['path','step','next','status'].map(table=>ctx.broker('core_erp','query',{text:table==='next'?`SELECT n.*,COALESCE((SELECT array_agg(link.role_id ORDER BY link.role_id) FROM erp_workflow_action_role link WHERE link.tenant_id=n.tenant_id AND link.organisation_id=n.organisation_id AND link.workflow_next_id=n.workflow_next_id),'{}'::uuid[]) role_ids FROM erp_workflow_next n WHERE n.tenant_id=$1 AND n.organisation_id=$2`:`SELECT * FROM erp_workflow_${table} WHERE tenant_id=$1 AND organisation_id=$2`,values:[access.tenantId,orgId]})));
    return Object.fromEntries(['workflow_paths','workflow_steps','workflow_next','workflow_statuses'].map((key,i)=>[key,results[i].rows]));
  }
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'GET or POST required'});
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);
  const statuses=await ctx.broker('core_erp','query',{text:`SELECT * FROM erp_workflow_status WHERE tenant_id=$1 AND organisation_id=$2`,values:[access.tenantId,orgId]});
  let definition;
  try{definition=normaliseWorkflow(ctx.body,statuses.rows);}catch(error){return ctx.send(400,{error:error.message});}
  if(!definition.name)return ctx.send(400,{error:'Workflow name is required'});
  const invalidRoles=await require('../_shared/erp/workflow-action-roles').validateWorkflowActionRoles(ctx,access,orgId,definition);
  if(invalidRoles)return ctx.send(invalidRoles.status,invalidRoles.body);
  const existing=nullable(ctx.body.workflow_path_id),id=existing||randomUUID();
  const result=await ctx.broker('core_erp','transaction',{statements:workflowStatements(access.tenantId,orgId,id,definition,{existing:!!existing})});
  return {ok:true,workflow_path:result.results[0].rows[0]};
};
