"use strict";
const {
  authTenant,
  requireAdmin,
  clean,
  nullable,
  bool,
} = require("../_shared/erp");
const { sanitizeOrganisationIconSvg } = require("../_shared/svg-icon");

module.exports = async (ctx) => {
  const access = await authTenant(ctx);
  if (access.status) return ctx.send(access.status, access.body);
  const denied = requireAdmin(access);
  if (denied) return ctx.send(denied.status, denied.body);
  const id = nullable(ctx.body.organisation_id);
  const code = clean(ctx.body.organisation_code).toUpperCase();
  const name = clean(ctx.body.organisation_name);
  if (!code || !name)
    return ctx.send(400, { error: "Organisation code and name are required" });
  const currency = clean(ctx.body.base_currency_code, "ZAR").toUpperCase();
  const hasIconSvg = Object.prototype.hasOwnProperty.call(
    ctx.body,
    "organisation_icon_svg",
  );
  const iconSvg = hasIconSvg
    ? sanitizeOrganisationIconSvg(ctx.body.organisation_icon_svg)
    : undefined;
  let result;
  if (id) {
    result = await ctx.broker("core_erp", "query", {
      text: `UPDATE erp_organisation
            SET organisation_code=$3,organisation_name=$4,base_currency_code=$5,is_template=$6,updated_by_email=$7,
                organisation_icon_svg=CASE WHEN $8 THEN $9 ELSE organisation_icon_svg END,updated_at=now()
            WHERE tenant_id=$1 AND organisation_id=$2 AND workflow_status <> 'deleted'
            RETURNING *`,
      values: [
        access.tenantId,
        id,
        code,
        name,
        currency,
        bool(ctx.body.is_template),
        access.auth.email,
        hasIconSvg,
        iconSvg ?? null,
      ],
    });
  } else {
    result = await ctx.broker("core_erp", "query", {
      text: `WITH created AS (
              INSERT INTO erp_organisation(tenant_id,organisation_code,organisation_name,base_currency_code,is_template,organisation_icon_svg,workflow_status,created_by_email,updated_by_email)
              VALUES($1,$2,$3,$4,$5,$6,'approved',$7,$7)
              RETURNING *
            ), root AS (
              INSERT INTO erp_division(tenant_id,organisation_id,parent_division_id,division_code,division_name,workflow_status,created_by_email,updated_by_email)
              SELECT tenant_id,organisation_id,NULL,'ROOT',organisation_name,'approved',$7,$7 FROM created
              RETURNING division_id
            ), administrator AS (
              INSERT INTO erp_role(tenant_id,organisation_id,role_code,role_name,role_description,is_admin,is_active)
              SELECT tenant_id,organisation_id,'security_administrator','Security Administrator',
                'Initial setup administrator assigned to the organisation creator.',true,true FROM created
              RETURNING tenant_id,organisation_id,role_id
            ), assignment AS (
              INSERT INTO erp_user_role(tenant_id,organisation_id,role_id,email,valid_from,valid_to)
              SELECT tenant_id,organisation_id,role_id,lower($7),CURRENT_DATE,NULL FROM administrator
              RETURNING role_id
            ) SELECT created.* FROM created`,
      values: [
        access.tenantId,
        code,
        name,
        currency,
        bool(ctx.body.is_template),
        iconSvg ?? null,
        access.auth.email,
      ],
    });

  }
  if (!result.rowCount)
    return ctx.send(404, { error: "Organisation not found" });
  return { organisation: result.rows[0] };
};
