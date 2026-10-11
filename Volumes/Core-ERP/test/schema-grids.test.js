"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {validateSchema,validateSchemaDefinition}=require("../api/_shared/erp/utils");
const {upgradeSeededSchema}=require("../api/_shared/erp/schema-attributes");
const {referenceFields}=require("../api/_shared/erp/schema-grids");
const seeds=require("../seeds/template-defaults.json");
const schema=seeds.accountingObjectTypeMetadata.property.schema_json;
const row=(type,from,to,quantity="100.0000")=>({dimensionType:type,effectiveFrom:from,effectiveTo:to,quantity,unit:"unit-id"});
test("period checks group by dimension type, allow gaps, reject inclusive overlaps and never change rows",()=>{
  const data={measurements:[row("gla","2026-03-31","2026-09-29"),row("gla","2026-09-30",""),row("retail","2026-03-31","")]};
  const original=structuredClone(data);
  assert.deepEqual(validateSchema(schema,data),[]);assert.deepEqual(data,original);
  data.measurements[1].effectiveFrom="2026-09-29";
  assert.ok(validateSchema(schema,data).some(e=>e.includes("rows 1 and 2")&&e.includes("overlap")));
  data.measurements[1].effectiveFrom="2026-10-15";
  assert.deepEqual(validateSchema(schema,data),[]);
  data.measurements[0].effectiveTo="2026-03-30";
  assert.ok(validateSchema(schema,data).some(e=>e.includes("precede")));
});
test("non-period grids support independent rows and observations without invented period rules",()=>{
  assert.deepEqual(validateSchema(schema,{features:[{featureType:"bedrooms",value:3},{featureType:"bedrooms",value:4}],marketValues:[{valuationDate:"2026-09-30",amount:"2450000.00",currencyCode:"ZAR"},{valuationDate:"2026-09-30",amount:"2500000.00",currencyCode:"ZAR"}]}),[]);
  assert.equal(schema.properties.features.periodControl,undefined);
  assert.equal(schema.properties.marketValues.periodControl,undefined);
});
test("grid validation reports row and column failures including forbidden keys and invalid money",()=>{
  for(const data of [{features:{}},{features:[null]},{features:[{featureType:"bedrooms",value:1.5}]},{features:[{featureType:"bedrooms",value:3,unknown:true}]},{marketValues:[{valuationDate:"2026-09-30",amount:"1000000000000.00",currencyCode:"ZAR"}]}])assert.ok(validateSchema(schema,data).length);
  assert.ok(validateSchema(schema,{marketValues:[{amount:"1.00"}]}).some(e=>e.includes("row 1")&&e.includes("valuationDate")));
});
test("period and reference definitions reject invalid column mappings and nested grids",()=>{
  for(const update of [g=>g.periodControl.from="quantity",g=>g.periodControl.groupBy=["unknown"],g=>g.periodControl.allowOverlap="false",g=>g.rowSchema.properties.nested={type:"grid"},g=>g.rowSchema.properties.dimensionType.target.class="unknown"]){const s=structuredClone(schema);update(s.properties.measurements);assert.ok(validateSchemaDefinition(s).length);}
});
test("row limits and optional uniqueness are independent of period control",()=>{
  const s=structuredClone(schema);Object.assign(s.properties.features,{minRows:1,maxRows:2,uniqueBy:["featureType"]});
  assert.ok(validateSchema(s,{features:[]}).some(e=>e.includes("at least 1")));
  assert.ok(validateSchema(s,{features:[{featureType:"bedrooms",value:2},{featureType:"bedrooms",value:3}]}).some(e=>e.includes("duplicate")));
});
test("template-only grid upgrades append tabs, preserve custom grids and are idempotent",()=>{
  const current={type:"object",properties:{custom:{type:"text"}},tabs:[{label:"Custom",fields:["custom"]}]};
  const updated=upgradeSeededSchema(current,schema,{addGrids:true});
  assert.equal(updated.properties.areaSqm,undefined);assert.ok(updated.properties.measurements);
  assert.deepEqual(updated.tabs[0],current.tabs[0]);
  updated.properties.measurements.helpText="My own rules";
  const again=upgradeSeededSchema(updated,schema,{addGrids:true});assert.equal(again.properties.measurements.helpText,"My own rules");assert.deepEqual(again,updated);
  assert.equal(upgradeSeededSchema(current,schema).properties.measurements,undefined);
});
test("references are discovered in ordinary fields and every grid row",()=>{
  const refs=referenceFields(schema,{measurements:[row("gla","2026-09-30","")],features:[{featureType:"bedrooms",value:3}]});
  assert.equal(refs.length,3);assert.ok(refs.every(r=>r.name.includes("row 1")));assert.ok(refs.some(r=>r.field.target.types.includes("measurement_unit")));
});
test("all shared reference type restrictions match registered template types",()=>{
  const schemas=[...Object.values(seeds.ledgerFamilySchemas),...Object.values(seeds.accountingObjectTypeMetadata).map(m=>m.schema_json),...Object.values(seeds.accountingDimensionTypeMetadata).map(m=>m.schema_json)];
  const registry=new Set(seeds.accountingDimensionTypeSeeds.map(([code])=>code));
  const walk=s=>Object.values(s.properties||{}).forEach(f=>{if(f.type==="grid")walk(f.rowSchema);if(f.target?.class==="accounting_dimension")assert.ok(f.target.types.every(code=>registry.has(code)));});schemas.forEach(walk);
});

test("sortOrder definition validation covers root fields and grid columns",()=>{
  for(const invalid of [-1,1.5,"10",null]) {
    assert.ok(validateSchemaDefinition({type:"object",properties:{name:{type:"text",sortOrder:invalid}}}).some(e=>e.includes("sortOrder")));
    assert.ok(validateSchemaDefinition({type:"object",properties:{items:{type:"grid",rowSchema:{type:"object",properties:{name:{type:"text",sortOrder:invalid}}}}}}).some(e=>e.includes("sortOrder")));
  }
  assert.deepEqual(validateSchemaDefinition({type:"object",properties:{name:{type:"text",sortOrder:0}}}),[]);
});
test("template upgrades enrich grid ordering while preserving explicit orders and non-template schemas",()=>{
  const current={type:"object",properties:{name:{type:"text"},grid:{type:"grid",rowSchema:{type:"object",properties:{value:{type:"text"},custom:{type:"text",sortOrder:5}}}}}};
  const defaults={type:"object",properties:{name:{type:"text",sortOrder:10},grid:{type:"grid",sortOrder:20,rowSchema:{type:"object",properties:{value:{type:"text",sortOrder:10},custom:{type:"text",sortOrder:20}}}}}};
  const updated=upgradeSeededSchema(current,defaults,{addGrids:true});
  assert.equal(updated.properties.name.sortOrder,10);
  assert.equal(updated.properties.grid.rowSchema.properties.value.sortOrder,10);
  assert.equal(updated.properties.grid.rowSchema.properties.custom.sortOrder,5);
  assert.deepEqual(upgradeSeededSchema(current,defaults),current);
});
