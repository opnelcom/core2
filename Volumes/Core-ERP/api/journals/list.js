'use strict';
const {transactionVisibilitySql}=require('../_shared/erp/transaction-visibility');
const {userDivisionAccessSql}=require('../_shared/erp/user-access');
const {authTenant}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  if(!orgId)return ctx.send(400,{error:'organisation_id is required'});
  const transactionTypeId=ctx.query.transaction_type_id||null;
  const activeDivisionId=ctx.query.active_division_id||null;
  const includeChildren=ctx.query.include_child_divisions==='1';
  const r=await ctx.broker('core_erp','query',{
    text:`SELECT j.*,tt.type_name transaction_type_name,fp.period_code,d.division_name source_division_name,
                 COALESCE(sum(l.debit_amount),0) debit_total,COALESCE(sum(l.credit_amount),0) credit_total
          FROM erp_journal j
          LEFT JOIN erp_transaction_type tt ON tt.transaction_type_id=j.transaction_type_id
          JOIN erp_fiscal_period fp ON fp.fiscal_period_id=j.fiscal_period_id
          JOIN erp_division d ON d.division_id=j.source_division_id
          LEFT JOIN erp_journal_line l ON l.journal_id=j.journal_id
          WHERE j.tenant_id=$1 AND j.organisation_id=$2
          AND ${userDivisionAccessSql({tenant:'$1',organisation:'$2',email:'$3',division:'j.source_division_id'})}
          AND ($4::uuid IS NULL OR j.transaction_type_id=$4::uuid)
          AND ($5::uuid IS NULL OR EXISTS (
            WITH RECURSIVE selected_scope AS (
              SELECT division_id FROM erp_division WHERE tenant_id=$1 AND organisation_id=$2 AND division_id=$5::uuid
              UNION ALL
              SELECT child.division_id FROM erp_division child JOIN selected_scope parent ON child.parent_division_id=parent.division_id
              WHERE child.tenant_id=$1 AND child.organisation_id=$2 AND $6::boolean
            )
            SELECT 1 FROM selected_scope WHERE division_id=j.source_division_id
          ))
          AND ${transactionVisibilitySql({tenant:'$1',organisation:'$2',division:'j.source_division_id',transactionType:'j.transaction_type_id',status:'j.workflow_status',email:'$3',administrator:'false'})}
          AND NOT EXISTS(SELECT 1 FROM erp_journal_line access_line WHERE access_line.tenant_id=j.tenant_id AND access_line.organisation_id=j.organisation_id AND access_line.journal_id=j.journal_id
            AND NOT ${transactionVisibilitySql({tenant:'$1',organisation:'$2',division:'access_line.division_id',transactionType:'j.transaction_type_id',status:'j.workflow_status',email:'$3',administrator:'false'})})
          GROUP BY j.journal_id,tt.type_name,fp.period_code,d.division_name
          ORDER BY j.journal_date DESC,j.created_at DESC`,
    values:[access.tenantId,orgId,access.auth.email,transactionTypeId,activeDivisionId,includeChildren]
  });
  await require('../_shared/erp/workflow-presentation').decorateWorkflowRecords(ctx,access,r.rows,{kind:'transaction',typeTable:'erp_transaction_type',typeIdColumn:'transaction_type_id'});
  return {journals:r.rows};
};

module.exports=require("../_shared/context").withContext(module.exports);
