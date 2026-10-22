'use strict';
const {randomUUID}=require('node:crypto');

function lineOrder(value, fallback) {
  if (value === undefined) return fallback;
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return null;
  const order=Number(value);
  return Number.isInteger(order)&&order>=0&&order<=2147483647 ? order : null;
}

// Preserve identities; stage unique keys before swaps and update in one transaction.
function prepareLineIdentities(lines, existing, copying=false) {
  const byId=new Map(existing.map(row=>[row.transaction_line_definition_id,row]));
  const byCode=new Map(existing.map(row=>[row.line_code,row]));
  const usedIds=new Set();
  for(const line of lines){
    if(!copying&&line.requestedId&&!byId.has(line.requestedId))throw Object.assign(new Error('A line definition does not belong to this transaction type. Reload before saving.'),{status:400});
    const previous=copying?null:line.requestedId?byId.get(line.requestedId):byCode.get(line.lineCode);
    line.definitionId=previous?.transaction_line_definition_id||randomUUID();
    if(usedIds.has(line.definitionId))throw Object.assign(new Error('A line definition cannot occur twice'),{status:400});
    usedIds.add(line.definitionId);
  }
  const occupied=new Set([...existing.map(row=>row.line_order),...lines.map(row=>row.lineOrder)]);
  const codes=new Set([...existing.map(row=>row.line_code),...lines.map(row=>row.lineCode)]);
  let temporary=-1;
  return existing.map(row=>{
    while(occupied.has(temporary))temporary--;
    if(temporary < -2147483648)throw new Error('No temporary line order is available');
    const order=temporary--;let code;
    do{code=randomUUID();}while(codes.has(code));codes.add(code);
    return {id:row.transaction_line_definition_id,order,code};
  });
}
module.exports={lineOrder,prepareLineIdentities};
