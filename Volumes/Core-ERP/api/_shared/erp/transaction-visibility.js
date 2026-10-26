'use strict';
const {userDivisionAccessSql}=require('./user-access');

// SQL expressions are supplied by the calling query, never by request input.
// Reports use the same administrator, wildcard, status and division rules as
// transaction access; approval alone does not grant report access.
function transactionVisibilitySql({tenant,organisation,division,transactionType,status,email,administrator}){
  return `(${userDivisionAccessSql({tenant,organisation,email,division})} AND (${administrator}::boolean OR EXISTS (
    WITH RECURSIVE ancestors AS (
      SELECT division_id,parent_division_id,0 depth
      FROM erp_division
      WHERE tenant_id=${tenant} AND organisation_id=${organisation} AND division_id=${division}
      UNION ALL
      SELECT parent.division_id,parent.parent_division_id,child.depth+1
      FROM erp_division parent
      JOIN ancestors child ON child.parent_division_id=parent.division_id
      WHERE parent.tenant_id=${tenant} AND parent.organisation_id=${organisation}
    )
    SELECT 1
    FROM erp_user_role ur
    JOIN erp_role role ON role.role_id=ur.role_id
    JOIN erp_role_permission rp ON rp.role_id=role.role_id
    JOIN ancestors scope ON scope.division_id=rp.division_id
    WHERE ur.tenant_id=${tenant} AND ur.organisation_id=${organisation} AND lower(ur.email)=lower(${email})
      AND role.is_active=true
      AND ur.valid_from<=CURRENT_DATE AND (ur.valid_to IS NULL OR ur.valid_to>=CURRENT_DATE)
      AND rp.valid_from<=CURRENT_DATE AND (rp.valid_to IS NULL OR rp.valid_to>=CURRENT_DATE)
      AND (scope.depth=0 OR rp.applies_to_children=true)
      AND rp.resource_kind='transaction'
      AND (rp.workflow_status IN('view','*') OR rp.workflow_status=${status})
      AND (rp.resource_code=${transactionType}::text OR rp.resource_code='*')
  )))`;
}

module.exports={transactionVisibilitySql};
