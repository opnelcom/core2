"use strict";
const {authTenant,requireModuleAccess,requireResourcePermission,validateJournal,checkPeriodOpen,nullable}=require('../_shared/erp');
const {hasWorkflowActionRole}=require('../_shared/erp/workflow-action-roles');
const {createTransactionPlan}=require('../_shared/erp/transaction-plan');
module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  let access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const id=ctx.body.journal_id,actionId=ctx.body.workflow_next_id;
  if(!id||!actionId)return ctx.send(400,{error:'Journal and workflow action are required'});
  const plan=createTransactionPlan(ctx,['erp_journal','erp_journal_line','erp_workflow_next','erp_workflow_path_status','erp_workflow_path','erp_workflow_status']);
  const plannedCtx={...ctx,broker:async(profile,operation,request)=>operation==='query'?plan.client.query(request.text,request.values):ctx.broker(profile,operation,request)};
  const current=await plan.client.query(`SELECT j.*,t.workflow_path_id,t.is_financial FROM erp_journal j JOIN erp_transaction_type t ON t.transaction_type_id=j.transaction_type_id AND t.tenant_id=j.tenant_id AND t.organisation_id=j.organisation_id WHERE j.tenant_id=$1 AND j.journal_id=$2`,[access.tenantId,id]);
  if(!current.rowCount)return ctx.send(404,{error:'Journal not found'});
  const journal=current.rows[0];
  access=await authTenant(ctx,journal.organisation_id);
  if(access.status)return ctx.send(access.status,access.body);
  const deniedModule=await requireModuleAccess(plannedCtx,access,{organisationId:journal.organisation_id,resourceKind:'transaction_type',resourceCode:journal.transaction_type_id});
  if(deniedModule)return ctx.send(deniedModule.status,deniedModule.body);
  const action=await plan.client.query(`SELECT n.* FROM erp_workflow_next n JOIN erp_workflow_path p ON p.workflow_path_id=n.workflow_path_id WHERE n.tenant_id=$1 AND n.organisation_id=$2 AND n.workflow_path_id=$3 AND n.current_step_code=$4 AND n.workflow_next_id=$5 AND p.is_active=true`,[access.tenantId,journal.organisation_id,journal.workflow_path_id,journal.workflow_status,actionId]);
  if(!action.rowCount)return ctx.send(400,{error:'Action is not configured for this transaction status'});
  if(!await hasWorkflowActionRole(plannedCtx,access,journal.organisation_id,actionId))return ctx.send(403,{error:'You do not hold an assigned permission role for this workflow action'});
  const next=action.rows[0].next_step_code;
  const denied=await requireResourcePermission(plannedCtx,access,{organisationId:journal.organisation_id,divisionId:journal.source_division_id,resourceKind:'transaction',resourceCode:journal.transaction_type_id,workflowStatus:next});
  if(denied)return ctx.send(denied.status,denied.body);
  if(journal.posted_at)return ctx.send(400,{error:'Posted journals cannot change workflow status'});
  const posting=next==='posted';
  if(journal.is_financial&&(posting||next==='submitted')){
    await validateJournal(plannedCtx,access.tenantId,id);
    await checkPeriodOpen(plannedCtx,access.tenantId,journal.fiscal_period_id);
    await require('../_shared/erp/workflow-journals').validateJournalAllocationUse(plannedCtx,access.tenantId,id);
  }
  plan.write({text:`WITH updated AS(UPDATE erp_journal SET workflow_status=$3,updated_by_email=$4,updated_at=now(),submitted_by_email=CASE WHEN $3='submitted' THEN $4 ELSE submitted_by_email END,approved_by_email=CASE WHEN $5 THEN $4 ELSE approved_by_email END,approved_at=CASE WHEN $5 THEN now() ELSE approved_at END,posted_at=CASE WHEN $5 THEN now() ELSE posted_at END,journal_number=CASE WHEN $5 THEN COALESCE(journal_number,'J-'||to_char(now(),'YYYYMMDD')||'-'||left(journal_id::text,8)) ELSE journal_number END WHERE tenant_id=$1 AND journal_id=$2 AND workflow_status=$6 AND posted_at IS NULL RETURNING *) INSERT INTO erp_workflow_history(tenant_id,organisation_id,object_type,object_id,previous_step_code,new_step_code,user_email,comment,action_label) SELECT $1,$7,'journal',$2,$6,$3,$4,$8,$9 FROM updated RETURNING *`,values:[access.tenantId,id,next,access.auth.email,posting&&journal.is_financial,journal.workflow_status,journal.organisation_id,nullable(ctx.body.comment),action.rows[0].action_label],expectedRowCount:1});
  await plan.commit();
  return {ok:true};
};

module.exports=require("../_shared/context").withContext(module.exports);
