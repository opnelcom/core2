"use strict";
// Reuse root object references to check jointly captured transaction classifications.
function objectReferenceConsistencyError(allocations,records){
 const selected=allocations.map(a=>records.get(a.value_id)).filter(Boolean);
 for(const source of selected)for(const [key,field] of Object.entries(source.schema_json?.properties||{})){
  if(field.type!=="reference"||field.target?.class!=="accounting_object"||!Array.isArray(field.target.types))continue;
  const expected=source.additional_data?.[key];if(!expected)continue;
  const related=selected.filter(object=>field.target.types.includes(object.type_code));
  if(related.some(object=>object.accounting_object_id!==expected))return `${field.title||key} does not match the selected related accounting object`;
 }
 return null;
}
module.exports={objectReferenceConsistencyError};
