'use strict';
// Existing business tests explicitly grant their fixture identities access to
// their fixture divisions. Access-rule tests construct narrower assignments.
function grantUserAccess(db,{tenantId,organisationId,email}) {
  db.exec(`CREATE TABLE IF NOT EXISTS erp_organisation_user(user_id PRIMARY KEY,tenant_id,organisation_id,email,is_enabled,valid_from,valid_to);
    CREATE TABLE IF NOT EXISTS erp_user_division(user_id,tenant_id,organisation_id,division_id,valid_from,valid_to,UNIQUE(user_id,division_id));`);
  const userId=`${tenantId}:${organisationId}:${email.toLowerCase()}`;
  db.prepare('INSERT OR IGNORE INTO erp_organisation_user VALUES(?,?,?,?,true,NULL,NULL)').run(userId,tenantId,organisationId,email.toLowerCase());
  db.prepare('INSERT OR IGNORE INTO erp_user_division SELECT ?,tenant_id,organisation_id,division_id,NULL,NULL FROM erp_division WHERE tenant_id=? AND organisation_id=?').run(userId,tenantId,organisationId);
}
module.exports={grantUserAccess};
