'use strict';
const {authTenant,clean,nullable,money,checkPeriodOpen}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const id=nullable(ctx.body.journal_id);
  const orgId=ctx.body.organisation_id;
  const periodId=ctx.body.fiscal_period_id;
  const divisionId=ctx.body.source_division_id;
  const lines=Array.isArray(ctx.body.lines)?ctx.body.lines:[];
  if(!orgId||!periodId||!divisionId)return ctx.send(400,{error:'Organisation, fiscal period and source division are required'});
  if(lines.length<2)return ctx.send(400,{error:'At least two journal lines are required'});
  await checkPeriodOpen(ctx,access.tenantId,periodId);
  const existing=id?await ctx.broker('core_erp','query',{text:`SELECT workflow_status FROM erp_journal WHERE tenant_id=$1 AND journal_id=$2`,values:[access.tenantId,id]}):null;
  if(existing&&!existing.rowCount)return ctx.send(404,{error:'Journal not found'});
  if(existing&&!['draft','rejected'].includes(existing.rows[0].workflow_status))return ctx.send(400,{error:'Only draft or rejected journals can be edited'});
  const headerValues=[access.tenantId,orgId,nullable(ctx.body.transaction_type_id),periodId,divisionId,clean(ctx.body.journal_date,new Date().toISOString().slice(0,10)),clean(ctx.body.description),clean(ctx.body.currency_code,'ZAR').toUpperCase(),Number(ctx.body.exchange_rate)||1,access.auth.email];
  const header=id
    ? await ctx.broker('core_erp','query',{text:`UPDATE erp_journal SET transaction_type_id=$3,fiscal_period_id=$4,source_division_id=$5,journal_date=$6,description=$7,currency_code=$8,exchange_rate=$9,updated_by_email=$10,updated_at=now() WHERE tenant_id=$1 AND organisation_id=$2 AND journal_id=$11 RETURNING *`,values:[...headerValues,id]})
    : await ctx.broker('core_erp','query',{text:`INSERT INTO erp_journal(tenant_id,organisation_id,transaction_type_id,fiscal_period_id,source_division_id,journal_date,description,currency_code,exchange_rate,workflow_status,created_by_email,updated_by_email) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10,$10) RETURNING *`,values:headerValues});
  const journalId=header.rows[0].journal_id;
  await ctx.broker('core_erp','query',{text:`DELETE FROM erp_journal_line WHERE tenant_id=$1 AND journal_id=$2`,values:[access.tenantId,journalId]});
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    const debit=money(line.debit_amount);
    const credit=money(line.credit_amount);
    if((debit>0&&credit>0)||(debit<=0&&credit<=0))return ctx.send(400,{error:`Line ${i+1} needs either debit or credit amount`});
    await ctx.broker('core_erp','query',{
      text:`INSERT INTO erp_journal_line(tenant_id,organisation_id,journal_id,line_number,division_id,gl_account_id,subledger_account_id,description,debit_amount,credit_amount,currency_code)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      values:[access.tenantId,orgId,journalId,i+1,line.division_id,line.gl_account_id,nullable(line.subledger_account_id),clean(line.description),debit,credit,clean(line.currency_code,header.rows[0].currency_code).toUpperCase()]
    });
  }
  return {journal:header.rows[0]};
};
