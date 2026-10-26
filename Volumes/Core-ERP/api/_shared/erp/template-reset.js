"use strict";

// Children precede parents. Unscoped module-link tables are removed by their
// parent foreign-key cascades; never issue an unscoped delete against them.
const templateResetTables = [
  'erp_user_menu_favourite', 'erp_user_organisation_context', 'erp_user_tenant_context',
  'erp_record_comment', 'erp_supporting_document', 'erp_document_intake',
  'erp_object_data_version', 'erp_schema_grid_row', 'erp_workflow_history',
  'erp_resource_assignment', 'erp_object_type_resource_role',
  'erp_journal_line_accounting_object', 'erp_journal_line_accounting_dimension',
  'erp_journal_line', 'erp_journal',
  'erp_transaction_line_definition_object_type', 'erp_transaction_line_definition_dimension_type',
  'erp_transaction_line_definition', 'erp_transaction_type', 'erp_transaction_group',
  'erp_financial_statement_line_account', 'erp_financial_statement_line', 'erp_financial_statement_format',
  'erp_accounting_object', 'erp_accounting_dimension', 'erp_gl_account', 'erp_subledger_account',
  'erp_accounting_object_type', 'erp_accounting_dimension_type', 'erp_gl_account_type', 'erp_subledger_account_type',
  'erp_workflow_action_role', 'erp_workflow_next', 'erp_workflow_path_status', 'erp_workflow_path', 'erp_workflow_status',
  'erp_user_division', 'erp_user_role', 'erp_role_permission', 'erp_role', 'erp_report',
  'erp_resource', 'erp_resource_role', 'erp_module',
  'erp_legal_entity_relationship', 'erp_legal_entity_address', 'erp_legal_entity_identification', 'erp_legal_entity',
  'erp_fiscal_period', 'erp_fiscal_year', 'erp_tax_rate', 'erp_tax_type',
  'erp_exchange_rate_change', 'erp_exchange_rate', 'erp_country', 'erp_currency',
  'erp_division', 'erp_organisation_openai_setting'
];

async function resetTemplateData(client, tenantId, organisationId) {
  for (const table of templateResetTables) {
    await client.query(`DELETE FROM ${table} WHERE tenant_id=$1 AND organisation_id=$2`, [tenantId, organisationId]);
  }
}

module.exports = {resetTemplateData, templateResetTables};
