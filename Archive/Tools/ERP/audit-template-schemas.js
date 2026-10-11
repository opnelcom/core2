"use strict";
const { validateSchemaDefinition, validateSchema } = require("../../Volumes/Core-ERP/api/_shared/erp/utils");
const seeds = require("../../Volumes/Core-ERP/seeds/template-defaults.json");

const fieldTypes = new Set(["short_text", "text", "long_text", "integer", "number", "decimal", "currency", "boolean", "date", "date_time", "email", "url", "select", "object", "array", "grid", "reference"]);
const attributes = new Set(["type", "title", "default", "maxLength", "minLength", "pattern", "minimum", "maximum", "precision", "scale", "options", "enum", "enumNames", "uiWidth", "sortOrder", "rows", "placeholder", "helpText", "description", "currencyCode", "step", "x-searchable", "x-reportable", "x-listView", "items", "rowSchema", "referenceSource", "periodControl", "target", "uniqueBy", "minRows", "maxRows"]);
function allFields(properties, prefix = "") {
  return Object.entries(properties || {}).flatMap(([key, field]) => [[prefix + key, field], ...(field?.type === "grid" ? allFields(field.rowSchema?.properties, `${prefix}${key}.`) : [])]);
}

function auditTemplateSchemas(source) {
  const errors = [], inventory = [];
  const groups = [
    ["subledger", source.ledgerFamilies, source.ledgerFamilySchemas],
    ["accounting object", source.accountingObjectTypeSeeds, Object.fromEntries(Object.entries(source.accountingObjectTypeMetadata || {}).map(([code, value]) => [code, value.schema_json]))],
    ["accounting dimension", source.accountingDimensionTypeSeeds, Object.fromEntries(Object.entries(source.accountingDimensionTypeMetadata || {}).map(([code, value]) => [code, value.schema_json]))],
  ];
  for (const [className, types, schemas] of groups) {
    const codes = (types || []).map(([code]) => code);
    if (new Set(codes).size !== codes.length) errors.push(`${className}: duplicate type codes`);
    for (const code of Object.keys(schemas || {})) if (!codes.includes(code)) errors.push(`${className}/${code}: schema has no seeded type`);
    for (const [code, name] of types || []) {
      const prefix = `${className}/${code}`;
      const schema = schemas?.[code];
      if (!schema) { errors.push(`${prefix}: missing schema`); continue; }
      const issues = validateSchemaDefinition(schema);
      if (schema.type !== "object") issues.push('root type must be "object"');
      if (!Array.isArray(schema.required)) issues.push("required must be an explicit array");
      if (typeof schema.additionalProperties !== "boolean") issues.push("additionalProperties must be explicit");
      const properties = schema.properties || {};
      for (const key of schema.required || []) if (!properties[key]) issues.push(`required references unknown field ${key}`);
      const assigned = new Set();
      for (const tab of schema.tabs || []) {
        if (!tab.label || !Array.isArray(tab.fields)) { issues.push("tabs need labels and fields arrays"); continue; }
        for (const key of tab.fields) {
          if (!properties[key]) issues.push(`tab references unknown field ${key}`);
          if (assigned.has(key)) issues.push(`duplicate tab field ${key}`);
          assigned.add(key);
        }
      }
      for (const [key, field] of allFields(properties)) {
        if (!field || typeof field !== "object") continue;
        if (!fieldTypes.has(field.type)) issues.push(`${key}: unsupported or legacy type ${field.type}`);
        if (!Number.isInteger(field.sortOrder) || field.sortOrder < 0) issues.push(`${key}: sortOrder must be explicit and non-negative`);
        if (!field.title || !field.uiWidth) issues.push(`${key}: title and uiWidth must be explicit`);
        for (const attribute of Object.keys(field)) if (!attributes.has(attribute)) issues.push(`${key}: non-canonical attribute ${attribute}`);
        if (["short_text", "text", "long_text", "email", "url"].includes(field.type) && !(field.maxLength > 0)) issues.push(`${key}: missing text length limit`);
        if (field.type === "long_text" && !(field.rows > 0)) issues.push(`${key}: missing textarea rows`);
        if (["decimal", "currency"].includes(field.type) && (!Number.isInteger(field.precision) || !Number.isInteger(field.scale))) issues.push(`${key}: precision and scale must be explicit`);
        if (field.options && field.enum) issues.push(`${key}: use one choice definition`);
        const choices = field.options ? field.options.map((option) => option.code ?? option.value ?? option) : field.enum;
        if (field.type === "select" && !choices?.length) issues.push(`${key}: select requires choices`);
        if (field.type === "reference") for(const target of field.target?.anyOf || [field.target]) if(target?.types) {
          const registries = { accounting_object: source.accountingObjectTypeSeeds, accounting_dimension: source.accountingDimensionTypeSeeds, subledger_account: source.ledgerFamilies };
          const registry = registries[target.class];
          if (registry) for (const code of target.types) if (!registry.some(([typeCode])=>typeCode===code)) issues.push(`${key}: reference targets unknown type ${code}`);
        }
        if (choices) {
          if (choices.some((choice) => typeof choice !== "string" || !choice)) issues.push(`${key}: choice codes must be non-empty strings`);
          if (new Set(choices).size !== choices.length) issues.push(`${key}: duplicate choice codes`);
        }
        if (field.default !== undefined) issues.push(...validateSchema({ properties: { [key]: field } }, { [key]: field.default }).map((error) => `invalid default: ${error}`));
      }
      errors.push(...issues.map((issue) => `${prefix}: ${issue}`));
      const grids = Object.values(properties).filter(field=>field.type === "grid");
      inventory.push({ className, code, name, fields: Object.keys(properties).length, grids: grids.length, columns: grids.reduce((sum,field)=>sum+Object.keys(field.rowSchema.properties).length,0), status: Object.keys(properties).length ? "populated" : "empty" });
    }
  }
  for (const [className, rows, schemas] of [
    ["accounting object", source.accountingObjectSeeds, source.accountingObjectTypeMetadata],
    ["accounting dimension", source.accountingDimensionSeeds, source.accountingDimensionTypeMetadata],
    ["subledger", source.subledgerAccountSeeds, source.ledgerFamilySchemas],
  ]) for (const [typeCode, recordCode] of rows || []) {
    const schema = schemas?.[typeCode]?.schema_json || schemas?.[typeCode];
    if (!schema) errors.push(`${className}/${typeCode}/${recordCode}: missing type schema`);
    else errors.push(...validateSchema(schema, {}).map((issue) => `${className}/${typeCode}/${recordCode}: empty seeded additional_data fails: ${issue}`));
  }
  const schemasByClass={accounting_object:source.accountingObjectTypeMetadata,accounting_dimension:source.accountingDimensionTypeMetadata,subledger_account:source.ledgerFamilySchemas};
  const referenceIds=new Map();
  const exampleId=ref=>{const key=JSON.stringify(ref);if(!referenceIds.has(key))referenceIds.set(key,'10000000-0000-0000-0000-'+String(referenceIds.size+1).padStart(12,'0'));return referenceIds.get(key);};
  const resolveExample=value=>Array.isArray(value)?value.map(resolveExample):value&&typeof value==='object'?value.$ref?(value.mixed?value.$ref[0]+':':'')+exampleId(value.$ref):Object.fromEntries(Object.entries(value).map(([key,item])=>[key,resolveExample(item)])):value;
  for(const example of source.exampleData||[]){const registry=schemasByClass[example.class];if(!registry)continue;const schema=registry[example.type]?.schema_json||registry[example.type];if(!schema)errors.push(example.code+': missing type schema');else errors.push(...validateSchema(schema,resolveExample(example.data||{})).map(issue=>example.code+': '+issue));}
  return { inventory, errors };
}

if (require.main === module) {
  const result = auditTemplateSchemas(seeds);
  console.table(result.inventory);
  console.log(`${result.inventory.length} types, ${result.inventory.reduce((sum, row) => sum + row.fields, 0)} fields, ${result.errors.length} errors.`);
  for (const error of result.errors) console.error(error);
  process.exitCode = result.errors.length ? 1 : 0;
}
module.exports = { auditTemplateSchemas };
