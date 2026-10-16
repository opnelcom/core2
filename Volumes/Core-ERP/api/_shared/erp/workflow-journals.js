"use strict";
const {workflowUseSql}=require('./workflow-configuration');
async function validateJournalAllocationUse(ctx,tenantId,journalId){
  for(const [table,typeTable,idColumn,typeColumn,allocation,foreignKey] of [
    ['erp_subledger_account','erp_subledger_account_type','subledger_account_id','subledger_account_type_id','erp_journal_line','subledger_account_id'],
    ['erp_accounting_object','erp_accounting_object_type','accounting_object_id','accounting_object_type_id','erp_journal_line_accounting_object','accounting_object_id'],
    ['erp_accounting_dimension','erp_accounting_dimension_type','accounting_dimension_id','accounting_dimension_type_id','erp_journal_line_accounting_dimension','accounting_dimension_id']
  ]){
    const r=await ctx.broker('core_erp','query',{text:`SELECT r.${idColumn} FROM ${table} r JOIN ${typeTable} t ON t.${typeColumn}=r.${typeColumn} JOIN ${allocation} a ON a.${foreignKey}=r.${idColumn} ${allocation==='erp_journal_line'?'':'JOIN erp_journal_line l ON l.journal_line_id=a.journal_line_id'} WHERE r.tenant_id=$1 AND ${allocation==='erp_journal_line'?'a':'l'}.journal_id=$2 AND NOT ${workflowUseSql('r','t')}`,values:[tenantId,journalId]});
    if(r.rowCount)throw Object.assign(new Error('A journal allocation is not enabled for use in its workflow status'),{status:400});
  }
}
module.exports={validateJournalAllocationUse};
