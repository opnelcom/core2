'use strict';
const {authTenant,requireBusinessAccess}=require('../_shared/erp');

function accountAmountSql(statementType){
  if(statementType==='income')return `CASE
    WHEN t.account_type_code='revenue' THEN COALESCE(sum(l.credit_amount-l.debit_amount),0)
    WHEN t.account_type_code='expense' THEN COALESCE(sum(l.debit_amount-l.credit_amount),0)
    ELSE COALESCE(sum(l.credit_amount-l.debit_amount),0)
  END`;
  if(statementType==='balance')return `CASE
    WHEN t.account_type_code='asset' THEN COALESCE(sum(l.debit_amount-l.credit_amount),0)
    WHEN t.account_type_code IN('liability','equity') THEN COALESCE(sum(l.credit_amount-l.debit_amount),0)
    ELSE COALESCE(sum(l.debit_amount-l.credit_amount),0)
  END`;
  return `COALESCE(sum(l.debit_amount-l.credit_amount),0)`;
}

function calculateLines(lines,amountRows){
  const amounts=new Map();
  amountRows.forEach(row=>{
    const lineId=row.financial_statement_line_id;
    amounts.set(lineId,(amounts.get(lineId)||0)+(Number(row.amount)||0));
  });
  const valueById=new Map();
  const valueByCode=new Map();
  for(const line of lines){
    if(line.line_type!=='account_group')continue;
    const value=(amounts.get(line.financial_statement_line_id)||0)*(Number(line.sign_multiplier)||1);
    valueById.set(line.financial_statement_line_id,value);
    valueByCode.set(line.line_code,value);
  }
  for(const line of lines){
    if(line.line_type!=='formula')continue;
    const formula=line.formula_json||{};
    const add=Array.isArray(formula.add)?formula.add:[];
    const subtract=Array.isArray(formula.subtract)?formula.subtract:[];
    const sumCodes=codes=>codes.reduce((sum,code)=>sum+(valueByCode.get(code)||0),0);
    const value=(sumCodes(add)-sumCodes(subtract))*(Number(line.sign_multiplier)||1);
    valueById.set(line.financial_statement_line_id,value);
    valueByCode.set(line.line_code,value);
  }
  return lines.map(line=>({
    ...line,
    amount:line.line_type==='header'?null:valueById.get(line.financial_statement_line_id)||0,
    parent_line_code:line.parent_line_id?(lines.find(parent=>parent.financial_statement_line_id===line.parent_line_id)?.line_code||null):null
  }));
}

async function financialStatement(ctx,access){
  const orgId=ctx.query.organisation_id;
  const formatId=ctx.query.format_id;
  const periodFromId=ctx.query.period_from_id;
  const periodToId=ctx.query.period_to_id;
  const compareFromId=ctx.query.compare_period_from_id||null;
  const compareToId=ctx.query.compare_period_to_id||null;
  const divisionId=ctx.query.division_id||null;
  if(!orgId||!formatId||!periodFromId||!periodToId)return ctx.send(400,{error:'organisation_id, format_id, period_from_id and period_to_id are required'});

  const format=await ctx.broker('core_erp','query',{
    text:`SELECT *
          FROM erp_financial_statement_format
          WHERE tenant_id=$1 AND organisation_id=$2 AND financial_statement_format_id=$3 AND is_active=true`,
    values:[access.tenantId,orgId,formatId]
  });
  if(!format.rowCount)return ctx.send(404,{error:'Financial statement format not found'});
  const statementType=format.rows[0].statement_type;

  const lines=await ctx.broker('core_erp','query',{
    text:`WITH RECURSIVE tree AS (
            SELECT l.*,0 depth,ARRAY[l.sort_order] sort_path
            FROM erp_financial_statement_line l
            WHERE l.tenant_id=$1 AND l.organisation_id=$2 AND l.financial_statement_format_id=$3 AND l.parent_line_id IS NULL AND l.is_active=true
            UNION ALL
            SELECT child.*,tree.depth+1,tree.sort_path||child.sort_order
            FROM erp_financial_statement_line child
            JOIN tree ON tree.financial_statement_line_id=child.parent_line_id
            WHERE child.tenant_id=$1 AND child.organisation_id=$2 AND child.financial_statement_format_id=$3 AND child.is_active=true
          )
          SELECT * FROM tree ORDER BY sort_path,line_label`,
    values:[access.tenantId,orgId,formatId]
  });

  async function periodBounds(fromId,toId){
    const r=await ctx.broker('core_erp','query',{
      text:`SELECT min(start_date) start_date,max(end_date) end_date
            FROM erp_fiscal_period
            WHERE tenant_id=$1
              AND organisation_id=$2
              AND fiscal_year_id=(SELECT fiscal_year_id FROM erp_fiscal_period WHERE tenant_id=$1 AND fiscal_period_id=$3::uuid)
              AND period_number BETWEEN
                (SELECT period_number FROM erp_fiscal_period WHERE tenant_id=$1 AND fiscal_period_id=$3::uuid)
                AND
                (SELECT period_number FROM erp_fiscal_period WHERE tenant_id=$1 AND fiscal_period_id=$4::uuid)`,
      values:[access.tenantId,orgId,fromId,toId]
    });
    if(!r.rows[0]?.start_date||!r.rows[0]?.end_date)throw Object.assign(new Error('Invalid financial statement period range'),{status:400});
    return r.rows[0];
  }

  async function amounts(fromId,toId){
    const bounds=await periodBounds(fromId,toId);
    const dateCondition=statementType==='balance'
      ? `$4::date IS NOT NULL AND fp.end_date <= $5::date`
      : `fp.start_date >= $4::date AND fp.end_date <= $5::date`;
    return ctx.broker('core_erp','query',{
      text:`WITH RECURSIVE selected_division AS (
              SELECT division_id,parent_division_id
              FROM erp_division
              WHERE tenant_id=$1 AND organisation_id=$2 AND $6::uuid IS NOT NULL AND division_id=$6::uuid
              UNION ALL
              SELECT child.division_id,child.parent_division_id
              FROM erp_division child
              JOIN selected_division parent ON child.parent_division_id=parent.division_id
              WHERE child.tenant_id=$1 AND child.organisation_id=$2
            ),
            visible_lines AS (
              SELECT l.*
              FROM erp_journal_line l
              JOIN erp_journal j ON j.journal_id=l.journal_id
              JOIN erp_fiscal_period fp ON fp.fiscal_period_id=j.fiscal_period_id
              WHERE j.tenant_id=$1
                AND j.organisation_id=$2
                AND j.workflow_status='approved'
                AND ${dateCondition}
                AND ($6::uuid IS NULL OR l.division_id IN (SELECT division_id FROM selected_division))
                AND (
                  EXISTS (
                    WITH RECURSIVE ancestors AS (
                      SELECT division_id,parent_division_id FROM erp_division WHERE division_id=l.division_id
                      UNION ALL
                      SELECT parent.division_id,parent.parent_division_id
                      FROM erp_division parent
                      JOIN ancestors child ON child.parent_division_id=parent.division_id
                    )
                    SELECT 1
                    FROM erp_user_role ur
                    JOIN erp_role role ON role.role_id=ur.role_id
                    JOIN erp_role_permission rp ON rp.role_id=role.role_id
                    JOIN ancestors scope ON scope.division_id=rp.division_id
                    WHERE ur.tenant_id=$1 AND ur.organisation_id=$2 AND lower(ur.email)=lower($7)
                    AND role.is_active=true AND ur.valid_from <= CURRENT_DATE AND (ur.valid_to IS NULL OR ur.valid_to >= CURRENT_DATE)
                    AND rp.resource_kind='transaction' AND rp.workflow_status='view'
                    AND (rp.resource_code=j.transaction_type_id::text OR rp.resource_code='*')
                  )
                )
            )
            SELECT m.financial_statement_line_id,
                   ${accountAmountSql(statementType)} amount
            FROM visible_lines l
            JOIN erp_ledger_account a ON a.ledger_account_id=l.gl_account_id
            LEFT JOIN erp_ledger_account_type t ON t.account_type_id=a.account_type_id
            JOIN erp_financial_statement_line_account m ON m.ledger_account_id=a.ledger_account_id
              AND m.tenant_id=$1
              AND m.organisation_id=$2
              AND m.financial_statement_format_id=$3
            GROUP BY m.financial_statement_line_id,t.account_type_code`,
      values:[access.tenantId,orgId,formatId,bounds.start_date,bounds.end_date,divisionId,access.auth.email]
    });
  }

  const current=await amounts(periodFromId,periodToId);
  const currentLines=calculateLines(lines.rows,current.rows);
  if(compareFromId&&compareToId){
    const comparative=await amounts(compareFromId,compareToId);
    const comparativeLines=calculateLines(lines.rows,comparative.rows);
    const byId=new Map(comparativeLines.map(row=>[row.financial_statement_line_id,row.amount]));
    return {
      report:'financial_statement',
      format:format.rows[0],
      rows:currentLines.map(row=>{
        const comparativeAmount=row.line_type==='header'?null:byId.get(row.financial_statement_line_id)||0;
        const variance=row.line_type==='header'?null:(Number(row.amount)||0)-(Number(comparativeAmount)||0);
        return {
          ...row,
          comparative_amount:comparativeAmount,
          variance,
          variance_percent:comparativeAmount?variance/Math.abs(comparativeAmount)*100:null
        };
      })
    };
  }
  return {report:'financial_statement',format:format.rows[0],rows:currentLines};
}

async function ledgerBalances(ctx,access){
  const orgId=ctx.query.organisation_id;
  const fiscalYearId=ctx.query.fiscal_year_id;
  const divisionId=ctx.query.division_id||null;
  if(!orgId||!fiscalYearId)return ctx.send(400,{error:'organisation_id and fiscal_year_id are required'});
  const r=await ctx.broker('core_erp','query',{
    text:`WITH RECURSIVE selected_division AS (
            SELECT division_id,parent_division_id
            FROM erp_division
            WHERE tenant_id=$1 AND organisation_id=$2 AND $4::uuid IS NOT NULL AND division_id=$4::uuid
            UNION ALL
            SELECT child.division_id,child.parent_division_id
            FROM erp_division child
            JOIN selected_division parent ON child.parent_division_id=parent.division_id
            WHERE child.tenant_id=$1 AND child.organisation_id=$2
          ),
          visible_lines AS (
            SELECT l.*
            FROM erp_journal_line l
            JOIN erp_journal j ON j.journal_id=l.journal_id
            JOIN erp_fiscal_period fp ON fp.fiscal_period_id=j.fiscal_period_id
            WHERE j.tenant_id=$1
              AND j.organisation_id=$2
              AND fp.fiscal_year_id=$3
              AND j.workflow_status='approved'
              AND ($4::uuid IS NULL OR l.division_id IN (SELECT division_id FROM selected_division))
              AND (
                EXISTS (
                  WITH RECURSIVE ancestors AS (
                    SELECT division_id,parent_division_id FROM erp_division WHERE division_id=l.division_id
                    UNION ALL
                    SELECT parent.division_id,parent.parent_division_id
                    FROM erp_division parent
                    JOIN ancestors child ON child.parent_division_id=parent.division_id
                  )
                  SELECT 1
                  FROM erp_user_role ur
                  JOIN erp_role role ON role.role_id=ur.role_id
                  JOIN erp_role_permission rp ON rp.role_id=role.role_id
                  JOIN ancestors scope ON scope.division_id=rp.division_id
                  WHERE ur.tenant_id=$1 AND ur.organisation_id=$2 AND lower(ur.email)=lower($5)
                  AND role.is_active=true AND ur.valid_from <= CURRENT_DATE AND (ur.valid_to IS NULL OR ur.valid_to >= CURRENT_DATE)
                  AND rp.resource_kind='transaction' AND rp.workflow_status='view'
                  AND (rp.resource_code=j.transaction_type_id::text OR rp.resource_code='*')
                )
              )
          )
          SELECT a.account_code,
                 a.account_name,
                 t.account_type_code,
                 t.account_type_name,
                 COALESCE(sum(l.debit_amount),0) debit_total,
                 COALESCE(sum(l.credit_amount),0) credit_total,
                 COALESCE(sum(l.debit_amount-l.credit_amount),0) balance
          FROM visible_lines l
          JOIN erp_journal j ON j.journal_id=l.journal_id
          JOIN erp_fiscal_period fp ON fp.fiscal_period_id=j.fiscal_period_id
          JOIN erp_ledger_account a ON a.ledger_account_id=l.gl_account_id
          LEFT JOIN erp_ledger_account_type t ON t.account_type_id=a.account_type_id
          WHERE j.tenant_id=$1
            AND j.organisation_id=$2
            AND fp.fiscal_year_id=$3
          GROUP BY a.account_code,a.account_name,t.account_type_code,t.account_type_name
          HAVING COALESCE(sum(l.debit_amount),0) <> 0 OR COALESCE(sum(l.credit_amount),0) <> 0
          ORDER BY t.account_type_code,a.account_code`,
    values:[access.tenantId,orgId,fiscalYearId,divisionId,access.auth.email]
  });
  return {report:'ledger',rows:r.rows};
}

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  const denied=await requireBusinessAccess(ctx,access,orgId);
  if(denied)return ctx.send(denied.status,denied.body);
  const report=ctx.query.report||'financial_statement';
  if(report==='ledger')return ledgerBalances(ctx,access);
  if(report==='financial_statement')return financialStatement(ctx,access);
  return ctx.send(400,{error:'Unknown report'});
};
