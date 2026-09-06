'use strict';
const {authTenant,clean,nullable,money,checkPeriodOpen,requireResourcePermission}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const id=nullable(ctx.body.journal_id);
  const orgId=ctx.body.organisation_id;
  const transactionTypeId=nullable(ctx.body.transaction_type_id);
  const periodId=ctx.body.fiscal_period_id;
  const divisionId=ctx.body.source_division_id;
  const lines=Array.isArray(ctx.body.lines)?ctx.body.lines:[];
  const missing=[
    [orgId,'organisation'],
    [transactionTypeId,'transaction type'],
    [periodId,'fiscal period'],
    [divisionId,'source division']
  ].filter(([value])=>!value).map(([,label])=>label);
  if(missing.length)return ctx.send(400,{error:`Missing required field${missing.length>1?'s':''}: ${missing.join(', ')}`});
  if(lines.length<2)return ctx.send(400,{error:'At least two journal lines are required'});
  await checkPeriodOpen(ctx,access.tenantId,periodId);
  const existing=id?await ctx.broker('core_erp','query',{text:`SELECT workflow_status FROM erp_journal WHERE tenant_id=$1 AND journal_id=$2`,values:[access.tenantId,id]}):null;
  if(existing&&!existing.rowCount)return ctx.send(404,{error:'Journal not found'});
  if(existing&&!['draft','rejected'].includes(existing.rows[0].workflow_status))return ctx.send(400,{error:'Only draft or rejected journals can be edited'});
  const denied=await requireResourcePermission(ctx,access,{
    organisationId:orgId,
    divisionId,
    resourceKind:'transaction',
    resourceCode:transactionTypeId,
    workflowStatus:'draft'
  });
  if(denied)return ctx.send(denied.status,denied.body);
  const normalisedLines=lines.map((line,index)=>{
    const debit=money(line.debit_amount);
    const credit=money(line.credit_amount);
    if((debit>0&&credit>0)||(debit<=0&&credit<=0))throw Object.assign(new Error(`Line ${index+1} needs either debit or credit amount`),{status:400});
    return {
      line_number:index+1,
      division_id:nullable(line.division_id)||divisionId,
      gl_account_id:nullable(line.gl_account_id),
      subledger_account_id:nullable(line.subledger_account_id),
      description:clean(line.description),
      debit_amount:debit,
      credit_amount:credit,
      currency_code:clean(line.currency_code,ctx.body.currency_code||'ZAR').toUpperCase()
    };
  });
  const debitTotal=normalisedLines.reduce((sum,line)=>sum+line.debit_amount,0);
  const creditTotal=normalisedLines.reduce((sum,line)=>sum+line.credit_amount,0);
  if(Math.round(debitTotal*100)!==Math.round(creditTotal*100))return ctx.send(400,{error:'Journal debits and credits must balance'});
  const lineCheck=await ctx.broker('core_erp','query',{
    text:`WITH payload AS (
            SELECT *
            FROM jsonb_to_recordset($3::jsonb)
            AS row(line_number integer,gl_account_id text,subledger_account_id text)
          )
          SELECT p.line_number,
                 p.gl_account_id,
                 gl.requires_subledger,
                 gl.required_subledger_family_code,
                 sub.ledger_family_code AS subledger_family_code,
                 gl.ledger_account_id IS NULL AS missing_gl,
                 p.subledger_account_id IS NOT NULL AND sub.ledger_account_id IS NULL AS missing_subledger
          FROM payload p
          LEFT JOIN erp_ledger_account gl ON gl.tenant_id=$1
            AND gl.organisation_id=$2
            AND gl.ledger_account_id::text=p.gl_account_id
            AND gl.ledger_family_code='gl'
            AND gl.workflow_status <> 'deleted'
          LEFT JOIN erp_ledger_account sub ON sub.tenant_id=$1
            AND sub.organisation_id=$2
            AND sub.ledger_account_id::text=p.subledger_account_id
            AND sub.workflow_status <> 'deleted'
          ORDER BY p.line_number`,
    values:[access.tenantId,orgId,JSON.stringify(normalisedLines)]
  });
  for(const line of lineCheck.rows){
    if(line.missing_gl)return ctx.send(400,{error:`Line ${line.line_number} needs a valid GL account`});
    if(line.missing_subledger)return ctx.send(400,{error:`Line ${line.line_number} needs a valid subledger`});
    if(line.requires_subledger&&!normalisedLines[line.line_number-1].subledger_account_id)return ctx.send(400,{error:`Line ${line.line_number} requires a subledger`});
    if(line.requires_subledger&&line.required_subledger_family_code&&line.subledger_family_code!==line.required_subledger_family_code){
      return ctx.send(400,{error:`Line ${line.line_number} requires ${line.required_subledger_family_code} subledger`});
    }
  }
  const headerValues=[access.tenantId,orgId,transactionTypeId,periodId,divisionId,clean(ctx.body.journal_date,new Date().toISOString().slice(0,10)),clean(ctx.body.description),clean(ctx.body.currency_code,'ZAR').toUpperCase(),Number(ctx.body.exchange_rate)||1,access.auth.email];
  const lineValues=JSON.stringify(normalisedLines);
  const header=id
    ? await ctx.broker('core_erp','query',{
      text:`WITH saved AS (
              UPDATE erp_journal
              SET transaction_type_id=$3,
                  fiscal_period_id=$4,
                  source_division_id=$5,
                  journal_date=$6,
                  description=$7,
                  currency_code=$8,
                  exchange_rate=$9,
                  updated_by_email=$10,
                  updated_at=now()
              WHERE tenant_id=$1
                AND organisation_id=$2
                AND journal_id=$12
              RETURNING *
            ),
            deleted AS (
              DELETE FROM erp_journal_line
              USING saved
              WHERE erp_journal_line.tenant_id=$1
                AND erp_journal_line.journal_id=saved.journal_id
            ),
            payload AS (
              SELECT *
              FROM jsonb_to_recordset($11::jsonb)
              AS row(line_number integer,division_id uuid,gl_account_id uuid,subledger_account_id uuid,description text,debit_amount numeric,credit_amount numeric,currency_code text)
            ),
            inserted AS (
              INSERT INTO erp_journal_line(tenant_id,organisation_id,journal_id,line_number,division_id,gl_account_id,subledger_account_id,description,debit_amount,credit_amount,currency_code)
              SELECT $1,$2,saved.journal_id,p.line_number,p.division_id,p.gl_account_id,p.subledger_account_id,p.description,p.debit_amount,p.credit_amount,p.currency_code
              FROM saved
              CROSS JOIN payload p
            )
            SELECT * FROM saved`,
      values:[...headerValues,lineValues,id]
    })
    : await ctx.broker('core_erp','query',{
      text:`WITH saved AS (
              INSERT INTO erp_journal(tenant_id,organisation_id,transaction_type_id,fiscal_period_id,source_division_id,journal_date,description,currency_code,exchange_rate,workflow_status,created_by_email,updated_by_email)
              VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10,$10)
              RETURNING *
            ),
            payload AS (
              SELECT *
              FROM jsonb_to_recordset($11::jsonb)
              AS row(line_number integer,division_id uuid,gl_account_id uuid,subledger_account_id uuid,description text,debit_amount numeric,credit_amount numeric,currency_code text)
            ),
            inserted AS (
              INSERT INTO erp_journal_line(tenant_id,organisation_id,journal_id,line_number,division_id,gl_account_id,subledger_account_id,description,debit_amount,credit_amount,currency_code)
              SELECT $1,$2,saved.journal_id,p.line_number,p.division_id,p.gl_account_id,p.subledger_account_id,p.description,p.debit_amount,p.credit_amount,p.currency_code
              FROM saved
              CROSS JOIN payload p
            )
            SELECT * FROM saved`,
      values:[...headerValues,lineValues]
    });
  return {journal:header.rows[0]};
};
