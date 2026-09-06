'use strict';
const {authTenant}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  if(!orgId)return ctx.send(400,{error:'organisation_id is required'});
  const values=[access.tenantId,orgId];
  const [formats,lines,mappings]=await Promise.all([
    ctx.broker('core_erp','query',{
      text:`SELECT *
            FROM erp_financial_statement_format
            WHERE tenant_id=$1 AND organisation_id=$2
            ORDER BY statement_type,format_name`,
      values
    }),
    ctx.broker('core_erp','query',{
      text:`SELECT *
            FROM erp_financial_statement_line
            WHERE tenant_id=$1 AND organisation_id=$2
            ORDER BY sort_order,line_label`,
      values
    }),
    ctx.broker('core_erp','query',{
      text:`SELECT m.*,a.account_code,a.account_name
            FROM erp_financial_statement_line_account m
            JOIN erp_ledger_account a ON a.ledger_account_id=m.ledger_account_id
            WHERE m.tenant_id=$1 AND m.organisation_id=$2
            ORDER BY a.account_code`,
      values
    })
  ]);
  return {formats:formats.rows,lines:lines.rows,mappings:mappings.rows};
};
