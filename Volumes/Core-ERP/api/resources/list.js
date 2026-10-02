"use strict";
const {
  authTenant,
  requireOrganisationResourcePermission,
} = require("../_shared/erp");

module.exports = async (ctx) => {
  const access = await authTenant(ctx);
  if (access.status) return ctx.send(access.status, access.body);
  const organisationId = ctx.query.organisation_id;
  if (!organisationId)
    return ctx.send(400, { error: "organisation_id is required" });
  let denied = await requireOrganisationResourcePermission(ctx, access, {
    organisationId,
    resourceKind: "resource",
    resourceCode: "*",
    workflowStatus: "view",
  });
  if (denied)
    denied = await requireOrganisationResourcePermission(ctx, access, {
      organisationId,
      resourceKind: "resource",
      resourceCode: "*",
      workflowStatus: "manage",
    });
  if (denied) return ctx.send(denied.status, denied.body);
  const result = await ctx.broker("core_erp", "query", {
    text: `SELECT resource_id,resource_code,display_name,resource_type,linked_email,resource_description,is_active
          FROM erp_resource
          WHERE tenant_id=$1 AND organisation_id=$2
          ORDER BY lower(display_name),resource_code`,
    values: [access.tenantId, organisationId],
  });
  return { resources: result.rows };
};
