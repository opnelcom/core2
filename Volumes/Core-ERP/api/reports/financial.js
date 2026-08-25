'use strict';
const {authTenant,isAdministrator}=require('../_shared/erp');

const reportConfig={
  income:{
    accountTypes:['revenue','expense'],
    amount:`CASE
      WHEN t.account_type_code='revenue' THEN COALESCE(sum(l.credit_amount-l.debit_amount),0)
      WHEN t.account_type_code='expense' THEN COALESCE(sum(l.debit_amount-l.credit_amount),0)
      ELSE 0
    END`
  },
  balance:{
    accountTypes:['asset','liability','equity'],
    amount:`CASE
      WHEN t.account_type_code='asset' THEN COALESCE(sum(l.debit_amount-l.credit_amount),0)
      WHEN t.account_type_code IN('liability','equity') THEN COALESCE(sum(l.credit_amount-l.debit_amount),0)
      ELSE 0
    END`
  },
  ledger:{
    accountTypes:null,
    amount:`COALESCE(sum(l.debit_amount-l.credit_amount),0)`
  }
};

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  const fiscalYearId=ctx.query.fiscal_year_id;
  const divisionId=ctx.query.division_id||null;
  const report=ctx.query.report||'income';
  const config=reportConfig[report];
  if(!orgId||!fiscalYearId)return ctx.send(400,{error:'organisation_id and fiscal_year_id are required'});
  if(!config)return ctx.send(400,{error:'Unknown report'});

  const admin=isAdministrator(access);
  const typeFilter=config.accountTypes
    ? `AND t.account_type_code=ANY($6::text[])`
    : '';
  const emailParam=config.accountTypes?'$7':'$6';
  const values=config.accountTypes
    ? [access.tenantId,orgId,fiscalYearId,divisionId,admin,config.accountTypes,access.auth.email]
    : [access.tenantId,orgId,fiscalYearId,divisionId,admin,access.auth.email];
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
                $5::boolean
                OR EXISTS (
                  SELECT 1
                  FROM erp_user_role ur
                  JOIN erp_role role ON role.role_id=ur.role_id
                  WHERE ur.tenant_id=$1 AND ur.organisation_id=$2 AND lower(ur.email)=lower(${emailParam})
                  AND role.is_active=true AND role.is_admin=true
                  AND ur.valid_from <= CURRENT_DATE AND (ur.valid_to IS NULL OR ur.valid_to >= CURRENT_DATE)
                )
                OR EXISTS (
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
                  WHERE ur.tenant_id=$1 AND ur.organisation_id=$2 AND lower(ur.email)=lower(${emailParam})
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
                 ${config.amount} balance
          FROM visible_lines l
          JOIN erp_ledger_account a ON a.ledger_account_id=l.gl_account_id
          LEFT JOIN erp_ledger_account_type t ON t.account_type_id=a.account_type_id
          WHERE a.ledger_family_code='gl'
          ${typeFilter}
          GROUP BY a.account_code,a.account_name,t.account_type_code,t.account_type_name
          HAVING COALESCE(sum(l.debit_amount),0) <> 0 OR COALESCE(sum(l.credit_amount),0) <> 0
          ORDER BY t.account_type_code,a.account_code`,
    values
  });
  const totals=r.rows.reduce((acc,row)=>{
    const type=row.account_type_code||'unknown';
    const value=Number(row.balance)||0;
    acc[type]=(acc[type]||0)+value;
    acc.total=(acc.total||0)+value;
    return acc;
  },{});
  return {report,rows:r.rows,totals};
};
