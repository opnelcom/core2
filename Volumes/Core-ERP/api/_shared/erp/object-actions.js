'use strict';
const classes=require('./object-classes');
const {requireBusinessAccess,hasResourcePermission}=require('./access');
const {defaultWorkflowStepCode}=require('./workflow');
const {workflowUseSql}=require('./workflow-configuration');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
function validate(q){
 if(!['subledger_account','accounting_object'].includes(q.object_kind))fail('Transaction actions support sub-ledgers and accounting objects');
 for(const key of ['organisation_id','object_id'])if(!UUID.test(q[key]||''))fail(`${key} must be a UUID`);
 for(const key of ['source_division_id','transaction_type_id','transaction_line_definition_id'])if(q[key]&&!UUID.test(q[key]))fail(`${key} must be a UUID`);
 if(q.transaction_line_definition_id&&!q.transaction_type_id)fail('Choose a transaction type for the selected line');
 return classes[q.object_kind];
}
function candidateSql(kind){
 const match=kind==='subledger_account'
  ? "line.subledger_account_type_id=$3 AND line.subledger_requirement IN ('optional','mandatory')"
  : `EXISTS(SELECT 1 FROM erp_transaction_line_definition_object_type requirement
    WHERE requirement.tenant_id=$1 AND requirement.organisation_id=$2
    AND requirement.transaction_line_definition_id=line.transaction_line_definition_id
    AND requirement.accounting_object_type_id=$3
    AND line.object_requirement IN ('optional','mandatory') AND line.subledger_requirement='not_used'
    AND (line.object_value_behaviour<>'fixed' OR line.default_accounting_object_id=$4))`;
 return `SELECT tx.transaction_type_id,tx.type_code,tx.type_name,tx.type_description,
 line.transaction_line_definition_id,line.line_order,line.line_code,line.line_description,
 line.debit_credit,line.occurrence,line.amount_source,gl.account_code,gl.account_name
 FROM erp_transaction_type tx JOIN erp_transaction_group grp ON grp.transaction_group_id=tx.transaction_group_id AND grp.tenant_id=tx.tenant_id AND grp.organisation_id=tx.organisation_id
 JOIN erp_transaction_line_definition line ON line.transaction_type_id=tx.transaction_type_id AND line.tenant_id=tx.tenant_id AND line.organisation_id=tx.organisation_id
 JOIN erp_gl_account gl ON gl.gl_account_id=line.gl_account_id AND gl.tenant_id=line.tenant_id AND gl.organisation_id=line.organisation_id
 WHERE tx.tenant_id=$1 AND tx.organisation_id=$2 AND tx.is_active=true AND grp.is_active=true AND ${match}
 AND ($5::uuid IS NULL OR tx.transaction_type_id=$5) AND ($4::uuid IS NOT NULL)
 ORDER BY grp.sort_order,tx.sort_order,tx.type_name,line.line_order,line.transaction_line_definition_id`;
}
async function listActions(ctx,access){
 const q=ctx.query,m=validate(q);
 const denied=await requireBusinessAccess(ctx,access,q.organisation_id);if(denied)fail(denied.body.error,denied.status);
 const record=await ctx.broker('core_erp','query',{
  text:`SELECT o.${m.id} object_id,o.${m.type} object_type_id,o.${m.code} object_code,o.${m.name} object_name,o.owner_division_id,
   t.type_name,${workflowUseSql('o','t')} enabled_for_use
   FROM ${m.table} o JOIN ${m.types} t ON t.${m.type}=o.${m.type} AND t.tenant_id=o.tenant_id AND t.organisation_id=o.organisation_id
   WHERE o.tenant_id=$1 AND o.organisation_id=$2 AND o.${m.id}=$3 AND o.workflow_status<>'deleted'`,
  values:[access.tenantId,q.organisation_id,q.object_id]
 });
 const object=record.rows[0];if(!object)fail('Object not found in this organisation',404);
 if(!await hasResourcePermission(ctx,access,{organisationId:q.organisation_id,divisionId:object.owner_division_id,resourceKind:q.object_kind,resourceCode:object.object_type_id,workflowStatus:'view'}))fail('You do not have permission to view this object',403);
 const divisionId=q.source_division_id||object.owner_division_id;
 const division=await ctx.broker('core_erp','query',{text:'SELECT division_id FROM erp_division WHERE tenant_id=$1 AND organisation_id=$2 AND division_id=$3',values:[access.tenantId,q.organisation_id,divisionId]});
 if(!division.rows.length)fail('Choose a source division belonging to this organisation');
 const response={organisation_id:q.organisation_id,object_kind:q.object_kind,object,source_division_id:divisionId,transactions:[]};
 if(object.enabled_for_use!==true&&object.enabled_for_use!==1){
  if(q.transaction_type_id)fail('This object is not enabled for transaction use',409);
  return {...response,transaction_message:'This object is not enabled for transaction use.'};
 }
 const candidates=await ctx.broker('core_erp','query',{text:candidateSql(q.object_kind),values:[access.tenantId,q.organisation_id,object.object_type_id,object.object_id,q.transaction_type_id||null]});
 const groups=new Map();
 for(const line of candidates.rows){
  if(!groups.has(line.transaction_type_id))groups.set(line.transaction_type_id,{transaction_type_id:line.transaction_type_id,type_code:line.type_code,type_name:line.type_name,type_description:line.type_description,lines:[]});
  groups.get(line.transaction_type_id).lines.push({transaction_line_definition_id:line.transaction_line_definition_id,line_order:line.line_order,line_code:line.line_code,line_description:line.line_description,debit_credit:line.debit_credit,occurrence:line.occurrence,amount_source:line.amount_source,account_code:line.account_code,account_name:line.account_name});
 }
 for(const transaction of groups.values()){
  const initial=await defaultWorkflowStepCode(ctx,access,{organisationId:q.organisation_id,typeTable:'erp_transaction_type',typeIdColumn:'transaction_type_id',typeId:transaction.transaction_type_id});
  if(await hasResourcePermission(ctx,access,{organisationId:q.organisation_id,divisionId,resourceKind:'transaction',resourceCode:transaction.transaction_type_id,workflowStatus:initial}))response.transactions.push(transaction);
 }
 if(q.transaction_type_id&&!response.transactions.length)fail('This transaction action is no longer available',403);
 if(q.transaction_line_definition_id&&!response.transactions[0]?.lines.some(l=>l.transaction_line_definition_id===q.transaction_line_definition_id))fail('The selected line no longer accepts this object',409);
 return response;
}
module.exports={validate,candidateSql,listActions};
