"use strict";
const {hasWorkflowActionRole}=require('./workflow-action-roles');
const {hasResourcePermission}=require('./access');
async function decorateWorkflowRecords(ctx,access,records,{kind,typeTable,typeIdColumn}){
  if(!records.length)return records;
  const orgId=records[0].organisation_id;
  const [types,steps,actions]=await Promise.all([
    ctx.broker('core_erp','query',{text:`SELECT ${typeIdColumn},workflow_path_id FROM ${typeTable} WHERE tenant_id=$1 AND organisation_id=$2`,values:[access.tenantId,orgId]}),
    ctx.broker('core_erp','query',{text:`SELECT s.* FROM erp_workflow_step s JOIN erp_workflow_path p ON p.workflow_path_id=s.workflow_path_id WHERE s.tenant_id=$1 AND s.organisation_id=$2 AND p.is_active=true`,values:[access.tenantId,orgId]}),
    ctx.broker('core_erp','query',{text:`SELECT * FROM erp_workflow_next WHERE tenant_id=$1 AND organisation_id=$2 ORDER BY sort_order,action_label`,values:[access.tenantId,orgId]})
  ]);
  if (kind === 'subledger_account' || kind === 'accounting_dimension') {
    const history = await ctx.broker('core_erp','query',{
      text:`SELECT object_id,previous_step_code,new_step_code,user_email,comment,created_at
            FROM erp_workflow_history
            WHERE tenant_id=$1 AND organisation_id=$2 AND object_type=$3 AND object_id=ANY($4::uuid[])
            ORDER BY created_at DESC`,
      values:[access.tenantId,orgId,kind,records.map(row=>row[`${kind}_id`])]
    });
    const byRecord = new Map();
    for (const entry of history.rows) {
      if (!byRecord.has(entry.object_id)) byRecord.set(entry.object_id,[]);
      byRecord.get(entry.object_id).push(entry);
    }
    for (const row of records) row.workflow_history=byRecord.get(row[`${kind}_id`])||[];
  }
  for(const row of records){
    const type=types.rows.find(t=>t[typeIdColumn]===row[typeIdColumn]);
    const step=steps.rows.find(s=>s.workflow_path_id===type?.workflow_path_id&&s.step_code===row.workflow_status);
    row.workflow_step_label=step?.step_label;row.workflow_step_colour=step?.colour;row.enabled_for_use=step?.enabled_for_use??!type?.workflow_path_id;
    row.available_workflow_steps=[];
    for(const action of actions.rows.filter(a=>a.workflow_path_id===type?.workflow_path_id&&a.current_step_code===row.workflow_status)){
      const next=steps.rows.find(s=>s.workflow_path_id===action.workflow_path_id&&s.step_code===action.next_step_code);
      if(next&&await hasWorkflowActionRole(ctx,access,row.organisation_id,action.workflow_next_id)&&await hasResourcePermission(ctx,access,{organisationId:row.organisation_id,divisionId:row.owner_division_id||row.source_division_id,resourceKind:kind,resourceCode:row[typeIdColumn],workflowStatus:next.step_code}))row.available_workflow_steps.push({...next,workflow_next_id:action.workflow_next_id,action_label:action.action_label});
    }
    if(kind==='transaction'&&row.posted_at)row.available_workflow_steps=[];
  }
  return records;
}
module.exports={decorateWorkflowRecords};
