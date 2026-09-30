'use strict';

const {isAdministrator}=require('./access');
const {clean,nullable}=require('./utils');

function normalizeStepCode(value){
  return clean(value).toLowerCase().replace(/\s+/g,'_');
}

function workflowObjectConfig(kind){
  if(kind==='accounting_object')return {
    objectType:'accounting_object',
    table:'erp_accounting_object',
    idColumn:'accounting_object_id',
    typeTable:'erp_accounting_object_type',
    typeIdColumn:'accounting_object_type_id',
    resourceKind:'accounting_object'
  };
  return null;
}

async function defaultWorkflowStepCode(ctx,access,{organisationId,typeTable,typeIdColumn,typeId}){
  const result=await ctx.broker('core_erp','query',{
    text:`SELECT path.initial_step_code
          FROM ${typeTable} type
          JOIN erp_workflow_path path ON path.workflow_path_id=type.workflow_path_id
          WHERE type.tenant_id=$1 AND type.organisation_id=$2 AND type.${typeIdColumn}=$3`,
    values:[access.tenantId,organisationId,typeId]
  });
  return result.rows[0]?.initial_step_code||'draft';
}

async function validateWorkflowPath(ctx,access,{organisationId,workflowPathId}){
  if(!workflowPathId)return null;
  const result=await ctx.broker('core_erp','query',{
    text:`SELECT path.workflow_path_id,path.initial_step_code
          FROM erp_workflow_path path
          JOIN erp_workflow_step step ON step.workflow_path_id=path.workflow_path_id
            AND step.step_code=path.initial_step_code
          WHERE path.tenant_id=$1 AND path.organisation_id=$2 AND path.workflow_path_id=$3`,
    values:[access.tenantId,organisationId,workflowPathId]
  });
  if(result.rowCount)return null;
  return {status:400,body:{error:'Workflow path must exist and have a valid initial step'}};
}

async function moveWorkflowObject(ctx,access,{kind,id,nextStepCode,comment=''}) {
  const config=workflowObjectConfig(kind);
  if(!config)return {status:400,body:{error:'Unsupported workflow object type'}};
  const targetCode=normalizeStepCode(nextStepCode);
  if(!id||!targetCode)return {status:400,body:{error:'Object and next workflow step are required'}};
  const current=await ctx.broker('core_erp','query',{
    text:`SELECT object.${config.idColumn} object_id,
                 object.organisation_id,
                 object.owner_division_id,
                 object.workflow_status,
                 type.${config.typeIdColumn} object_type_id,
                 type.workflow_path_id
          FROM ${config.table} object
          JOIN ${config.typeTable} type ON type.${config.typeIdColumn}=object.${config.typeIdColumn}
          WHERE object.tenant_id=$1 AND object.${config.idColumn}=$2`,
    values:[access.tenantId,id]
  });
  if(!current.rowCount)return {status:404,body:{error:'Workflow object not found'}};
  const row=current.rows[0];
  if(!row.workflow_path_id)return {status:400,body:{error:'Object type does not have a workflow path'}};
  const transition=await ctx.broker('core_erp','query',{
    text:`SELECT next.next_step_code
          FROM erp_workflow_next next
          JOIN erp_workflow_step current_step ON current_step.workflow_path_id=next.workflow_path_id
            AND current_step.step_code=next.current_step_code
          JOIN erp_workflow_step next_step ON next_step.workflow_path_id=next.workflow_path_id
            AND next_step.step_code=next.next_step_code
          WHERE next.tenant_id=$1
            AND next.organisation_id=$2
            AND next.workflow_path_id=$3
            AND next.current_step_code=$4
            AND next.next_step_code=$5`,
    values:[access.tenantId,row.organisation_id,row.workflow_path_id,row.workflow_status,targetCode]
  });
  if(!transition.rowCount)return {status:400,body:{error:'Workflow move is not configured for the current step'}};
  const administrator=isAdministrator(access);
  const permitted=administrator?{rowCount:1}:await ctx.broker('core_erp','query',{
    text:`WITH RECURSIVE ancestors AS (
            SELECT division_id,parent_division_id,0 AS depth
            FROM erp_division
            WHERE tenant_id=$1 AND organisation_id=$2 AND division_id=$3
            UNION ALL
            SELECT parent.division_id,parent.parent_division_id,child.depth+1
            FROM erp_division parent
            JOIN ancestors child ON child.parent_division_id=parent.division_id
            WHERE parent.tenant_id=$1 AND parent.organisation_id=$2
          )
          SELECT 1
          FROM erp_user_role ur
          JOIN erp_role role ON role.role_id=ur.role_id
          JOIN erp_role_permission rp ON rp.role_id=role.role_id
          JOIN ancestors scope ON scope.division_id=rp.division_id
          WHERE ur.tenant_id=$1
            AND ur.organisation_id=$2
            AND lower(ur.email)=lower($7)
            AND role.is_active=true
            AND ur.valid_from <= CURRENT_DATE
            AND (ur.valid_to IS NULL OR ur.valid_to >= CURRENT_DATE)
            AND rp.resource_kind=$4
            AND (rp.resource_code=$5 OR rp.resource_code='*')
            AND (rp.workflow_status=$6 OR rp.workflow_status='*')
            AND rp.valid_from <= CURRENT_DATE
            AND (rp.valid_to IS NULL OR rp.valid_to >= CURRENT_DATE)
            AND (scope.depth=0 OR rp.applies_to_children=true)
          LIMIT 1`,
    values:[access.tenantId,row.organisation_id,row.owner_division_id,config.resourceKind,row.object_type_id,targetCode,access.auth.email]
  });
  if(!permitted.rowCount)return {status:403,body:{error:'You do not have permission to set that workflow step'}};
  const result=await ctx.broker('core_erp','query',{
    text:`WITH updated AS (
            UPDATE ${config.table}
            SET workflow_status=$3,updated_by_email=$4,updated_at=now()
            WHERE tenant_id=$1 AND ${config.idColumn}=$2 AND workflow_status=$5
            RETURNING *
          ),
          history AS (
            INSERT INTO erp_workflow_history(tenant_id,organisation_id,object_type,object_id,previous_step_code,new_step_code,user_email,comment)
            SELECT $1,$6,$7,$2,$5,$3,$4,$8
            FROM updated
            RETURNING *
          )
          SELECT row_to_json(updated) record,row_to_json(history) history
          FROM updated CROSS JOIN history`,
    values:[access.tenantId,id,targetCode,access.auth.email,row.workflow_status,row.organisation_id,config.objectType,nullable(comment)]
  });
  const updated=result.rows[0]?.record;
  if(!updated)return {status:409,body:{error:'Workflow object changed before the move could be saved'}};
  return {record:updated,history:result.rows[0]?.history};
}

module.exports={normalizeStepCode,workflowObjectConfig,defaultWorkflowStepCode,validateWorkflowPath,moveWorkflowObject};
