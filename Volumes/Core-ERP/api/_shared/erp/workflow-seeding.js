"use strict";
const {randomUUID}=require('crypto');
const {normaliseWorkflow,workflowStatements}=require('./workflow-configuration');
async function seedWorkflowDefinitions(ctx,access,orgId,{workflowStatuses,workflows}){
  const statements=workflowStatuses.map(s=>({text:`INSERT INTO erp_workflow_status(tenant_id,organisation_id,status_code,status_label,description,colour,enabled_for_use,displayed,transitional) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(tenant_id,organisation_id,status_code) DO UPDATE SET status_label=excluded.status_label,description=excluded.description,colour=excluded.colour,enabled_for_use=excluded.enabled_for_use,displayed=excluded.displayed,transitional=excluded.transitional,updated_at=now()`,values:[access.tenantId,orgId,s.status_code,s.status_label,s.description,s.colour,s.enabled_for_use===true,s.displayed!==false,s.transitional===true]}));
  await ctx.broker('core_erp','transaction',{statements});
  for(const body of workflows){
    const current=await ctx.broker('core_erp','query',{text:`SELECT workflow_path_id FROM erp_workflow_path WHERE tenant_id=$1 AND organisation_id=$2 AND path_name=$3`,values:[access.tenantId,orgId,body.path_name]});
    await ctx.broker('core_erp','transaction',{statements:workflowStatements(access.tenantId,orgId,current.rows[0]?.workflow_path_id||randomUUID(),normaliseWorkflow(body,workflowStatuses),{seeded:true,existing:!!current.rowCount})});
  }
  // Retire the duplicate from earlier template definitions once its seeded paths are rebuilt.
  await ctx.broker('core_erp','query',{
    text:`DELETE FROM erp_workflow_status s WHERE s.tenant_id=$1 AND s.organisation_id=$2 AND s.status_code='activated'
      AND NOT EXISTS(SELECT 1 FROM erp_workflow_path_status p WHERE p.tenant_id=s.tenant_id AND p.organisation_id=s.organisation_id AND p.step_code=s.status_code)`,
    values:[access.tenantId,orgId]
  });
}
async function seedWorkflowBindings(ctx,access,orgId){
  const statements=[];
  for(const [table,column,codes,path] of [
    ['erp_subledger_account_type','type_code',['vendor','supplier','customer'],'Full Master Data Management'],
    ['erp_accounting_object_type','type_code',['property'],'Simple Master Data'],
    ['erp_accounting_object_type','type_code',['contract','fleet_vehicle'],'Full Master Data Management'],
    ['erp_accounting_object_type','type_code',['work_order'],'Maintenance'],
    ['erp_accounting_object_type','type_code',['insurance_claim'],'Insurance Claim'],
    ['erp_accounting_object_type','type_code',['sales_lead'],'Sales Lead'],
    ['erp_accounting_object_type','type_code',['sales_opportunity'],'Sales Opportunity'],
    ['erp_transaction_type','type_code',[],'Transaction Management']
  ])statements.push({text:`UPDATE ${table} t SET workflow_path_id=p.workflow_path_id FROM erp_workflow_path p WHERE t.tenant_id=$1 AND t.organisation_id=$2 AND p.tenant_id=t.tenant_id AND p.organisation_id=t.organisation_id AND p.path_name=$3 AND (cardinality($4::text[])=0 OR t.${column}=ANY($4::text[]))`,values:[access.tenantId,orgId,path,codes]});
  await ctx.broker('core_erp','transaction',{statements});
}
async function seedWorkflowActionRoles(ctx,access,orgId,{workflows,roleSeeds}){
  const knownRoles=new Set(roleSeeds.map(role=>role[0]));
  const assignments=[];
  for(const workflow of workflows)for(const step of workflow.steps)for(const action of step.actions){
    if(action.role_codes===undefined)continue;
    if(!Array.isArray(action.role_codes)||action.role_codes.some(code=>!knownRoles.has(code)))
      throw new Error(`Invalid seeded workflow action roles for ${workflow.path_name}: ${action.action_label}`);
    for(const roleCode of new Set(action.role_codes))assignments.push({path_name:workflow.path_name,current_step_code:step.step_code,action_label:action.action_label,role_code:roleCode});
  }
  if(!assignments.length)return;
  await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_workflow_action_role(tenant_id,organisation_id,workflow_next_id,role_id)
      SELECT $1,$2,action.workflow_next_id,role.role_id
      FROM jsonb_to_recordset($3::jsonb) p(path_name text,current_step_code text,action_label text,role_code text)
      JOIN erp_workflow_path path ON path.tenant_id=$1 AND path.organisation_id=$2 AND path.path_name=p.path_name
      JOIN erp_workflow_next action ON action.tenant_id=$1 AND action.organisation_id=$2 AND action.workflow_path_id=path.workflow_path_id AND action.current_step_code=p.current_step_code AND lower(action.action_label)=lower(p.action_label)
      JOIN erp_role role ON role.tenant_id=$1 AND role.organisation_id=$2 AND role.role_code=p.role_code
      ON CONFLICT DO NOTHING`,values:[access.tenantId,orgId,JSON.stringify(assignments)]
  });
}
module.exports={seedWorkflowDefinitions,seedWorkflowBindings,seedWorkflowActionRoles};
