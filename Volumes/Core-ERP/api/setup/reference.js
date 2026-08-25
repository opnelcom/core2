'use strict';
const {authTenant}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  if(!orgId)return ctx.send(400,{error:'organisation_id is required'});
  const [groups,types,rules]=await Promise.all([
    ctx.broker('core_erp','query',{text:`SELECT * FROM erp_transaction_group WHERE tenant_id=$1 AND organisation_id=$2 ORDER BY sort_order,group_name`,values:[access.tenantId,orgId]}),
    ctx.broker('core_erp','query',{text:`SELECT tt.*,tg.group_code,tg.group_name FROM erp_transaction_type tt JOIN erp_transaction_group tg ON tg.transaction_group_id=tt.transaction_group_id WHERE tt.tenant_id=$1 AND tt.organisation_id=$2 ORDER BY tg.sort_order,tt.sort_order,tt.type_name`,values:[access.tenantId,orgId]}),
    ctx.broker('core_erp','query',{text:`SELECT pr.*,tt.type_code,a.account_code,a.account_name FROM erp_posting_rule pr JOIN erp_transaction_type tt ON tt.transaction_type_id=pr.transaction_type_id LEFT JOIN erp_ledger_account a ON a.ledger_account_id=pr.default_gl_account_id WHERE pr.tenant_id=$1 AND pr.organisation_id=$2 ORDER BY tt.type_code,pr.line_order`,values:[access.tenantId,orgId]})
  ]);
  return {transaction_groups:groups.rows,transaction_types:types.rows,posting_rules:rules.rows};
};
