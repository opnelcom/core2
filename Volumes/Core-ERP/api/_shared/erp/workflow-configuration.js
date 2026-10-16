"use strict";
const {randomUUID}=require('crypto');
const {clean}=require('./utils');
const {normalizeStepCode}=require('./workflow');
function normaliseWorkflow(body, statuses) {
  const catalogue = new Set(statuses.map(status => status.status_code));
  if (!Array.isArray(body.steps) || !body.steps.length)
    throw new Error('A workflow must contain at least one current status');
  const seen = new Set();
  const steps = body.steps.map(row => {
    const code = normalizeStepCode(row.step_code);
    if (!catalogue.has(code)) throw new Error('Every current status must belong to this organisation');
    if (seen.has(code)) throw new Error('Each current status can appear only once in a workflow');
    seen.add(code);
    const sort = Number(row.sort_order);
    if (!Number.isSafeInteger(sort)) throw new Error('Current status sort must be an integer');
    if (!Array.isArray(row.actions)) throw new Error('Current status actions must be a list');
    const names = new Set();
    const actions = row.actions.map(action => {
      const label = clean(action.action_label);
      const target = normalizeStepCode(action.next_step_code);
      const order = Number(action.sort_order);
      if (!label || !target) throw new Error('Every action requires Next Action and a target status');
      if (!catalogue.has(target)) throw new Error('Target status must belong to this organisation');
      if (!Number.isSafeInteger(order)) throw new Error('Action sort must be an integer');
      if (names.has(label.toLowerCase())) throw new Error('Next Action must be unique within its current status');
      names.add(label.toLowerCase());
      const roleIds=action.role_ids ?? [];
      if(!Array.isArray(roleIds)||roleIds.some(id=>typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))
        throw new Error('Action role_ids must be a list of valid role identifiers');
      return {current_step_code: code, next_step_code: target, action_label: label, sort_order: order,role_ids:[...new Set(roleIds.map(id=>id.toLowerCase()))]};
    });
    return {step_code: code, is_initial: row.is_initial === true,
      enabled_for_use: row.enabled_for_use === undefined ? statuses.find(s => s.status_code === code)?.enabled_for_use === true : row.enabled_for_use === true, sort_order: sort, actions};
  });
  if (steps.filter(step => step.is_initial).length !== 1)
    throw new Error('A workflow must have exactly one initial status');
  const actions = steps.flatMap(step => step.actions);
  if (actions.some(action => !seen.has(action.next_step_code)))
    throw new Error('Every target status must also be a current status in this workflow');
  return {name: clean(body.path_name), steps, actions, isActive: body.is_active !== false};
}

function workflowStatements(tenantId, organisationId, id, definition, {seeded = false, existing = false} = {}) {
  const scope = [tenantId, organisationId, id];
  const statements = [existing ? {
    text: `UPDATE erp_workflow_path SET path_name=$4,is_active=$5,updated_at=now()
      WHERE tenant_id=$1 AND organisation_id=$2 AND workflow_path_id=$3 RETURNING *`,
    values: [...scope, definition.name, definition.isActive], expectedRowCount: 1
  } : {
    text: `INSERT INTO erp_workflow_path(tenant_id,organisation_id,workflow_path_id,path_name,is_active,is_seeded)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    values: [...scope, definition.name, definition.isActive, seeded]
  }];
  statements.push({text: `DELETE FROM erp_workflow_next WHERE tenant_id=$1 AND organisation_id=$2 AND workflow_path_id=$3`, values: scope});
  statements.push({text: `DELETE FROM erp_workflow_path_status WHERE tenant_id=$1 AND organisation_id=$2 AND workflow_path_id=$3`, values: scope});
  for (const step of definition.steps) statements.push({
    text: `INSERT INTO erp_workflow_path_status(tenant_id,organisation_id,workflow_path_id,step_code,is_initial,enabled_for_use,sort_order)
      VALUES($1,$2,$3,$4,$5,$6,$7)`,
    values: [...scope, step.step_code, step.is_initial, step.enabled_for_use, step.sort_order]
  });
  for (const action of definition.actions) {
    const actionId=randomUUID();
    statements.push({text:`INSERT INTO erp_workflow_next(workflow_next_id,tenant_id,organisation_id,workflow_path_id,current_step_code,next_step_code,action_label,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,values:[actionId,...scope,action.current_step_code,action.next_step_code,action.action_label,action.sort_order]});
    for(const roleId of action.role_ids)statements.push({text:`INSERT INTO erp_workflow_action_role(tenant_id,organisation_id,workflow_next_id,role_id) VALUES($1,$2,$3,$4)`,values:[tenantId,organisationId,actionId,roleId]});
  }
  return statements;
}

function workflowUseSql(recordAlias,typeAlias){
  if(!/^[a-z_]+$/.test(recordAlias)||!/^[a-z_]+$/.test(typeAlias))throw new Error('Invalid workflow SQL alias');
  return `(${typeAlias}.workflow_path_id IS NULL OR EXISTS(SELECT 1 FROM erp_workflow_step usable WHERE usable.tenant_id=${recordAlias}.tenant_id AND usable.organisation_id=${recordAlias}.organisation_id AND usable.workflow_path_id=${typeAlias}.workflow_path_id AND usable.step_code=${recordAlias}.workflow_status AND usable.enabled_for_use=true))`;
}
module.exports={normaliseWorkflow,workflowStatements,workflowUseSql};
