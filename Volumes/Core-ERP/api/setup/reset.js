'use strict';
const {authTenant,requireAdmin}=require('../_shared/erp');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);

  const statements=[
    `DELETE FROM erp_supporting_document WHERE tenant_id=$1`,
    `DELETE FROM erp_journal_line WHERE tenant_id=$1`,
    `DELETE FROM erp_journal WHERE tenant_id=$1`,
    `DELETE FROM erp_posting_rule WHERE tenant_id=$1`,
    `DELETE FROM erp_financial_statement_format WHERE tenant_id=$1`,
    `DELETE FROM erp_user_role WHERE tenant_id=$1`,
    `DELETE FROM erp_role_permission WHERE tenant_id=$1`,
    `DELETE FROM erp_role WHERE tenant_id=$1`,
    `DELETE FROM erp_accounting_dimension WHERE tenant_id=$1`,
    `DELETE FROM erp_accounting_object WHERE tenant_id=$1`,
    `DELETE FROM erp_subledger_account WHERE tenant_id=$1`,
    `DELETE FROM erp_gl_account WHERE tenant_id=$1`,
    `DELETE FROM erp_accounting_dimension_type WHERE tenant_id=$1`,
    `DELETE FROM erp_accounting_object_type WHERE tenant_id=$1`,
    `DELETE FROM erp_subledger_account_type WHERE tenant_id=$1`,
    `DELETE FROM erp_gl_account_type WHERE tenant_id=$1`,
    `DELETE FROM erp_master_data_record WHERE tenant_id=$1`,
    `DELETE FROM erp_master_data_type WHERE tenant_id=$1`,
    `DELETE FROM erp_ledger_account WHERE tenant_id=$1`,
    `DELETE FROM erp_legal_entity_relationship WHERE tenant_id=$1`,
    `DELETE FROM erp_legal_entity_address WHERE tenant_id=$1`,
    `DELETE FROM erp_legal_entity_identification WHERE tenant_id=$1`,
    `DELETE FROM erp_legal_entity WHERE tenant_id=$1`,
    `DELETE FROM erp_ledger_account_type WHERE tenant_id=$1`,
    `DELETE FROM erp_transaction_type WHERE tenant_id=$1`,
    `DELETE FROM erp_transaction_group WHERE tenant_id=$1`,
    `DELETE FROM erp_fiscal_period WHERE tenant_id=$1`,
    `DELETE FROM erp_fiscal_year WHERE tenant_id=$1`,
    `DELETE FROM erp_division WHERE tenant_id=$1`,
    `DELETE FROM erp_organisation WHERE tenant_id=$1`,
    `DELETE FROM erp_note WHERE tenant_id=$1`
  ];
  const reset=await ctx.broker('core_erp','transaction',{
    statements:statements.map(text=>({text,values:[access.tenantId]}))
  });
  return {
    ok:true,
    deleted:reset.results.map(result=>result.rowCount).reduce((total,count)=>total+count,0)
  };
};
