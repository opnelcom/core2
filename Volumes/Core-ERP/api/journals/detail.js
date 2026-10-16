'use strict';
const {authTenant,requireModuleAccess,isAdministrator}=require('../_shared/erp');
const {transactionVisibilitySql}=require('../_shared/erp/transaction-visibility');

module.exports=async ctx=>{
  let access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const id=ctx.query.journal_id;
  if(!id)return ctx.send(400,{error:'journal_id is required'});
  const owner=await ctx.broker('core_erp','query',{
    text:`SELECT organisation_id FROM erp_journal WHERE tenant_id=$1 AND journal_id=$2`,values:[access.tenantId,id]
  });
  if(!owner.rows.length)return ctx.send(404,{error:'Journal not found'});
  if(access.organisationId!==owner.rows[0].organisation_id){
    access=await authTenant(ctx,owner.rows[0].organisation_id);
    if(access.status)return ctx.send(access.status,access.body);
  }
  const journal=await ctx.broker('core_erp','query',{
    text:`SELECT j.* FROM erp_journal j WHERE j.tenant_id=$1 AND j.journal_id=$2 AND j.organisation_id=$4
      AND (${transactionVisibilitySql({tenant:'$1',organisation:'$4',division:'j.source_division_id',transactionType:'j.transaction_type_id',status:"CASE WHEN j.workflow_status='reversed' THEN 'approved' ELSE j.workflow_status END",email:'$3',administrator:'$5'})}
        OR lower(j.created_by_email)=lower($3))`,
    values:[access.tenantId,id,access.auth.email,owner.rows[0].organisation_id,isAdministrator(access)]
  });
  if(!journal.rowCount)return ctx.send(404,{error:'Journal not found'});
  const moduleDenied=await requireModuleAccess(ctx,access,{organisationId:journal.rows[0].organisation_id,resourceKind:'transaction_type',resourceCode:journal.rows[0].transaction_type_id});
  if(moduleDenied)return ctx.send(moduleDenied.status,moduleDenied.body);
  const lines=await ctx.broker('core_erp','query',{
    text:`SELECT l.*,gl.account_code gl_account_code,gl.account_name gl_account_name,sub.account_code subledger_account_code,sub.account_name subledger_account_name,d.division_name,
                 COALESCE((SELECT jsonb_agg(jsonb_build_object('accounting_object_type_id',allocation.accounting_object_type_id,'accounting_object_id',allocation.accounting_object_id,'type_name',type.type_name,'object_code',object.object_code,'object_name',object.object_name) ORDER BY type.type_name) FROM erp_journal_line_accounting_object allocation JOIN erp_accounting_object_type type ON type.accounting_object_type_id=allocation.accounting_object_type_id JOIN erp_accounting_object object ON object.accounting_object_id=allocation.accounting_object_id WHERE allocation.journal_line_id=l.journal_line_id),'[]'::jsonb) accounting_objects,
                 COALESCE((SELECT jsonb_agg(jsonb_build_object('accounting_dimension_type_id',allocation.accounting_dimension_type_id,'accounting_dimension_id',allocation.accounting_dimension_id,'type_name',type.type_name,'dimension_code',dimension.dimension_code,'dimension_name',dimension.dimension_name) ORDER BY type.type_name) FROM erp_journal_line_accounting_dimension allocation JOIN erp_accounting_dimension_type type ON type.accounting_dimension_type_id=allocation.accounting_dimension_type_id JOIN erp_accounting_dimension dimension ON dimension.accounting_dimension_id=allocation.accounting_dimension_id WHERE allocation.journal_line_id=l.journal_line_id),'[]'::jsonb) accounting_dimensions
          FROM erp_journal_line l
          JOIN erp_gl_account gl ON gl.gl_account_id=l.gl_account_id
          LEFT JOIN erp_subledger_account sub ON sub.subledger_account_id=l.subledger_account_id
          JOIN erp_division d ON d.division_id=l.division_id
          WHERE l.tenant_id=$1 AND l.journal_id=$2
          ORDER BY l.line_number`,
    values:[access.tenantId,id]
  });
  await require('../_shared/erp/workflow-presentation').decorateWorkflowRecords(ctx,access,journal.rows,{kind:'transaction',typeTable:'erp_transaction_type',typeIdColumn:'transaction_type_id'});
  return {journal:journal.rows[0],lines:lines.rows};
};
