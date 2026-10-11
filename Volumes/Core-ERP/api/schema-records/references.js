"use strict";
const { authTenant } = require("../_shared/erp");
const { lookupReferences, classes } = require("../_shared/erp/schema-references");
module.exports = async ctx => {
  const access = await authTenant(ctx);
  if (access.status) return ctx.send(access.status, access.body);
  const organisationId = ctx.query.organisation_id;
  let target = { class: ctx.query.object_class, types: String(ctx.query.types || "").split(",").filter(Boolean) };
  if (ctx.query.target) {
    try { target = JSON.parse(ctx.query.target); } catch { return ctx.send(400, { error: "Invalid reference target" }); }
  }
  const targets = Array.isArray(target?.anyOf) ? target.anyOf : [target];
  if (!organisationId || !targets.length || target?.anyOf !== undefined && (!Array.isArray(target.anyOf) || target.class) || targets.some(item => !classes[item?.class] || item.types !== undefined && (!Array.isArray(item.types) || item.types.some(code => typeof code !== "string")))) return ctx.send(400, { error: "Organisation and a supported object_class are required" });
  return { records: await lookupReferences(ctx, access, organisationId, target, { search: ctx.query.search, selectedId: ctx.query.selected_id || "", source: ctx.query.source_id ? { class: ctx.query.source_class, id: ctx.query.source_id, grid: ctx.query.source_grid, column: ctx.query.source_column } : ctx.query.source_grid ? {} : null }) };
};
