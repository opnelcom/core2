"use strict";

function validateEditorLayout(uiSchema) {
  if (!uiSchema || typeof uiSchema !== "object" || Array.isArray(uiSchema))
    return "UI schema must be a JSON object";
  if (uiSchema.default_editor_layout !== undefined &&
      !["tabs", "stacked"].includes(uiSchema.default_editor_layout))
    return "Default editor layout must be tabs or stacked";
  return null;
}

async function seedEditorLayouts(ctx, access, organisationId, defaults) {
  const statements = [];
  for (const [kind, entries] of [
    ["subledger_account", defaults.ledgerFamilies],
    ["accounting_object", defaults.accountingObjectTypeSeeds],
    ["accounting_dimension", defaults.accountingDimensionTypeSeeds],
  ]) {
    const layout = defaults.defaultEditorLayouts[kind];
    const error = validateEditorLayout({ default_editor_layout: layout });
    if (error || layout === undefined) throw new Error(`Invalid seeded editor layout for ${kind}`);
    statements.push({
      text: `UPDATE erp_${kind}_type SET ui_schema_json=COALESCE(ui_schema_json,'{}'::jsonb) || jsonb_build_object('default_editor_layout',$4::text) WHERE tenant_id=$1 AND organisation_id=$2 AND type_code=ANY($3::text[])`,
      values: [access.tenantId, organisationId, entries.map(row => row[0]), layout],
    });
  }
  await ctx.broker("core_erp", "transaction", { statements });
}

module.exports = { validateEditorLayout, seedEditorLayouts };
