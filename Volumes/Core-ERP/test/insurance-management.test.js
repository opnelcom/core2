"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const seeds=require("../seeds/template-defaults.json");
const {validateSchemaDefinition}=require("../api/_shared/erp/utils");
const {objectReferenceConsistencyError}=require("../api/_shared/erp/object-reference-consistency");
test("insurance configuration links every posting line to valid GLs, types and policy classifications",()=>{
 const config={moduleCode:'insurance_management',objectTypes:seeds.accountingObjectTypeSeeds.filter(r=>r[0].startsWith('insurance_')).map(r=>r[0]),dimensionTypes:seeds.accountingDimensionTypeSeeds.filter(r=>r[0].startsWith('insurance_')).map(r=>r[0]),transactionTypes:seeds.transactionTypes.filter(r=>r[1]==='insurance').map(r=>r[0]),glCodes:['1250','1260','2060','4120','5760','5770'],lineClassifications:seeds.lineClassificationSeeds.filter(r=>r.lineCode.startsWith('insurance_')).map(r=>({line_code:r.lineCode,object_types:[r.type]}))},chart=new Set(seeds.chartTemplate.map(row=>row[0]));
 for(const code of config.transactionTypes){
  const lines=seeds.lineDefinitionSeeds.filter(row=>row[0]===code);
  assert.equal(lines.filter(row=>row[7]==="required").length,2);
  assert.ok(lines.some(row=>row[2]==="debit"));assert.ok(lines.some(row=>row[2]==="credit"));
  for(const line of lines){assert.ok(chart.has(line[3]));const gl=seeds.chartTemplate.find(row=>row[0]===line[3]);const allocation=seeds.objectAllocationSeeds.find(row=>row.lineCode===line[8]);if(['expense','revenue'].includes(gl[2]))assert.deepEqual(allocation.permittedTypes,[line[0].includes('recovery')?'insurance_claim':'insurance_policy']);else assert.equal(allocation,undefined);}
 }
 for(const format of seeds.financialStatementFormatSeeds){
  const codes=new Set(format.lines.flatMap(row=>row[5]?.accounts||[]));
  // Format metadata names differ; assert coverage according to existing code families.
  for(const code of format.code.startsWith("balance")?config.glCodes.slice(0,3):config.glCodes.slice(3))assert.ok(codes.has(code),`${format.code}: ${code}`);
 }
});
test("mixed reference and parent-grid membership definitions reject ambiguous and unsupported targets",()=>{
 const valid=seeds.accountingObjectTypeMetadata.insurance_claim.schema_json;assert.deepEqual(validateSchemaDefinition(valid),[]);
 for(const mutate of [s=>s.properties.affectedItems.rowSchema.properties.item.target.anyOf[0].class="unknown",s=>s.properties.affectedItems.rowSchema.properties.item.target.class="accounting_object",s=>s.properties.affectedItems.rowSchema.properties.item.referenceSource.field="missing"]){
  const schema=structuredClone(valid);mutate(schema);assert.ok(validateSchemaDefinition(schema).length);
 }
});
test("transaction object consistency uses schema relationships, permits matching pairs and rejects mismatches",()=>{
 const records=new Map([["claim",{accounting_object_id:"claim",type_code:"insurance_claim",additional_data:{policy:"policy-a"},schema_json:seeds.accountingObjectTypeMetadata.insurance_claim.schema_json}],["policy-a",{accounting_object_id:"policy-a",type_code:"insurance_policy"}],["policy-b",{accounting_object_id:"policy-b",type_code:"insurance_policy"}]]);
 assert.equal(objectReferenceConsistencyError([{value_id:"claim"},{value_id:"policy-a"}],records),null);
 assert.ok(objectReferenceConsistencyError([{value_id:"claim"},{value_id:"policy-b"}],records).includes("Insurance policy"));
 assert.equal(objectReferenceConsistencyError([{value_id:"policy-a"}],records),null);
});

test("all insurance-specific seeded types belong only to Insurance Management",()=>{
 const config={moduleCode:'insurance_management',objectTypes:seeds.accountingObjectTypeSeeds.filter(r=>r[0].startsWith('insurance_')).map(r=>r[0]),dimensionTypes:seeds.accountingDimensionTypeSeeds.filter(r=>r[0].startsWith('insurance_')).map(r=>r[0]),transactionTypes:seeds.transactionTypes.filter(r=>r[1]==='insurance').map(r=>r[0]),glCodes:['1250','1260','2060','4120','5760','5770'],lineClassifications:seeds.lineClassificationSeeds.filter(r=>r.lineCode.startsWith('insurance_')).map(r=>({line_code:r.lineCode,object_types:[r.type]}))};
 assert.equal(config.moduleCode,"insurance_management");
 assert.equal(seeds.moduleSeeds.find(row=>row[0]===config.moduleCode)[1],"Insurance Management");
 for(const type of config.objectTypes)assert.deepEqual(seeds.moduleMappings.accountingObjectTypes[type],[config.moduleCode]);
 for(const type of config.dimensionTypes)assert.deepEqual(seeds.moduleMappings.accountingDimensionTypes[type],[config.moduleCode]);
 assert.deepEqual(seeds.moduleMappings.transactionGroups.insurance,[config.moduleCode]);
 for(const type of config.transactionTypes)assert.equal(seeds.moduleMappings.transactionTypeAdditions[type],undefined);
});
