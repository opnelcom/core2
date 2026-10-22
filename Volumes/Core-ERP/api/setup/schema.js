"use strict";
const {
  canBootstrapSetup,
  isSetupAdministrator,
  runSchemaSql,
} = require("../_shared/erp");

module.exports = async (ctx) => {
  if (ctx.req.method !== "POST")
    return ctx.send(405, { error: "POST required" });
  const membership = await ctx.tenantSession();
  if (membership.status) return ctx.send(membership.status, membership.body);
  const {auth, tenantId} = membership;
  const organisationId = ctx.body?.access_organisation_id || null;
  const bootstrapAllowed = await canBootstrapSetup(ctx, tenantId);
  const setupAdministrator = await isSetupAdministrator(ctx, {
    tenantId,
    organisationId,
    email: auth.email,
  });
  if (!bootstrapAllowed && !setupAdministrator)
    return ctx.send(403, {
      error: "ERP Setup Administrator access is required",
    });
  await runSchemaSql(ctx);
  return {ok: true, initialised: true};
};

module.exports=require("../_shared/context").withContext(module.exports);
