'use strict';

// All SQL expressions passed here are application-owned, never request values.
function organisationUserAccessSql({tenant,organisation,email}) {
  return `EXISTS(SELECT 1 FROM erp_organisation_user access_user
    WHERE access_user.tenant_id=${tenant} AND access_user.organisation_id=${organisation}
      AND access_user.email=lower(${email}) AND access_user.is_enabled=true
      AND (access_user.valid_from IS NULL OR access_user.valid_from<=CURRENT_DATE)
      AND (access_user.valid_to IS NULL OR access_user.valid_to>=CURRENT_DATE))`;
}

function userDivisionAccessSql({tenant,organisation,email,division}) {
  return `EXISTS(SELECT 1 FROM erp_organisation_user access_user
    JOIN erp_user_division access_division ON access_division.user_id=access_user.user_id
      AND access_division.tenant_id=access_user.tenant_id AND access_division.organisation_id=access_user.organisation_id
    WHERE access_user.tenant_id=${tenant} AND access_user.organisation_id=${organisation}
      AND access_user.email=lower(${email}) AND access_user.is_enabled=true
      AND (access_user.valid_from IS NULL OR access_user.valid_from<=CURRENT_DATE)
      AND (access_user.valid_to IS NULL OR access_user.valid_to>=CURRENT_DATE)
      AND access_division.division_id=${division}
      AND (access_division.valid_from IS NULL OR access_division.valid_from<=CURRENT_DATE)
      AND (access_division.valid_to IS NULL OR access_division.valid_to>=CURRENT_DATE))`;
}

async function hasUserDivisionAccess(ctx,access,organisationId,divisionId) {
  const result=await ctx.broker('core_erp','query',{
    text:`SELECT 1 WHERE ${userDivisionAccessSql({tenant:'$1',organisation:'$2',email:'$3',division:'$4::uuid'})}`,
    values:[access.tenantId,organisationId,access.auth.email,divisionId]
  });
  return !!result.rowCount;
}

module.exports={organisationUserAccessSql,userDivisionAccessSql,hasUserDivisionAccess};
