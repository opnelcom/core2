"use strict";
const {
  authTenant,
  requireOrganisationResourcePermission,
  clean,
  nullable,
  bool,
} = require("../_shared/erp");

module.exports = async (ctx) => {
  if (ctx.req.method !== "POST")
    return ctx.send(405, { error: "POST required" });
  const access = await authTenant(ctx);
  if (access.status) return ctx.send(access.status, access.body);
  const organisationId = ctx.body.organisation_id;
  const id = nullable(ctx.body.resource_id);
  const code = clean(ctx.body.resource_code).toLowerCase().replace(/\s+/g, "_");
  const name = clean(ctx.body.display_name);
  const resourceType = clean(ctx.body.resource_type);
  const linkedEmail = nullable(ctx.body.linked_email)?.toLowerCase() || null;
  const description = clean(ctx.body.resource_description);
  const isActive = bool(ctx.body.is_active);
  if (!organisationId || !code || !name)
    return ctx.send(400, {
      error: "Organisation, resource code and display name are required",
    });
  if (!["employee", "contractor", "service_provider"].includes(resourceType))
    return ctx.send(400, { error: "Select a valid resource type" });
  if (linkedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(linkedEmail))
    return ctx.send(400, { error: "Linked user email is invalid" });
  const denied = await requireOrganisationResourcePermission(ctx, access, {
    organisationId,
    resourceKind: "resource",
    resourceCode: "*",
    workflowStatus: "manage",
  });
  if (denied) return ctx.send(denied.status, denied.body);
  if (linkedEmail && isActive) {
    const duplicate = await ctx.broker("core_erp", "query", {
      text: `SELECT 1 FROM erp_resource
            WHERE tenant_id=$1 AND organisation_id=$2 AND lower(linked_email)=lower($3)
              AND is_active=true AND resource_id<>COALESCE($4::uuid,'00000000-0000-0000-0000-000000000000'::uuid)
            LIMIT 1`,
      values: [access.tenantId, organisationId, linkedEmail, id],
    });
    if (duplicate.rowCount)
      return ctx.send(409, {
        error: "That application user is already linked to an active resource",
      });
  }
  if (ctx.body.is_active === false || ctx.body.is_active === "false") {
    const assigned = await ctx.broker("core_erp", "query", {
      text: `SELECT 1 FROM erp_resource_assignment
            WHERE tenant_id=$1 AND organisation_id=$2 AND resource_id=$3
              AND (valid_to IS NULL OR valid_to>=CURRENT_DATE) LIMIT 1`,
      values: [access.tenantId, organisationId, id],
    });
    if (assigned.rowCount)
      return ctx.send(409, {
        error:
          "A resource with current or future assignments cannot be deactivated",
      });
  }
  const result = id
    ? await ctx.broker("core_erp", "query", {
        text: `UPDATE erp_resource SET resource_code=$4,display_name=$5,resource_type=$6,linked_email=$7,resource_description=$8,is_active=$9,updated_at=now()
              WHERE tenant_id=$1 AND organisation_id=$2 AND resource_id=$3
              RETURNING resource_id,resource_code,display_name,resource_type,linked_email,resource_description,is_active`,
        values: [
          access.tenantId,
          organisationId,
          id,
          code,
          name,
          resourceType,
          linkedEmail,
          description,
          isActive,
        ],
      })
    : await ctx.broker("core_erp", "query", {
        text: `INSERT INTO erp_resource(tenant_id,organisation_id,resource_code,display_name,resource_type,linked_email,resource_description,is_active)
              VALUES($1,$2,$3,$4,$5,$6,$7,$8)
              RETURNING resource_id,resource_code,display_name,resource_type,linked_email,resource_description,is_active`,
        values: [
          access.tenantId,
          organisationId,
          code,
          name,
          resourceType,
          linkedEmail,
          description,
          isActive,
        ],
      });
  if (!result.rowCount)
    return ctx.send(404, { error: "Resource was not found" });
  return { resource: result.rows[0] };
};
