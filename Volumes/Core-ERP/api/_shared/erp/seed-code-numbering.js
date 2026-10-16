"use strict";
const { validateCodeNumbering } = require("./code-numbering");

function codeNumberingSeedStatements(access, organisationId, defaults) {
  const statements = [];
  for (const [kind, definitions] of [
    ["gl_account", defaults.glAccountTypeSeeds],
    ["subledger_account", defaults.ledgerFamilies],
    ["accounting_object", defaults.accountingObjectTypeSeeds],
    ["accounting_dimension", defaults.accountingDimensionTypeSeeds],
  ]) {
    const settings = defaults.codeNumberingTypes?.[kind] || {};
    const known = new Set(definitions.map(row => row[0]));
    if (Object.keys(settings).some(code => !known.has(code)))
      throw new Error(`Numbering settings reference an unseeded ${kind} type`);
    const payload = definitions.map(([type_code]) => {
      const checked = validateCodeNumbering(settings[type_code] ?? defaults.codeNumberingDefaults);
      if (checked.error || checked.value === null)
        throw new Error(`Invalid seeded numbering for ${kind}/${type_code}: ${checked.error || "settings required"}`);
      return { type_code, code_numbering: checked.value };
    });
    statements.push({
      text: `UPDATE erp_${kind}_type type SET code_numbering=p.code_numbering
        FROM jsonb_to_recordset($3::jsonb) p(type_code text,code_numbering jsonb)
        WHERE type.tenant_id=$1 AND type.organisation_id=$2 AND type.type_code=p.type_code`,
      values: [access.tenantId, organisationId, JSON.stringify(payload)],
    });
  }
  return statements;
}

async function seedCodeNumbering(ctx, access, organisationId, defaults) {
  await ctx.broker("core_erp", "transaction", {
    statements: codeNumberingSeedStatements(access, organisationId, defaults),
  });
}
module.exports = { codeNumberingSeedStatements, seedCodeNumbering };
