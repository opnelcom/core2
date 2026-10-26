'use strict';
const {userDivisionAccessSql}=require('./user-access');
const {accessibleModulesSql}=require('./permission-modules');

// Trusted application definitions only: identifiers never come from a request.
const sources = [
  ['subledger_account','erp_subledger_account','erp_subledger_account_type','subledger_account_type_id','owner_division_id'],
  ['accounting_object','erp_accounting_object','erp_accounting_object_type','accounting_object_type_id','owner_division_id'],
  ['accounting_dimension','erp_accounting_dimension','erp_accounting_dimension_type','accounting_dimension_type_id','owner_division_id'],
  ['transaction','erp_journal','erp_transaction_type','transaction_type_id','source_division_id'],
];

function dashboardSql() {
  const records = sources.map(([kind,table,typeTable,typeId,division]) => `
    SELECT '${kind}' kind,record.${kind==='transaction'?'journal_id':kind+'_id'} record_id,
           record.${typeId} type_id,type.type_name,record.${division} division_id,
           record.workflow_status,status.status_label,link.module_id,
           ${kind==='transaction'?'record.created_by_email':'NULL::text'} created_by_email,
           ${kind==='transaction'?`COALESCE((SELECT sum(line.debit_amount) FROM erp_journal_line line
             WHERE line.tenant_id=record.tenant_id AND line.organisation_id=record.organisation_id
               AND line.journal_id=record.journal_id),0)`:'NULL::numeric'} debit_total
    FROM ${table} record
    JOIN ${typeTable} type ON type.${typeId}=record.${typeId}
      AND type.tenant_id=record.tenant_id AND type.organisation_id=record.organisation_id AND type.is_active=true
    JOIN ${typeTable}_module link ON link.${typeId}=type.${typeId}
    JOIN accessible_modules module ON module.module_id=link.module_id
    JOIN erp_workflow_path_status member ON member.tenant_id=record.tenant_id
      AND member.organisation_id=record.organisation_id AND member.workflow_path_id=type.workflow_path_id
      AND member.step_code=record.workflow_status
    JOIN erp_workflow_status status ON status.tenant_id=record.tenant_id
      AND status.organisation_id=record.organisation_id AND status.status_code=record.workflow_status AND status.transitional=true
    WHERE record.tenant_id=$1 AND record.organisation_id=$2
          AND ${userDivisionAccessSql({tenant:'$1',organisation:'$2',email:'$3',division:'record.'+division})}
  `).join(' UNION ALL ');
  return `WITH RECURSIVE accessible_modules AS (
    ${accessibleModulesSql()}
  ), selected_scope AS (
    SELECT division_id FROM erp_division WHERE tenant_id=$1 AND organisation_id=$2 AND division_id=$5::uuid
    UNION
    SELECT child.division_id FROM erp_division child JOIN selected_scope parent ON child.parent_division_id=parent.division_id
      WHERE child.tenant_id=$1 AND child.organisation_id=$2 AND $6::boolean
  ), candidates AS (${records}), visible AS (
    SELECT record.* FROM candidates record
    WHERE ($5::uuid IS NULL OR record.division_id IN(SELECT division_id FROM selected_scope))
      AND ((record.kind<>'transaction' AND $4::boolean)
        OR EXISTS(
          WITH RECURSIVE ancestors AS (
            SELECT division_id,parent_division_id,0 depth FROM erp_division
              WHERE tenant_id=$1 AND organisation_id=$2 AND division_id=record.division_id
            UNION ALL
            SELECT parent.division_id,parent.parent_division_id,child.depth+1 FROM erp_division parent
              JOIN ancestors child ON child.parent_division_id=parent.division_id
              WHERE parent.tenant_id=$1 AND parent.organisation_id=$2
          )
          SELECT 1 FROM erp_user_role ur JOIN erp_role role ON role.role_id=ur.role_id
            JOIN erp_role_permission permission ON permission.role_id=role.role_id
            JOIN ancestors scope ON scope.division_id=permission.division_id
          WHERE ur.tenant_id=$1 AND ur.organisation_id=$2 AND lower(ur.email)=lower($3)
            AND role.tenant_id=$1 AND role.organisation_id=$2 AND role.is_active=true
            AND ur.valid_from<=CURRENT_DATE AND (ur.valid_to IS NULL OR ur.valid_to>=CURRENT_DATE)
            AND permission.resource_kind=record.kind
            AND (permission.resource_code=record.type_id::text OR permission.resource_code='*')
            AND (permission.workflow_status IN('view','*') OR (record.kind='transaction' AND permission.workflow_status=record.workflow_status))
            AND (record.kind='transaction' OR (
              permission.valid_from<=CURRENT_DATE AND (permission.valid_to IS NULL OR permission.valid_to>=CURRENT_DATE)
              AND (scope.depth=0 OR permission.applies_to_children=true)))
        ))
  ), grouped AS (
    SELECT module_id,kind,type_id,type_name,workflow_status,status_label,count(DISTINCT record_id)::integer record_count,
      CASE WHEN kind='transaction' THEN sum(debit_total)::text ELSE NULL END debit_total
    FROM visible GROUP BY module_id,kind,type_id,type_name,workflow_status,status_label
  )
  SELECT module.module_id,module.module_name,module.module_icon_svg,
    grouped.kind,grouped.type_id,grouped.type_name,grouped.workflow_status,grouped.status_label,grouped.record_count,grouped.debit_total,
    (SELECT count(DISTINCT (kind,record_id))::integer FROM visible) total_records
  FROM accessible_modules module LEFT JOIN grouped ON grouped.module_id=module.module_id
  ORDER BY module.sort_order,module.module_name,grouped.kind,grouped.type_name,grouped.status_label`;
}

function dashboardResult(rows) {
  const modules=new Map();
  for(const row of rows){
    if(!modules.has(row.module_id))modules.set(row.module_id,{
      module_id:row.module_id,module_name:row.module_name,module_icon_svg:row.module_icon_svg,total:0,types:[]
    });
    if(!row.type_id)continue;
    const module=modules.get(row.module_id);
    let type=module.types.find(type=>type.kind===row.kind && type.type_id===row.type_id);
    if(!type){type={kind:row.kind,type_id:row.type_id,type_name:row.type_name,total:0,statuses:[]};module.types.push(type);}
    const count=Number(row.record_count);
    const status={status_code:row.workflow_status,status_label:row.status_label,count};
    // Preserve PostgreSQL numeric precision in the response; browser formatting follows the existing currency helper.
    if(row.kind==='transaction')status.debit_total=String(row.debit_total??'0');
    type.statuses.push(status);
    type.total+=count;module.total+=count;
  }
  return {modules:[...modules.values()],total_records:Number(rows[0]?.total_records)||0};
}
module.exports={dashboardSql,dashboardResult,accessibleModulesSql};
