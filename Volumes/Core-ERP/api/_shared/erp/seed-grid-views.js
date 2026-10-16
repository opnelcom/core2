"use strict";
const { validateDefaultGridView } = require("./grid-views");
async function seedGridViews(ctx, access, organisationId, defaults) {
  const statements = [];
  for (const [kind, entries] of [
    ["subledger_account", defaults.ledgerFamilies],
    ["accounting_object", defaults.accountingObjectTypeSeeds],
    ["accounting_dimension", defaults.accountingDimensionTypeSeeds],
    ["transaction", defaults.transactionTypes],
  ]) {
    const view = defaults.defaultGridViews[kind];
    const validated = validateDefaultGridView(view);
    if (validated.error || validated.value === null) throw new Error(`Invalid seeded default grid view for ${kind}`);
    statements.push({
      text: `UPDATE erp_${kind}_type SET default_grid_view=$4 WHERE tenant_id=$1 AND organisation_id=$2 AND type_code=ANY($3::text[])`,
      values: [access.tenantId, organisationId, entries.map(row => row[0]), view],
    });
  }
  for (const [kind, metadata] of [
    ["accounting_object", defaults.accountingObjectTypeMetadata],
    ["accounting_dimension", defaults.accountingDimensionTypeMetadata],
  ]) for (const [code, definition] of Object.entries(metadata || {})) {
    if (definition.default_grid_view === undefined) continue;
    const validated = validateDefaultGridView(definition.default_grid_view);
    if (validated.error) throw new Error(`Invalid seeded default grid view for ${kind}: ${code}`);
    statements.push({
      text: `UPDATE erp_${kind}_type SET default_grid_view=$4 WHERE tenant_id=$1 AND organisation_id=$2 AND type_code=$3`,
      values: [access.tenantId, organisationId, code, validated.value],
    });
  }
  await ctx.broker("core_erp", "transaction", { statements });
}
module.exports = { seedGridViews };
