'use strict';
const {validateSchemaDefinition}=require('./utils');

// Expand shared seed families into ordinary schemas. Stored definitions and the
// renderer continue to use the existing schema format, without references.
function resolveTransactionSchemas(defaults){
 const types=defaults.transactionTypes||[];
 const families=defaults.transactionSchemaFamilies||{};
 const mappings=defaults.transactionTypeSchemaFamilies||{};
 const codes=new Set(types.map(row=>row[0]));
 for(const code of Object.keys(mappings))if(!codes.has(code))throw new Error(`Transaction schema mapping refers to unknown type: ${code}`);
 const schemas={};
 for(const row of types){
  const code=row[0],family=mappings[code];
  if(Object.keys(families).length&&!family)throw new Error(`Missing transaction schema family: ${code}`);
  if(family&&!Object.hasOwn(families,family))throw new Error(`Unknown transaction schema family: ${family}`);
  const schema=row[6]??families[family]?.schema_json??{};
  const errors=validateSchemaDefinition(schema);
  if(errors.length)throw new Error(`Invalid transaction schema ${code}: ${errors.join('; ')}`);
  schemas[code]=structuredClone(schema);
 }
 return schemas;
}
module.exports={resolveTransactionSchemas};
