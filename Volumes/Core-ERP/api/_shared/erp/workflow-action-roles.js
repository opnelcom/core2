"use strict";
const {isAdministrator}=require('./access');

// SQL expressions are supplied by trusted application queries, never request data.
function workflowActionRoleSql({tenant,organisation,action,email}) {
  return `EXISTS(SELECT 1 FROM erp_workflow_action_role action_role
    JOIN erp_role action_permission_role ON action_permission_role.role_id=action_role.role_id
      AND action_permission_role.tenant_id=action_role.tenant_id AND action_permission_role.organisation_id=action_role.organisation_id
    JOIN erp_user_role action_user_role ON action_user_role.role_id=action_role.role_id
      AND action_user_role.tenant_id=action_role.tenant_id AND action_user_role.organisation_id=action_role.organisation_id
    WHERE action_role.tenant_id=${tenant} AND action_role.organisation_id=${organisation}
      AND action_role.workflow_next_id=${action} AND lower(action_user_role.email)=lower(${email})
      AND action_permission_role.is_active=true AND action_user_role.valid_from<=CURRENT_DATE
      AND (action_user_role.valid_to IS NULL OR action_user_role.valid_to>=CURRENT_DATE))`;
}
async function hasWorkflowActionRole(ctx,access,organisationId,actionId) {
  if(isAdministrator(access))return true;
  const result=await ctx.broker('core_erp','query',{
    text:`SELECT 1 WHERE ${workflowActionRoleSql({tenant:'$1',organisation:'$2',action:'$3::uuid',email:'$4'})}`,
    values:[access.tenantId,organisationId,actionId,access.auth.email]
  });
  return !!result.rowCount;
}
async function validateWorkflowActionRoles(ctx,access,organisationId,definition) {
  const ids=[...new Set(definition.actions.flatMap(action=>action.role_ids))];
  if(!ids.length)return null;
  const result=await ctx.broker('core_erp','query',{
    text:`SELECT role_id FROM erp_role WHERE tenant_id=$1 AND organisation_id=$2 AND role_id=ANY($3::uuid[])`,
    values:[access.tenantId,organisationId,ids]
  });
  if(ids.some(id=>!result.rows.some(role=>role.role_id===id)))return {status:400,body:{error:'Every action role must belong to this organisation'}};
  return null;
}
module.exports={workflowActionRoleSql,hasWorkflowActionRole,validateWorkflowActionRoles};
