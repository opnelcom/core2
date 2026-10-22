"use strict";
// Line-level object allocations and independent per-type dimension requirements.
async function seedLineClassifications(ctx, access, organisationId, defaults) {
  const codes = (defaults.lineDefinitionSeeds || []).map(row => row[8] || `${row[0]}_${row[1]}`);
  if (codes.length) {
    const plans = defaults.objectAllocationSeeds || [];
    for (const plan of plans) {
      if (!codes.includes(plan.lineCode) || !['optional','mandatory'].includes(plan.requirement) || plan.valueBehaviour !== 'captured' || !plan.permittedTypes.length || new Set(plan.permittedTypes).size !== plan.permittedTypes.length) throw new Error(`Invalid object allocation seed: ${plan.lineCode}`);
    }
    await ctx.broker('core_erp', 'query', {text: `UPDATE erp_transaction_line_definition SET object_requirement='not_used',object_value_behaviour='captured',default_accounting_object_id=NULL WHERE tenant_id=$1 AND organisation_id=$2 AND line_code=ANY($3::text[])`, values:[access.tenantId,organisationId,codes]});
    await ctx.broker('core_erp', 'query', {text: `DELETE FROM erp_transaction_line_definition_object_type permitted USING erp_transaction_line_definition line WHERE permitted.transaction_line_definition_id=line.transaction_line_definition_id AND line.tenant_id=$1 AND line.organisation_id=$2 AND line.line_code=ANY($3::text[])`, values:[access.tenantId,organisationId,codes]});
    await ctx.broker('core_erp', 'query', {text: `UPDATE erp_transaction_line_definition line SET object_requirement=p.requirement,object_value_behaviour='captured',default_accounting_object_id=NULL FROM jsonb_to_recordset($3::jsonb) p("lineCode" text,requirement text) WHERE line.tenant_id=$1 AND line.organisation_id=$2 AND line.line_code=p."lineCode"`, values:[access.tenantId,organisationId,JSON.stringify(plans)]});
    await ctx.broker('core_erp', 'query', {text: `INSERT INTO erp_transaction_line_definition_object_type(tenant_id,organisation_id,transaction_line_definition_id,accounting_object_type_id,sort_order) SELECT $1,$2,line.transaction_line_definition_id,type.accounting_object_type_id,p."sortOrder" FROM jsonb_to_recordset($3::jsonb) p("lineCode" text,type text,"sortOrder" integer) JOIN erp_transaction_line_definition line ON line.tenant_id=$1 AND line.organisation_id=$2 AND line.line_code=p."lineCode" JOIN erp_accounting_object_type type ON type.tenant_id=$1 AND type.organisation_id=$2 AND type.type_code=p.type ON CONFLICT(transaction_line_definition_id,accounting_object_type_id) DO UPDATE SET sort_order=excluded.sort_order`, values:[access.tenantId,organisationId,JSON.stringify(plans.flatMap(plan=>plan.permittedTypes.map((type,index)=>({lineCode:plan.lineCode,type,sortOrder:(index+1)*10}))))]});
  }
  {
    const kind = "accounting_dimension", code = "dimension_code";
    const rows = (defaults.lineClassificationSeeds || []).filter(row => row.class === kind);
    if (!rows.length) return;
    await ctx.broker("core_erp", "query", {text: `INSERT INTO erp_transaction_line_definition_dimension_type
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
