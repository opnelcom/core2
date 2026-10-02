"use strict";
const { authTenant } = require("../_shared/erp");

module.exports = async (ctx) => {
  const access = await authTenant(ctx);
  if (access.status) return ctx.send(access.status, access.body);
  const orgId = ctx.query.organisation_id;
  if (!orgId) return ctx.send(400, { error: "organisation_id is required" });
  const [
    subledgerTypes,
    groups,
    types,
    modules,
    workflowPaths,
    workflowSteps,
    workflowNext,
  ] = await Promise.all([
    ctx.broker("core_erp", "query", {
      text: `SELECT type.*,COALESCE((SELECT array_agg(link.module_id) FROM erp_subledger_account_type_module link WHERE link.subledger_account_type_id=type.subledger_account_type_id),'{}'::uuid[]) module_ids
            FROM erp_subledger_account_type type
            WHERE type.tenant_id=$1 AND type.organisation_id=$2 AND type.is_active=true
            ORDER BY type.type_code`,
      values: [access.tenantId, orgId],
    }),
    ctx.broker("core_erp", "query", {
      text: `SELECT *
            FROM erp_transaction_group
            WHERE tenant_id=$1 AND organisation_id=$2 AND is_active=true
            ORDER BY sort_order,group_name`,
      values: [access.tenantId, orgId],
    }),
    ctx.broker("core_erp", "query", {
      text: `SELECT tt.*,tg.group_code,tg.group_name,COALESCE((SELECT array_agg(tm.module_id) FROM erp_transaction_type_module tm WHERE tm.transaction_type_id=tt.transaction_type_id),'{}'::uuid[]) module_ids
            FROM erp_transaction_type tt
            JOIN erp_transaction_group tg ON tg.transaction_group_id=tt.transaction_group_id
            WHERE tt.tenant_id=$1 AND tt.organisation_id=$2 AND tt.is_active=true
            ORDER BY tg.sort_order,tt.sort_order,tt.type_name`,
      values: [access.tenantId, orgId],
    }),
    ctx.broker("core_erp", "query", {
      text: `SELECT * FROM erp_module WHERE tenant_id=$1 AND organisation_id=$2 ORDER BY sort_order,module_name`,
      values: [access.tenantId, orgId],
    }),
    ctx.broker("core_erp", "query", {
      text: `SELECT * FROM erp_workflow_path WHERE tenant_id=$1 AND organisation_id=$2 ORDER BY path_name`,
      values: [access.tenantId, orgId],
    }),
    ctx.broker("core_erp", "query", {
      text: `SELECT * FROM erp_workflow_step WHERE tenant_id=$1 AND organisation_id=$2 ORDER BY workflow_path_id,sort_order,step_label`,
      values: [access.tenantId, orgId],
    }),
    ctx.broker("core_erp", "query", {
      text: `SELECT * FROM erp_workflow_next WHERE tenant_id=$1 AND organisation_id=$2 ORDER BY workflow_path_id,current_step_code,next_step_code`,
      values: [access.tenantId, orgId],
    }),
  ]);
  let resourceRoles = { rows: [] };
  let resourceRoleMappings = { rows: [] };
  const resourceSchema = await ctx.broker("core_erp", "query", {
    text: `SELECT to_regclass('public.erp_resource_role') resource_role_table,
                  to_regclass('public.erp_resource_role_module') role_module_table,
                  to_regclass('public.erp_object_type_resource_role') mapping_table`,
  });
  if (
    resourceSchema.rows[0]?.resource_role_table &&
    resourceSchema.rows[0]?.role_module_table &&
    resourceSchema.rows[0]?.mapping_table
  ) {
    [resourceRoles, resourceRoleMappings] = await Promise.all([
      ctx.broker("core_erp", "query", {
        text: `SELECT role.*,COALESCE((SELECT array_agg(link.module_id ORDER BY module.sort_order,module.module_name)
                      FROM erp_resource_role_module link JOIN erp_module module ON module.module_id=link.module_id
                      WHERE link.resource_role_id=role.resource_role_id),'{}'::uuid[]) module_ids
              FROM erp_resource_role role
              WHERE role.tenant_id=$1 AND role.organisation_id=$2
              ORDER BY role.role_name`,
        values: [access.tenantId, orgId],
      }),
      ctx.broker("core_erp", "query", {
        text: `SELECT * FROM erp_object_type_resource_role
              WHERE tenant_id=$1 AND organisation_id=$2`,
        values: [access.tenantId, orgId],
      }),
    ]);
  }
  return {
    subledger_account_types: subledgerTypes.rows,
    transaction_groups: groups.rows,
    transaction_types: types.rows,
    modules: modules.rows,
    workflow_paths: workflowPaths.rows,
    workflow_steps: workflowSteps.rows,
    workflow_next: workflowNext.rows,
    resource_roles: resourceRoles.rows,
    resource_role_mappings: resourceRoleMappings.rows,
  };
};
