'use strict';

async function checkPeriodOpen(ctx,tenantId,periodId){
  const r=await ctx.broker('core_erp','query',{text:`SELECT status FROM erp_fiscal_period WHERE tenant_id=$1 AND fiscal_period_id=$2`,values:[tenantId,periodId]});
  if(!r.rowCount)throw Object.assign(new Error('Fiscal period not found'),{status:404});
  if(!['open','soft_closed'].includes(r.rows[0].status))throw Object.assign(new Error('Fiscal period is closed or locked'),{status:400});
}

async function validateJournal(ctx,tenantId,journalId){
  const lines=await ctx.broker('core_erp','query',{
    text:`SELECT l.*,j.transaction_type_id,a.requires_subledger,a.required_subledger_account_type_id,sub.subledger_account_type_id,
                 definition.gl_account_id definition_gl_account_id,definition.debit_credit definition_debit_credit,
                 definition.subledger_requirement,definition.subledger_account_type_id definition_subledger_type_id,
                 (SELECT count(*) FROM erp_transaction_line_definition_object_type requirement WHERE requirement.transaction_line_definition_id=definition.transaction_line_definition_id AND requirement.requirement='mandatory' AND NOT EXISTS (SELECT 1 FROM erp_journal_line_accounting_object allocation WHERE allocation.journal_line_id=l.journal_line_id AND allocation.accounting_object_type_id=requirement.accounting_object_type_id)) missing_object_count,
                 (SELECT count(*) FROM erp_transaction_line_definition_dimension_type requirement WHERE requirement.transaction_line_definition_id=definition.transaction_line_definition_id AND requirement.requirement='mandatory' AND NOT EXISTS (SELECT 1 FROM erp_journal_line_accounting_dimension allocation WHERE allocation.journal_line_id=l.journal_line_id AND allocation.accounting_dimension_type_id=requirement.accounting_dimension_type_id)) missing_dimension_count
          FROM erp_journal_line l
          JOIN erp_journal j ON j.journal_id=l.journal_id
          JOIN erp_gl_account a ON a.gl_account_id=l.gl_account_id
          LEFT JOIN erp_subledger_account sub ON sub.subledger_account_id=l.subledger_account_id
          LEFT JOIN erp_transaction_line_definition definition ON definition.transaction_line_definition_id=l.transaction_line_definition_id AND definition.transaction_type_id=j.transaction_type_id
          WHERE l.tenant_id=$1 AND l.journal_id=$2
          ORDER BY l.line_number`,
    values:[tenantId,journalId]
  });
  if(lines.rows.length<2)throw Object.assign(new Error('Journal needs at least two lines'),{status:400});
  let debits=0;
  let credits=0;
  for(const line of lines.rows){
    debits+=Number(line.debit_amount)||0;
    credits+=Number(line.credit_amount)||0;
    if(line.transaction_line_definition_id&&!line.definition_gl_account_id)throw Object.assign(new Error(`Line ${line.line_number} has an invalid line definition`),{status:400});
    if(line.definition_gl_account_id&&line.gl_account_id!==line.definition_gl_account_id)throw Object.assign(new Error(`Line ${line.line_number} does not use its configured GL account`),{status:400});
    if(line.definition_debit_credit&&((Number(line.debit_amount)>0?'debit':'credit')!==line.definition_debit_credit))throw Object.assign(new Error(`Line ${line.line_number} uses the wrong debit/credit side`),{status:400});
    if(line.subledger_requirement==='mandatory'&&!line.subledger_account_id)throw Object.assign(new Error(`Line ${line.line_number} requires a subledger`),{status:400});
    if(line.subledger_requirement==='not_used'&&line.subledger_account_id)throw Object.assign(new Error(`Line ${line.line_number} does not allow a subledger`),{status:400});
    if(line.definition_subledger_type_id&&line.subledger_account_type_id!==line.definition_subledger_type_id)throw Object.assign(new Error(`Line ${line.line_number} uses the wrong configured subledger type`),{status:400});
    if(Number(line.missing_object_count)>0)throw Object.assign(new Error(`Line ${line.line_number} is missing a mandatory accounting object`),{status:400});
    if(Number(line.missing_dimension_count)>0)throw Object.assign(new Error(`Line ${line.line_number} is missing a mandatory accounting dimension`),{status:400});
    if(line.requires_subledger&&!line.subledger_account_id)throw Object.assign(new Error(`Line ${line.line_number} requires a subledger`),{status:400});
    if(line.requires_subledger&&line.required_subledger_account_type_id&&line.subledger_account_type_id!==line.required_subledger_account_type_id){
      throw Object.assign(new Error(`Line ${line.line_number} uses the wrong subledger account type`),{status:400});
    }
  }
  if(Math.round(debits*100)!==Math.round(credits*100))throw Object.assign(new Error('Journal debits and credits must balance'),{status:400});
}

module.exports={checkPeriodOpen,validateJournal};
