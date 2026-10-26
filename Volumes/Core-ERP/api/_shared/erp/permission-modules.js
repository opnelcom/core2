"use strict";
const {organisationUserAccessSql}=require("./user-access");

// Application-owned identifiers only. Modules organise navigation; grants remain
// authoritative and are combined across all active, currently valid roles.
const sources = [
  ["subledger_account", "erp_subledger_account_type", "subledger_account_type_id"],
  ["accounting_object", "erp_accounting_object_type", "accounting_object_type_id"],
  ["accounting_dimension", "erp_accounting_dimension_type", "accounting_dimension_type_id"],
  ["transaction", "erp_transaction_type", "transaction_type_id"],
  ["report", "erp_report", "report_id"],
];

function permissionModuleLinksSql() {
  const mappings = sources.map(([kind, table, id]) => `
    SELECT '${kind}' resource_kind, definition.${id}::text resource_code, link.module_id
    FROM ${table} definition JOIN ${table}_module link ON link.${id}=definition.${id}
    WHERE definition.tenant_id=$1 AND definition.organisation_id=$2 AND definition.is_active=true
  `).join(' UNION ALL ');
  return `SELECT DISTINCT role.role_id,mapping.module_id
    FROM erp_user_role ur JOIN erp_role role ON role.role_id=ur.role_id
    JOIN erp_role_permission permission ON permission.role_id=role.role_id
    JOIN (${mappings}) mapping ON mapping.resource_kind=permission.resource_kind
      AND (permission.resource_code='*' OR permission.resource_code=mapping.resource_code)
    WHERE ur.tenant_id=$1 AND ur.organisation_id=$2 AND lower(ur.email)=lower($3)
      AND ${organisationUserAccessSql({tenant:'$1',organisation:'$2',email:'$3'})}
      AND role.tenant_id=$1 AND role.organisation_id=$2 AND role.is_active=true
      AND permission.tenant_id=$1 AND permission.organisation_id=$2
      AND ur.valid_from<=CURRENT_DATE AND (ur.valid_to IS NULL OR ur.valid_to>=CURRENT_DATE)
      AND permission.valid_from<=CURRENT_DATE AND (permission.valid_to IS NULL OR permission.valid_to>=CURRENT_DATE)`;
}

function accessibleModulesSql() {
  return `SELECT module.* FROM erp_module module
    WHERE module.tenant_id=$1 AND module.organisation_id=$2 AND module.is_active=true
      AND EXISTS(SELECT 1 FROM (${permissionModuleLinksSql()}) grants WHERE grants.module_id=module.module_id)`;
}

module.exports={permissionModuleLinksSql,accessibleModulesSql};
