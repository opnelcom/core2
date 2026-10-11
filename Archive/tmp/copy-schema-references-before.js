"use strict";
const {classes}=require("./schema-references");
// These statements run after record copies in the same transaction. Resolve by
// class + type code + record code, never by display name or source UUID alone.
function copySchemaReferenceStatements(tenantId,sourceId,targetId,kinds){
 const union=Object.entries(classes).map(([kind,c])=>{
  const typed=c.typeTable;
  const joins=typed?`JOIN ${c.typeTable} st ON st.${c.typeId}=s.${c.typeId}
    LEFT JOIN ${c.typeTable} tt ON tt.tenant_id=$1 AND tt.organisation_id=$3 AND tt.type_code=st.type_code`:"";
  const codeCondition=kind==="legal_entity"?`lower(t.${c.code})=lower(s.${c.code})`:`t.${c.code}=s.${c.code}`;
  const available=kind==="resource"?"":"AND t.workflow_status<>'deleted'";
  const typeCondition=typed?`AND t.${c.typeId}=tt.${c.typeId}`:c.type?`AND t.${c.type}=s.${c.type}`:"";
  return `SELECT '${kind}:'||s.${c.id} old_id,CASE WHEN t.${c.id} IS NULL THEN NULL ELSE '${kind}:'||t.${c.id} END new_id
    FROM ${c.table} s ${joins} LEFT JOIN ${c.table} t ON t.tenant_id=$1 AND t.organisation_id=$3 AND ${codeCondition} ${typeCondition} ${available}
    WHERE s.tenant_id=$1 AND s.organisation_id=$2`;
 }).join(" UNION ALL ");
 return kinds.flatMap(kind=>{
  const c=classes[kind];
  return [{name:`${kind}_schema_references`,text:`WITH mapping AS (SELECT jsonb_object_agg(old_id,new_id) data FROM (${union}) records)
    UPDATE ${c.table} target SET additional_data=erp_remap_schema_references(source.additional_data,st.schema_json,COALESCE(mapping.data,'{}'::jsonb))
    FROM ${c.table} source JOIN ${c.typeTable} st ON st.${c.typeId}=source.${c.typeId}
    JOIN ${c.typeTable} tt ON tt.tenant_id=$1 AND tt.organisation_id=$3 AND tt.type_code=st.type_code CROSS JOIN mapping
    WHERE source.tenant_id=$1 AND source.organisation_id=$2 AND target.tenant_id=$1 AND target.organisation_id=$3
      AND target.${c.typeId}=tt.${c.typeId} AND target.${c.code}=source.${c.code}`,values:[tenantId,sourceId,targetId]},
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
module.exports={copySchemaReferenceStatements};
