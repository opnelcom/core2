'use strict';

const {isAdministrator}=require('./access');
const {authTenant}=require('./auth');
const {clean,nullable}=require('./utils');
const {hasWorkflowActionRole,workflowActionRoleSql}=require('./workflow-action-roles');

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
  const types={subledger_account:['erp_subledger_account','subledger_account_id','erp_subledger_account_type','subledger_account_type_id'],accounting_dimension:['erp_accounting_dimension','accounting_dimension_id','erp_accounting_dimension_type','accounting_dimension_type_id']};
  const t=types[kind];
  return t?{objectType:kind,table:t[0],idColumn:t[1],typeTable:t[2],typeIdColumn:t[3],resourceKind:kind}:null;
}

async function defaultWorkflowStepCode(ctx,access,{organisationId,typeTable,typeIdColumn,typeId}){
  const result=await ctx.broker('core_erp','query',{
    text:`SELECT step.step_code AS initial_step_code
          FROM ${typeTable} type
          JOIN erp_workflow_path path ON path.workflow_path_id=type.workflow_path_id AND path.tenant_id=type.tenant_id AND path.organisation_id=type.organisation_id
          JOIN erp_workflow_step step ON step.workflow_path_id=path.workflow_path_id AND step.is_initial=true
          WHERE type.tenant_id=$1 AND type.organisation_id=$2 AND type.${typeIdColumn}=$3`,
    values:[access.tenantId,organisationId,typeId]
  });
  return result.rows[0]?.initial_step_code||'draft';
}

async function validateWorkflowPath(ctx,access,{organisationId,workflowPathId}){
  if(!workflowPathId)return null;
  const result=await ctx.broker('core_erp','query',{
    text:`SELECT path.workflow_path_id,step.step_code AS initial_step_code
          FROM erp_workflow_path path
          JOIN erp_workflow_step step ON step.workflow_path_id=path.workflow_path_id
            AND step.is_initial=true
          WHERE path.tenant_id=$1 AND path.organisation_id=$2 AND path.workflow_path_id=$3 AND path.is_active=true`,
    values:[access.tenantId,organisationId,workflowPathId]
  });
  if(result.rowCount)return null;
  return {status:400,body:{error:'Workflow path must exist and have a valid initial step'}};
}

async function moveWorkflowObject(ctx,access,{kind,id,actionId,comment=''}) {
  const config=workflowObjectConfig(kind);
  if(!config)return {status:400,body:{error:'Unsupported workflow object type'}};
  if(!id||!actionId)return {status:400,body:{error:'Object and workflow action are required'}};
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
  access=await authTenant(ctx,row.organisation_id);
  if(access.status)return access;
  if(!row.workflow_path_id)return {status:400,body:{error:'Object type does not have a workflow path'}};
  const moduleDenied=await require('./access').requireModuleAccess(ctx,access,{organisationId:row.organisation_id,resourceKind:kind+'_type',resourceCode:row.object_type_id});
  if(moduleDenied)return moduleDenied;
  const transition=await ctx.broker('core_erp','query',{
    text:`SELECT next.next_step_code,next.action_label
          FROM erp_workflow_next next
          JOIN erp_workflow_step current_step ON current_step.workflow_path_id=next.workflow_path_id
            AND current_step.step_code=next.current_step_code
          JOIN erp_workflow_step next_step ON next_step.workflow_path_id=next.workflow_path_id
            AND next_step.step_code=next.next_step_code
          WHERE next.tenant_id=$1
            AND next.organisation_id=$2
            AND next.workflow_path_id=$3
            AND next.current_step_code=$4
            AND next.workflow_next_id=$5 AND EXISTS(SELECT 1 FROM erp_workflow_path p WHERE p.workflow_path_id=next.workflow_path_id AND p.is_active=true)`,
    values:[access.tenantId,row.organisation_id,row.workflow_path_id,row.workflow_status,actionId]
  });
  if(!transition.rowCount)return {status:400,body:{error:'Workflow move is not configured for the current step'}};
  if(!await hasWorkflowActionRole(ctx,access,row.organisation_id,actionId))return {status:403,body:{error:'You do not hold an assigned permission role for this workflow action'}};
  const targetCode=transition.rows[0].next_step_code;
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
              AND ($11::boolean OR ${workflowActionRoleSql({tenant:'$1',organisation:'$6',action:'$9::uuid',email:'$4'})})
              AND EXISTS(SELECT 1 FROM erp_workflow_next n JOIN erp_workflow_path p ON p.workflow_path_id=n.workflow_path_id JOIN ${config.typeTable} t ON t.workflow_path_id=p.workflow_path_id WHERE n.workflow_next_id=$9 AND n.tenant_id=$1 AND n.organisation_id=$6 AND p.is_active=true AND t.${config.typeIdColumn}=${config.table}.${config.typeIdColumn} AND n.current_step_code=$5 AND n.next_step_code=$3)
            RETURNING *
          ),
          history AS (
            INSERT INTO erp_workflow_history(tenant_id,organisation_id,object_type,object_id,previous_step_code,new_step_code,user_email,comment,action_label)
            SELECT $1,$6,$7,$2,$5,$3,$4,$8,$10
            FROM updated
            RETURNING *
          )
          SELECT row_to_json(updated) record,row_to_json(history) history
          FROM updated CROSS JOIN history`,
    values:[access.tenantId,id,targetCode,access.auth.email,row.workflow_status,row.organisation_id,config.objectType,nullable(comment),actionId,transition.rows[0].action_label,administrator]
  });
  const updated=result.rows[0]?.record;
  if(!updated)return {status:409,body:{error:'Workflow object changed before the move could be saved'}};
  return {record:updated,history:result.rows[0]?.history};
}

module.exports={normalizeStepCode,workflowObjectConfig,defaultWorkflowStepCode,validateWorkflowPath,moveWorkflowObject};
