'use strict';
// All expressions are trusted SQL supplied by application services.
function divisionScopeSql({tenant,organisation,selected,children,record}){
  return `(${selected}::uuid IS NULL OR EXISTS (
    WITH RECURSIVE selected_divisions AS (
      SELECT division_id FROM erp_division WHERE tenant_id=${tenant} AND organisation_id=${organisation} AND division_id=${selected}::uuid
      UNION
      SELECT child.division_id FROM erp_division child JOIN selected_divisions parent ON child.parent_division_id=parent.division_id
      WHERE child.tenant_id=${tenant} AND child.organisation_id=${organisation} AND ${children}::boolean
    ) SELECT 1 FROM selected_divisions WHERE division_id=${record}
  ))`;
}
function postedLineScopeSql({tenant,organisation,asOf,selected,children}){
  return `l.tenant_id=${tenant} AND l.organisation_id=${organisation}
    AND j.posted_at IS NOT NULL AND j.journal_date<=${asOf}::date
    AND ${divisionScopeSql({tenant,organisation,selected,children,record:'l.division_id'})}`;
}
module.exports={divisionScopeSql,postedLineScopeSql};
