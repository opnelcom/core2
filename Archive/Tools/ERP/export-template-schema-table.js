"use strict";
const fs = require("node:fs");
const path = require("node:path");
const seeds = require("../../Volumes/Core-ERP/seeds/template-defaults.json");

function exportTemplateSchemaTable(source) {
  const groups = [
    ["Subledger", source.ledgerFamilies, source.ledgerFamilySchemas],
    ["Accounting object", source.accountingObjectTypeSeeds, Object.fromEntries(Object.entries(source.accountingObjectTypeMetadata).map(([key, value]) => [key, value.schema_json]))],
    ["Accounting dimension", source.accountingDimensionTypeSeeds, Object.fromEntries(Object.entries(source.accountingDimensionTypeMetadata).map(([key, value]) => [key, value.schema_json]))],
  ];
  const rows = [];
  for (const [className, types, schemas] of groups) {
    for (const [code, name] of types) {
      const schema = schemas[code];
      const fields = Object.entries(schema.properties || {});
      if (!fields.length) rows.push([className, code, name, "—", "—", "—", "—", "—", "", "", ""]);
      const flatFields = fields.flatMap(([key,field])=>[[key,field],...(field.type==="grid"?Object.entries(field.rowSchema.properties).map(([column,definition])=>[`${key}.${column}`,definition]):[])]);
      for (const [key, field] of flatFields) {
        const { type, title } = field;
        const choices = field.options
          ? field.options.map(option => typeof option === "object" ? `${option.code ?? option.value}: ${option.description ?? option.label ?? option.code ?? option.value}` : String(option))
          : (field.enum || []).map((value, index) => field.enumNames?.[index] ? `${value}: ${field.enumNames[index]}` : String(value));
        const [gridKey,columnKey]=key.split(".");
        const required=columnKey?schema.properties[gridKey].rowSchema.required:schema.required;
        rows.push([className, code, name, key, title, type, (required || []).includes(columnKey || key) ? "Yes" : "No", (schema.tabs || []).filter(tab => tab.fields.includes(gridKey)).map(tab => tab.label).join(", ") || "—", choices.join("; "), field.target?JSON.stringify(field.target):"", field.periodControl?JSON.stringify(field.periodControl):""]);
      }
    }
  }
  const cell = value => String(value ?? "—").replace(/\|/g, "&#124;").replace(/\r?\n/g, "<br>");
  return [
    "# Template organisation: custom schema fields",
    "",
    "Generated from `Volumes/Core-ERP/seeds/template-defaults.json`. Regenerate with `node Tools/ERP/export-template-schema-table.js`.",
    "",
    "One row per custom field or grid column (gridKey.columnKey), plus one row per empty type. Covers all three classes that use the documented custom-schema system. Built-in record fields (code, name, owner division, etc.) are outside this table. Other setup classes and transaction posting definitions do not use this custom-schema registry. The legacy top-level customerSchema is excluded because it is not the active customer type schema.",
    "",
    "Enums lists allowed choices defined by enum or options, including labels where supplied. Reference target identifies the ERP class and permitted types. Period control is blank when no effective-period validation applies. Root custom fields are optional; Required on a grid column applies to each row that is added.",
    "",
    "| Object class | Type code | Type name | Field key | Field label | Field type | Required | Tab | Enums | Reference target | Period control |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map(row => `| ${row.map(cell).join(" | ")} |`),
    "",
  ].join("\n");
}

function exportTemplateCollectionTable(source) {
  const groups = [
    ["Subledger", source.ledgerFamilies, source.ledgerFamilySchemas],
    ["Accounting object", source.accountingObjectTypeSeeds, Object.fromEntries(Object.entries(source.accountingObjectTypeMetadata).map(([key, value]) => [key, value.schema_json]))],
    ["Accounting dimension", source.accountingDimensionTypeSeeds, Object.fromEntries(Object.entries(source.accountingDimensionTypeMetadata).map(([key, value]) => [key, value.schema_json]))],
  ];
  const cell = value => String(value).replace(/\|/g, "&#124;").replace(/\r?\n/g, "<br>");
  const attributes = (properties, required = []) => Object.entries(properties || {})
    .sort(([a, x], [b, y]) => (x.sortOrder ?? Infinity) - (y.sortOrder ?? Infinity) || a.localeCompare(b))
    .map(([key, field]) => `${key}${required.includes(key) ? "*" : ""} (${field.type})`).join(", ") || "—";
  const rows = [];
  let typeCount = 0;
  let collectionCount = 0;
  for (const [className, types, schemas] of groups) {
    for (const [code, name] of types) {
      typeCount++;
      const schema = schemas[code];
      const fields = Object.entries(schema.properties || {});
      const root = attributes(Object.fromEntries(fields.filter(([, field]) => field.type !== "grid")), schema.required);
      const grids = fields.filter(([, field]) => field.type === "grid");
      collectionCount += grids.length;
      rows.push([className, `${name} (${code})`, root, grids.map(([key, field]) =>
        `**${key}**${(schema.required || []).includes(key) ? "*" : ""}: ${attributes(field.rowSchema.properties, field.rowSchema.required)}`
      ).join("<br><br>") || "—"]);
    }
  }
  return [
    "# Template organisation: object types, attributes and child collections", "",
    "Generated from `Volumes/Core-ERP/seeds/template-defaults.json`. Regenerate with `node Tools/ERP/export-template-schema-table.js`.", "",
    `${typeCount} seeded types across three custom-schema object classes; ${collectionCount} child collections. One row per type.`, "",
    "Names below are exact storage keys; parentheses show declared field types. An asterisk marks a required field; inside a child collection it applies to each added row. Child collections are schema grids stored as arrays in the parent's additional_data, with reporting projections, rather than independently edited records.", "",
    "Scope: active seeded custom schemas for Subledger, Accounting Object and Accounting Dimension. Built-in record fields (including identifiers, code, name and owner division), Resources, Legal Entities, GL accounts, setup registries and transaction posting definitions are outside this custom-schema inventory. The inactive legacy customerSchema is excluded. These seeds describe the recommended template, not the current contents of a live organisation.", "",
    "Property currently has a single physicalAddress field and no addresses collection. Customer and Vendor have addresses collections. A dash means no custom attributes or child collections are seeded, not that the record has no built-in fields.", "",
    "See [the detailed field table](template-schema-fields.md) for labels, required flags, choices, reference targets, tabs and period rules, and [the schema guide](schema-json.md) for storage and validation behaviour.", "",
    "| Object class | Seeded type (code) | Object attributes | Child collections and their attributes |",
    "| --- | --- | --- | --- |",
    ...rows.map(row => `| ${row.map(cell).join(" | ")} |`), "",
  ].join("\n");
}

if (require.main === module) {
  const target = path.resolve(__dirname, "../../docs/erp/template-schema-fields.md");
  fs.writeFileSync(target, exportTemplateSchemaTable(seeds));
  console.log(target);
  const collectionTarget = path.resolve(__dirname, "../../docs/erp/template-object-collections.md");
  fs.writeFileSync(collectionTarget, exportTemplateCollectionTable(seeds));
  console.log(collectionTarget);
}
module.exports = { exportTemplateSchemaTable, exportTemplateCollectionTable };
