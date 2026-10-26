'use strict';
const {validDate}=require('./trial-balance');
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
function dateRange(row) {
  const valid_from=row.valid_from||null,valid_to=row.valid_to||null;
  if([valid_from,valid_to].some(value=>value!==null&&(typeof value!=='string'||!validDate(value))))fail('Validity dates must be valid YYYY-MM-DD dates');
  if(valid_from&&valid_to&&valid_from>valid_to)fail('Valid to must be on or after valid from');
  return {valid_from,valid_to};
}
function assignmentRows(rows,key) {
  if(!Array.isArray(rows))fail('Assignments must be a list');
  const seen=new Set();
  return rows.map(row=>{
    if(!row||typeof row!=='object')fail('Invalid assignment');
    const value=String(row[key]||'').trim();
    if(key.endsWith('_id')&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))fail('Choose a valid role or division');
    if(!value||seen.has(value.toLowerCase()))fail('Choose each assignment once');
    seen.add(value.toLowerCase());return {[key]:value,...dateRange(row)};
  });
}
async function validateRoleUsers(client,{tenantId,organisationId,roleId,rows}) {
  const users=assignmentRows(rows,'email').map(row=>({...row,email:row.email.toLowerCase()}));
  if(!users.length)return users;
  const result=await client.query(`SELECT user_account.email,
    (user_account.is_enabled AND (user_account.valid_from IS NULL OR user_account.valid_from<=CURRENT_DATE)
      AND (user_account.valid_to IS NULL OR user_account.valid_to>=CURRENT_DATE)) is_current,
    EXISTS(SELECT 1 FROM erp_user_role existing WHERE existing.tenant_id=$1 AND existing.organisation_id=$2
      AND existing.role_id=$3::uuid AND lower(existing.email)=user_account.email) already_assigned
    FROM erp_organisation_user user_account WHERE user_account.tenant_id=$1 AND user_account.organisation_id=$2
      AND user_account.email=ANY($4::text[])`,[tenantId,organisationId,roleId,users.map(row=>row.email)]);
  if(users.some(row=>!result.rows.some(user=>user.email===row.email&&(user.is_current||user.already_assigned))))fail('Choose an active organisation user for each new role assignment');
  return users;
}
module.exports={dateRange,assignmentRows,validateRoleUsers,fail};
