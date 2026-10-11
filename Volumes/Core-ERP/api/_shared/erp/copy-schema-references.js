"use strict";
const {classes}=require("./schema-references");
const {randomUUID}=require('node:crypto');
const {createTransactionPlan}=require('./transaction-plan');

function remapSchemaReferences(data,schema,mapping){
 if(!data||typeof data!=='object'||Array.isArray(data))return data;
 const result={...data};
 for(const [key,field] of Object.entries(schema?.properties||{})){
  const value=data[key];
  if(field?.type==='reference'&&typeof value==='string'){
   const mixed=Object.hasOwn(field.target||{},'anyOf');
   const mapped=mapping[mixed?value:`${field.target?.class}:${value}`];
   result[key]=mapped==null?null:mixed?mapped:mapped.split(':')[1];
  }else if(field?.type==='grid'&&Array.isArray(value)){
   result[key]=value.map(row=>remapSchemaReferences(row,field.rowSchema,mapping));
  }
 }
 return result;
}

const copyNames={gl_account:'gl_accounts',legal_entity:'legal_entities',subledger_account:'subledger_accounts',accounting_object:'accounting_objects',accounting_dimension:'accounting_dimensions'};
// Allocate IDs before transformation, retaining destination IDs on existing rows.
// All preparation reads are verified under locks in the final SQL batch.
async function prepareSchemaReferenceCopy(ctx,tenantId,sourceId,targetId,statements,kinds){
 const plan=createTransactionPlan(ctx,['erp_organisation','erp_schema_grid_row']);
 const mapping={},allocated={},sourceData={};
 const divisions=await plan.client.query(`SELECT division_code FROM erp_division WHERE tenant_id=$1 AND organisation_id=$2 AND workflow_status<>'deleted'`,[tenantId,targetId]);
 const divisionCodes=new Set(divisions.rows.map(r=>r.division_code));
 for(const [kind,c] of Object.entries(classes)){
  const typed=!!c.typeTable;
  const divided=typed&&kind!=='gl_account';
  const rows=await plan.client.query(`SELECT r.${c.id} id,r.${c.code} code,r.organisation_id,
    ${typed?'t.type_code':c.type?`r.${c.type}`:'NULL'} type_code,
    ${divided?'t.schema_json':'NULL::jsonb'} schema_json,
    ${divided?'d.division_code':'NULL'} division_code,
    ${kind==='resource'?"'active'":'r.workflow_status'} workflow_status,
    ${typed?'r.additional_data':'NULL::jsonb'} additional_data
    FROM ${c.table} r ${typed?`LEFT JOIN ${c.typeTable} t ON t.${c.typeId}=r.${c.typeId}`:''} ${divided?'LEFT JOIN erp_division d ON d.division_id=r.owner_division_id':''}
    WHERE r.tenant_id=$1 AND r.organisation_id=ANY($2::uuid[])`,[tenantId,[sourceId,targetId]]);
  const sources=rows.rows.filter(r=>r.organisation_id===sourceId),targets=rows.rows.filter(r=>r.organisation_id===targetId);
  const copyStatement=statements.find(s=>s.name===copyNames[kind]);
  let targetTypes=new Set();
  if(typed){
   const types=await plan.client.query(`SELECT type_code FROM ${c.typeTable} WHERE tenant_id=$1 AND organisation_id=$2`,[tenantId,targetId]);
   targetTypes=new Set(types.rows.map(r=>r.type_code));
  }
  const copiesTypes=typed&&statements.some(s=>s.text.includes(`INSERT INTO ${c.typeTable}(`));
  allocated[kind]={};sourceData[kind]=sources;
  for(const source of sources){
   const codeMatch=t=>kind==='legal_entity'?String(t.code).toLowerCase()===String(source.code).toLowerCase():t.code===source.code;
   const conflict=targets.find(t=>codeMatch(t)&&(kind==='legal_entity'?t.workflow_status!=='deleted':kind==='gl_account'||t.type_code===source.type_code));
   const eligible=copyStatement&&source.workflow_status!=='deleted'&&(!typed||kind==='gl_account'||(source.type_code&&divisionCodes.has(source.division_code)))&&(!typed||kind==='gl_account'||copiesTypes||targetTypes.has(source.type_code));
   if(eligible)allocated[kind][source.id]=conflict?.id||randomUUID();
   const existing=targets.find(t=>codeMatch(t)&&t.type_code===source.type_code&&(kind==='resource'||t.workflow_status!=='deleted'));
   const destination=typed&&!source.type_code?null:eligible?
    (kind==='gl_account'&&conflict&&(conflict.type_code!==source.type_code||conflict.workflow_status==='deleted')?null:allocated[kind][source.id]):existing?.id;
   mapping[`${kind}:${source.id}`]=destination?`${kind}:${destination}`:null;
  }
  if(copyStatement){
   const param=copyStatement.values.length+1;
   const alias=kind==='gl_account'?'s.':kind==='legal_entity'?'':'source.';
   copyStatement.text=copyStatement.text.replace(`INSERT INTO ${c.table}(`,`INSERT INTO ${c.table}(${c.id},`)
     .replace('SELECT $1,$3,',`SELECT ($${param}::jsonb->>${alias}${c.id}::text)::uuid,$1,$3,`);
   copyStatement.values=[...copyStatement.values,JSON.stringify(allocated[kind])];
  }
 }
 const payloads={};
 for(const kind of kinds)payloads[kind]=Object.fromEntries(sourceData[kind].map(row=>[row.id,remapSchemaReferences(row.additional_data,row.schema_json,mapping)]));
 statements.push(...copySchemaReferenceStatements(tenantId,sourceId,targetId,kinds,payloads));
 statements.forEach(s=>plan.write({text:s.text,values:s.values}));
 return plan;
}
// These statements run after record copies in the same transaction. Resolve by
// class + type code + record code, never by display name or source UUID alone.
function copySchemaReferenceStatements(tenantId,sourceId,targetId,kinds,payloads){
 return kinds.flatMap(kind=>{
  const c=classes[kind];
  return [{name:`${kind}_schema_references`,text:`UPDATE ${c.table} target SET additional_data=$4::jsonb->source.${c.id}::text
    FROM ${c.table} source JOIN ${c.typeTable} st ON st.${c.typeId}=source.${c.typeId}
    JOIN ${c.typeTable} tt ON tt.tenant_id=$1 AND tt.organisation_id=$3 AND tt.type_code=st.type_code
    WHERE source.tenant_id=$1 AND source.organisation_id=$2 AND target.tenant_id=$1 AND target.organisation_id=$3
      AND target.${c.typeId}=tt.${c.typeId} AND target.${c.code}=source.${c.code}`,values:[tenantId,sourceId,targetId,JSON.stringify(payloads[kind])]},
   {name:`${kind}_grid_projection_reset`,text:`DELETE FROM erp_schema_grid_row g USING ${c.table} r,${c.typeTable} t,${c.typeTable} st,${c.table} source
    WHERE g.tenant_id=$1 AND g.organisation_id=$3 AND g.object_kind=$4 AND g.object_id=r.${c.id}
      AND r.tenant_id=$1 AND r.organisation_id=$3 AND r.${c.typeId}=t.${c.typeId}
      AND st.tenant_id=$1 AND st.organisation_id=$2 AND st.type_code=t.type_code
      AND source.tenant_id=$1 AND source.organisation_id=$2 AND source.${c.typeId}=st.${c.typeId} AND source.${c.code}=r.${c.code}`,values:[tenantId,sourceId,targetId,kind]},
   {name:`${kind}_grid_projection`,text:`INSERT INTO erp_schema_grid_row(tenant_id,organisation_id,object_kind,object_id,field_key,row_index,row_data,grid_schema_json)
    SELECT $1,$3,$4,r.${c.id},f.key,row.ord,row.data,f.value
    FROM ${c.table} r JOIN ${c.typeTable} t ON t.${c.typeId}=r.${c.typeId}
    JOIN ${c.typeTable} st ON st.tenant_id=$1 AND st.organisation_id=$2 AND st.type_code=t.type_code
    JOIN ${c.table} source ON source.tenant_id=$1 AND source.organisation_id=$2 AND source.${c.typeId}=st.${c.typeId} AND source.${c.code}=r.${c.code}
    CROSS JOIN LATERAL jsonb_each(t.schema_json->'properties') f
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN f.value->>'type'='grid' AND jsonb_typeof(r.additional_data->f.key)='array' THEN r.additional_data->f.key ELSE '[]'::jsonb END) WITH ORDINALITY row(data,ord)
    WHERE r.tenant_id=$1 AND r.organisation_id=$3`,values:[tenantId,sourceId,targetId,kind]}];
 });
}
module.exports={remapSchemaReferences,prepareSchemaReferenceCopy};
