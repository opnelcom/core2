"use strict";
const { authTenant, requireAdmin } = require("../_shared/erp");

module.exports = async (ctx) => {
  if (ctx.req.method !== "POST")
    return ctx.send(405, { error: "POST required" });
  const access = await authTenant(ctx);
  if (access.status) return ctx.send(access.status, access.body);
  const denied = requireAdmin(access);
  if (denied) return ctx.send(denied.status, denied.body);

  const statements = [
    `DELETE FROM erp_supporting_document WHERE tenant_id=$1`,
    `DELETE FROM erp_document_intake WHERE tenant_id=$1`,
    `DELETE FROM erp_accounting_dimension_type_module link
      USING erp_accounting_dimension_type parent
      WHERE link.accounting_dimension_type_id=parent.accounting_dimension_type_id
        AND parent.tenant_id=$1`,
    `DELETE FROM erp_accounting_object_type_module link
      USING erp_accounting_object_type parent
      WHERE link.accounting_object_type_id=parent.accounting_object_type_id
        AND parent.tenant_id=$1`,
    `DELETE FROM erp_subledger_account_type_module link
      USING erp_subledger_account_type parent
      WHERE link.subledger_account_type_id=parent.subledger_account_type_id
        AND parent.tenant_id=$1`,
    `DELETE FROM erp_transaction_type_module link
      USING erp_transaction_type parent
      WHERE link.transaction_type_id=parent.transaction_type_id
        AND parent.tenant_id=$1`,
    `DELETE FROM erp_role_module link
      USING erp_role parent
      WHERE link.role_id=parent.role_id
        AND parent.tenant_id=$1`,
    `DELETE FROM erp_resource_assignment WHERE tenant_id=$1`,
    `DELETE FROM erp_object_type_resource_role WHERE tenant_id=$1`,
    `DELETE FROM erp_resource_role_module link
      USING erp_resource_role parent
      WHERE link.resource_role_id=parent.resource_role_id
        AND parent.tenant_id=$1`,
    `DELETE FROM erp_resource_role WHERE tenant_id=$1`,
    `DELETE FROM erp_resource WHERE tenant_id=$1`,
    `DELETE FROM erp_journal_line WHERE tenant_id=$1`,
    `DELETE FROM erp_journal WHERE tenant_id=$1`,
    `DELETE FROM erp_transaction_line_definition WHERE tenant_id=$1`,
    `DELETE FROM erp_financial_statement_line_account WHERE tenant_id=$1`,
    `DELETE FROM erp_financial_statement_line WHERE tenant_id=$1`,
    `DELETE FROM erp_financial_statement_format WHERE tenant_id=$1`,
    `DELETE FROM erp_organisation_openai_setting WHERE tenant_id=$1`,
    `DELETE FROM erp_user_role WHERE tenant_id=$1`,
    `DELETE FROM erp_role_permission WHERE tenant_id=$1`,
    `DELETE FROM erp_role WHERE tenant_id=$1`,
    `DELETE FROM erp_workflow_history WHERE tenant_id=$1`,
    `DELETE FROM erp_tax_rate WHERE tenant_id=$1`,
    `DELETE FROM erp_tax_type WHERE tenant_id=$1`,
    `DELETE FROM erp_accounting_dimension WHERE tenant_id=$1`,
    `DELETE FROM erp_accounting_object WHERE tenant_id=$1`,
    `DELETE FROM erp_subledger_account WHERE tenant_id=$1`,
    `DELETE FROM erp_gl_account WHERE tenant_id=$1`,
    `DELETE FROM erp_accounting_dimension_type WHERE tenant_id=$1`,
    `DELETE FROM erp_accounting_object_type WHERE tenant_id=$1`,
    `DELETE FROM erp_subledger_account_type WHERE tenant_id=$1`,
    `DELETE FROM erp_gl_account_type WHERE tenant_id=$1`,
    `DELETE FROM erp_legal_entity_relationship WHERE tenant_id=$1`,
    `DELETE FROM erp_legal_entity_address WHERE tenant_id=$1`,
    `DELETE FROM erp_legal_entity_identification WHERE tenant_id=$1`,
    `DELETE FROM erp_legal_entity WHERE tenant_id=$1`,
    `DELETE FROM erp_transaction_type WHERE tenant_id=$1`,
    `DELETE FROM erp_transaction_group WHERE tenant_id=$1`,
    `DELETE FROM erp_fiscal_period WHERE tenant_id=$1`,
    `DELETE FROM erp_fiscal_year WHERE tenant_id=$1`,
    `DELETE FROM erp_currency WHERE tenant_id=$1`,
    `DELETE FROM erp_country WHERE tenant_id=$1`,
    `DELETE FROM erp_module WHERE tenant_id=$1`,
    `DELETE FROM erp_division WHERE tenant_id=$1`,
    `DELETE FROM erp_workflow_next WHERE tenant_id=$1`,
    `DELETE FROM erp_workflow_step WHERE tenant_id=$1`,
    `DELETE FROM erp_workflow_path WHERE tenant_id=$1`,
    `DELETE FROM erp_organisation WHERE tenant_id=$1`,
    `DELETE FROM erp_note WHERE tenant_id=$1`,
  ];
  const reset = await ctx.broker("core_erp", "transaction", {
    statements: statements.map((text) => ({ text, values: [access.tenantId] })),
  });
  return {
    ok: true,
    deleted: reset.results
      .map((result) => result.rowCount)
      .reduce((total, count) => total + count, 0),
  };
};
