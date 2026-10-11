"use strict";
const { classes } = require("./schema-references");

function versionStatement({ tenantId, organisationId, kind, id, email, baseline = false }) {
  const c = classes[kind];
  if (!c || !["subledger_account", "accounting_object", "accounting_dimension"].includes(kind)) throw new Error("Unsupported versioned object class");
  return {
    text: `INSERT INTO erp_object_data_version(tenant_id,organisation_id,object_kind,object_id,version_number,record_json,schema_json,resource_assignments_json,saved_by_email,is_baseline)
           SELECT $1,$2,$3,$4,COALESCE((SELECT max(v.version_number) FROM erp_object_data_version v WHERE v.tenant_id=$1 AND v.organisation_id=$2 AND v.object_kind=$3 AND v.object_id=$4),0)+1,
             to_jsonb(r),t.schema_json,
             COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.resource_assignment_id) FROM erp_resource_assignment a WHERE a.tenant_id=$1 AND a.organisation_id=$2 AND a.object_kind=$3 AND a.object_id=$4),'[]'::jsonb),
             ${baseline ? "COALESCE(r.updated_by_email,r.created_by_email,$5)" : "$5"},$6
           FROM ${c.table} r JOIN ${c.typeTable} t ON t.${c.typeId}=r.${c.typeId} AND t.tenant_id=r.tenant_id AND t.organisation_id=r.organisation_id
           WHERE r.tenant_id=$1 AND r.organisation_id=$2 AND r.${c.id}=$4
           ${baseline ? "AND NOT EXISTS(SELECT 1 FROM erp_object_data_version v WHERE v.tenant_id=$1 AND v.organisation_id=$2 AND v.object_kind=$3 AND v.object_id=$4)" : ""}`,
    values: [tenantId, organisationId, kind, id, email, baseline],
  };
}

function gridProjectionStatements({ tenantId, organisationId, kind, id, schema, data }) {
  const values = [tenantId, organisationId, kind, id];
  const rows = [];
  for (const [key, field] of Object.entries(schema?.properties || {})) if (field.type === "grid") {
    (data[key] || []).forEach((row, index) => rows.push({ field_key: key, row_index: index + 1, row_data: row, grid_schema_json: field }));
  }
  return [
    { text: "DELETE FROM erp_schema_grid_row WHERE tenant_id=$1 AND organisation_id=$2 AND object_kind=$3 AND object_id=$4", values },
    { text: `INSERT INTO erp_schema_grid_row(tenant_id,organisation_id,object_kind,object_id,field_key,row_index,row_data,grid_schema_json)
             SELECT $1,$2,$3,$4,p.field_key,p.row_index,p.row_data,p.grid_schema_json FROM jsonb_to_recordset($5::jsonb) AS p(field_key text,row_index integer,row_data jsonb,grid_schema_json jsonb)`, values: [...values, JSON.stringify(rows)] },
  ];
}

function objectSaveStatements({ statements, submittedId, access, organisationId, kind, id, schema, data }) {
  const options = { tenantId: access.tenantId, organisationId, kind, id, email: access.auth.email, schema, data };
  return [
    ...(submittedId ? [versionStatement({ ...options, baseline: true })] : []),
    ...statements,
    ...gridProjectionStatements(options),
    versionStatement(options),
  ];
}
module.exports = { objectSaveStatements, versionStatement, gridProjectionStatements };
