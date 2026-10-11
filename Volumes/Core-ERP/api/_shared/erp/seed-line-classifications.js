"use strict";
// One class-based loader for every scenario's transaction classifications.
async function seedLineClassifications(ctx, access, organisationId, defaults) {
  for (const kind of ["accounting_object", "accounting_dimension"]) {
    const object = kind === "accounting_object";
    const code = object ? "object_code" : "dimension_code";
    const rows = (defaults.lineClassificationSeeds || []).filter(row => row.class === kind);
    if (!rows.length) continue;
    await ctx.broker("core_erp", "query", {text: `INSERT INTO erp_transaction_line_definition_${object ? "object" : "dimension"}_type
      (tenant_id,organisation_id,transaction_line_definition_id,${kind}_type_id,requirement,value_behaviour,${kind}_id,sort_order)
      SELECT $1,$2,l.transaction_line_definition_id,t.${kind}_type_id,p.requirement,p."valueBehaviour",r.${kind}_id,p."sortOrder"
      FROM jsonb_to_recordset($3::jsonb) p("lineCode" text,type text,requirement text,"valueBehaviour" text,"recordCode" text,"sortOrder" integer)
      JOIN erp_transaction_line_definition l ON l.tenant_id=$1 AND l.organisation_id=$2 AND l.line_code=p."lineCode"
      JOIN erp_${kind}_type t ON t.tenant_id=$1 AND t.organisation_id=$2 AND t.type_code=p.type
      LEFT JOIN erp_${kind} r ON r.tenant_id=$1 AND r.organisation_id=$2 AND r.${kind}_type_id=t.${kind}_type_id AND r.${code}=p."recordCode"
      ON CONFLICT(transaction_line_definition_id,${kind}_type_id) DO UPDATE SET requirement=excluded.requirement,
        value_behaviour=excluded.value_behaviour,${kind}_id=excluded.${kind}_id,sort_order=excluded.sort_order`,
      values: [access.tenantId, organisationId, JSON.stringify(rows)]});
  }
}
module.exports = {seedLineClassifications};
