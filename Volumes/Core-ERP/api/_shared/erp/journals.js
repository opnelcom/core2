'use strict';

async function checkPeriodOpen(ctx,tenantId,periodId){
  const r=await ctx.broker('core_erp','query',{text:`SELECT status FROM erp_fiscal_period WHERE tenant_id=$1 AND fiscal_period_id=$2`,values:[tenantId,periodId]});
  if(!r.rowCount)throw Object.assign(new Error('Fiscal period not found'),{status:404});
  if(!['open','soft_closed'].includes(r.rows[0].status))throw Object.assign(new Error('Fiscal period is closed or locked'),{status:400});
}

async function validateJournal(ctx,tenantId,journalId){
  const lines=await ctx.broker('core_erp','query',{
    text:`SELECT l.*,a.requires_subledger,a.required_subledger_family_code,sub.ledger_family_code subledger_family_code
          FROM erp_journal_line l
          JOIN erp_ledger_account a ON a.ledger_account_id=l.gl_account_id
          LEFT JOIN erp_ledger_account sub ON sub.ledger_account_id=l.subledger_account_id
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
    if(line.requires_subledger&&!line.subledger_account_id)throw Object.assign(new Error(`Line ${line.line_number} requires a subledger`),{status:400});
    if(line.requires_subledger&&line.required_subledger_family_code&&line.subledger_family_code!==line.required_subledger_family_code){
      throw Object.assign(new Error(`Line ${line.line_number} requires ${line.required_subledger_family_code} subledger`),{status:400});
    }
  }
  if(Math.round(debits*100)!==Math.round(credits*100))throw Object.assign(new Error('Journal debits and credits must balance'),{status:400});
}

module.exports={checkPeriodOpen,validateJournal};
