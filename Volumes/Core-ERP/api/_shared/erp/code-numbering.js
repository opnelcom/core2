"use strict";

const MAX_NUMBER = Number.MAX_SAFE_INTEGER - 1;
const {createTransactionPlan}=require('./transaction-plan');

// Built-in codes are type configuration, independent of custom schema_json.
function validateCodeNumbering(value) {
  if (value === undefined) return { value: null }; // Preserve settings for older API clients.
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { error: "Code numbering must be an object" };
  if (value.mode === "manual") return { value: { mode: "manual" } };
  if (value.mode !== "automatic") return { error: "Choose manual or automatic code numbering" };
  const { start, end, padding = 0, prefix = "" } = value;
  if (![start, end].every(n => Number.isSafeInteger(n) && n >= 0 && n <= MAX_NUMBER) || start > end)
    return { error: `Number range must contain whole numbers from 0 to ${MAX_NUMBER}, with start no greater than end` };
  if (!Number.isInteger(padding) || padding < 0 || padding > 32)
    return { error: "Zero padding must be a whole number from 0 to 32" };
  if (typeof prefix !== "string" || prefix.length > 32 || prefix !== prefix.trim())
    return { error: "Prefix must be text of at most 32 characters without surrounding spaces" };
  return { value: { mode: "automatic", start, end, padding, prefix } };
}

function numberedRecordStatement(statement, options) {
  if (!["gl_account", "subledger_account", "accounting_object", "accounting_dimension"].includes(options.kind))
    throw new Error("Unsupported numbered object class");
  return {...statement, numbering:options};
}
function numberingError(message){return Object.assign(new Error(`Code numbering: ${message}`),{status:400});}
// The allocator runs in ERP; its input snapshots are guarded in the SQL batch.
async function executeNumberedStatements(client, statements, plan = null) {
 const record=statements.find(s=>s.numbering);
 if(!record)throw new Error('Numbered record statement required');
 if(statements.filter(s=>s.numbering).length!==1)throw new Error('One numbered record per transaction is required');
 const {kind,typeParameter,codeParameter,idParameter,submittedId}=record.numbering;
 if(!['gl_account','subledger_account','accounting_object','accounting_dimension'].includes(kind))throw new Error('Unsupported numbered object class');
 const [tenant,organisation]=record.values,typeId=record.values[typeParameter-1];
 const typeTable=`erp_${kind}_type`,typeColumn=`${kind}_type_id`,recordTable=`erp_${kind}`,idColumn=`${kind}_id`;
 const codeColumn=kind==='accounting_object'?'object_code':kind==='accounting_dimension'?'dimension_code':'account_code';
 if(kind==='gl_account')await client.query('SELECT organisation_id FROM erp_organisation WHERE tenant_id=$1 AND organisation_id=$2 FOR UPDATE',[tenant,organisation]);
 const settings=await client.query(`SELECT code_numbering,code_number_next FROM ${typeTable} WHERE tenant_id=$1 AND organisation_id=$2 AND ${typeColumn}=$3 FOR UPDATE`,[tenant,organisation,typeId]);
 if(!settings.rows.length)throw numberingError('object type not found in this organisation');
 const row=settings.rows[0],config=row.code_numbering,checked=validateCodeNumbering(config);
 if(checked.error)throw numberingError(checked.error);
 let code=String(record.values[codeParameter-1]??'').trim();
 if(config.mode==='automatic'&&submittedId){
  const current=await client.query(`SELECT ${codeColumn} AS code FROM ${recordTable} WHERE tenant_id=$1 AND organisation_id=$2 AND ${idColumn}=$3 FOR UPDATE`,[tenant,organisation,record.values[idParameter-1]]);
  if(!current.rows.length)throw numberingError('existing record not found');code=current.rows[0].code;
 }else if(config.mode==='manual'){
  if(!code)throw numberingError('enter a code for this object type');
 }else{
  let next=Math.max(Number(row.code_number_next??config.start),config.start),allocated=false;
  while(next<=config.end){
   code=config.prefix+String(next).padStart(config.padding,'0');
   const used=await client.query(`SELECT 1 FROM ${recordTable} WHERE tenant_id=$1 AND organisation_id=$2 AND ${codeColumn}=$3 ${kind==='gl_account'?'':`AND ${typeColumn}=$4`} LIMIT 1`,kind==='gl_account'?[tenant,organisation,code]:[tenant,organisation,code,typeId]);
   next++;if(!used.rows.length){allocated=true;break;}
  }
  if(!allocated)throw numberingError('range exhausted; ask an administrator to fix the range');
  await client.query(`UPDATE ${typeTable} SET code_number_next=$4 WHERE tenant_id=$1 AND organisation_id=$2 AND ${typeColumn}=$3`,[tenant,organisation,typeId,next]);
 }
 const results=[];
 for(const statement of statements){
  const values=[...(statement.values||[])];if(statement===record)values[codeParameter-1]=code;
  const prepared={text:statement.text,values,...(statement===record?{expectedRowCount:1}:{})};
  const result=plan?plan.write(prepared):await client.query(prepared.text,prepared.values);
  if(statement===record&&(result.rowCount??result.affectedRows)===0)throw numberingError('record not found or cannot be edited');
  results.push({rows:result.rows,rowCount:result.rowCount??result.affectedRows,command:result.command});
 }
 return results;
}
async function saveNumberedTransaction(ctx, statements) {
 try{
  const plan=createTransactionPlan(ctx,['erp_organisation']);
  await executeNumberedStatements(plan.client,statements,plan);
  const result=await plan.commit();return {results:result.results.slice(-statements.length)};
 }
 catch(error){if(error.message.includes('Code numbering:'))error.status=error.status||400;throw error;}
}
module.exports = { validateCodeNumbering, numberedRecordStatement, saveNumberedTransaction, executeNumberedStatements };
