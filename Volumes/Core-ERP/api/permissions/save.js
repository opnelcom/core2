"use strict";
const {
  authTenant,
  requireAdmin,
  clean,
  nullable,
  bool,
} = require("../_shared/erp");

const {randomUUID}=require('node:crypto');
const {createTransactionPlan}=require('../_shared/erp/transaction-plan');
const {validateRoleUsers}=require('../_shared/erp/user-assignments');

function roleCodeFromName(value) {
  return (
    clean(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "role"
  );
}

module.exports = async (ctx) => {
  if (ctx.req.method !== "POST")
    return ctx.send(405, { error: "POST required" });
  const access = await authTenant(ctx);
  if (access.status) return ctx.send(access.status, access.body);
  const denied = requireAdmin(access);
  if (denied) return ctx.send(denied.status, denied.body);

  const orgId = ctx.body.organisation_id;
  const id = nullable(ctx.body.role_id);
  const name = clean(ctx.body.role_name);
  const description = clean(ctx.body.role_description);
  const isAdmin = bool(ctx.body.is_admin);
  const isActive =
    ctx.body.is_active !== false && ctx.body.is_active !== "false";
  const masterPermissions = Array.isArray(ctx.body.master_permissions)
    ? ctx.body.master_permissions
    : [];
  const transactionPermissions = Array.isArray(ctx.body.transaction_permissions)
    ? ctx.body.transaction_permissions
    : [];
  const requestedRoleUsers = Array.isArray(ctx.body.role_users)
    ? ctx.body.role_users
    : [];
  if (!orgId || !name)
    return ctx.send(400, {
      error: "organisation_id and role name are required",
    });
  const plan=createTransactionPlan(ctx,['erp_role','erp_role_permission','erp_user_role','erp_organisation_user']);
  const client=plan.client;
  let roleUsers;
  try {roleUsers=await validateRoleUsers(client,{tenantId:access.tenantId,organisationId:orgId,roleId:id,rows:requestedRoleUsers});}
  catch(error){if(error.status)return ctx.send(error.status,{error:error.message});throw error;}
  const reportPermissions = Array.isArray(ctx.body.report_permissions) ? ctx.body.report_permissions : [];
  if (ctx.body.report_permissions !== undefined && !Array.isArray(ctx.body.report_permissions))
    return ctx.send(400,{error:"Report permissions must be a list"});
  if (reportPermissions.length) {
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (reportPermissions.some(row => !UUID.test(row.resource_code || "") || !UUID.test(row.division_id || "") || row.workflow_status !== "view"))
      return ctx.send(400, {error:"Report grants require a report, a division and View access"});
    const reportIds = [...new Set(reportPermissions.map(row => row.resource_code))];
    const divisionIds = [...new Set(reportPermissions.map(row => row.division_id))];
    const reports = await client.query("SELECT report_id FROM erp_report WHERE tenant_id=$1 AND organisation_id=$2 AND report_id=ANY($3::uuid[])",[access.tenantId,orgId,reportIds]);
    const divisions = await client.query("SELECT division_id FROM erp_division WHERE tenant_id=$1 AND organisation_id=$2 AND division_id=ANY($3::uuid[]) AND workflow_status<>'deleted'",[access.tenantId,orgId,divisionIds]);
    if(reports.rows.length!==reportIds.length||divisions.rows.length!==divisionIds.length)
      return ctx.send(400,{error:"Report grants must belong to this organisation and use available divisions"});
  }
  const roleCode = id ? null : roleCodeFromName(name);
  const existing=await client.query(`SELECT * FROM erp_role WHERE tenant_id=$1 AND organisation_id=$2 AND ${id?'role_id=$3::uuid':'role_code=$3'}`,[access.tenantId,orgId,id||roleCode]);
  if(id&&!existing.rows.length)return ctx.send(404,{error:'Role was not found'});
  const roleId=existing.rows[0]?.role_id||randomUUID();
  await client.query("SELECT * FROM erp_user_role WHERE tenant_id=$1 AND organisation_id=$2 AND role_id=$3",[access.tenantId,orgId,roleId]);
  plan.write({text:`INSERT INTO erp_role(role_id,tenant_id,organisation_id,role_code,role_name,role_description,is_admin,is_active)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(role_id) DO UPDATE SET role_name=excluded.role_name,
      role_description=excluded.role_description,is_admin=excluded.is_admin,is_active=excluded.is_active,updated_at=now()`,
    values:[roleId,access.tenantId,orgId,existing.rows[0]?.role_code||roleCode,name,description,isAdmin,isActive]});

  const statements = [
    {
      text: `DELETE FROM erp_role_permission WHERE tenant_id=$1 AND organisation_id=$2 AND role_id=$3`,
      values: [access.tenantId, orgId, roleId],
    },
    {
      text: `DELETE FROM erp_user_role WHERE tenant_id=$1 AND organisation_id=$2 AND role_id=$3`,
      values: [access.tenantId, orgId, roleId],
    },
  ];
  const addPermission = (kind, row) => {
    const divisionId = nullable(row.division_id);
    const resourceCode = clean(
      row.resource_code || row.transaction_type_id,
      "*",
    );
    const workflow = clean(row.workflow_status, "*");
    const organisationScoped =
      kind === "gl_account" ||
      kind === "legal_entity" ||
      kind === "resource";
    if ((!organisationScoped && !divisionId) || !resourceCode) return;
    statements.push({
      text: `INSERT INTO erp_role_permission(tenant_id,organisation_id,role_id,division_id,resource_kind,resource_code,workflow_status,action_code,applies_to_children)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      values: [
        access.tenantId,
        orgId,
        roleId,
        organisationScoped ? null : divisionId,
        kind,
        resourceCode,
        workflow,
        workflow === "view" ? "view" : "manage",
        row.applies_to_children !== false,
      ],
    });
  };
  const masterKinds = new Set([
    "gl_account",
    "legal_entity",
    "subledger_account",
    "accounting_object",
    "accounting_dimension",
    "resource",
  ]);
  masterPermissions.forEach((row) => {
    const kind = clean(row.resource_kind);
    if (masterKinds.has(kind)) addPermission(kind, row);
  });
  transactionPermissions.forEach((row) => addPermission("transaction", row));
  reportPermissions.forEach(row => addPermission("report", row));
  roleUsers.forEach((row) => {
    const email = clean(row.email).toLowerCase();
    const validFrom = nullable(row.valid_from);
    const validTo = nullable(row.valid_to);
    if (!email) return;
    statements.push({
      text: `INSERT INTO erp_user_role(tenant_id,organisation_id,role_id,email,valid_from,valid_to)
            VALUES($1,$2,$3,$4,COALESCE($5::date,CURRENT_DATE),$6::date)
            ON CONFLICT(tenant_id,organisation_id,role_id,email) DO UPDATE
            SET valid_from=excluded.valid_from,valid_to=excluded.valid_to`,
      values: [access.tenantId, orgId, roleId, email, validFrom, validTo],
    });
  });

  statements.forEach(statement=>plan.write(statement));
  await plan.commit();
  return {ok:true,role:{role_id:roleId,role_name:name}};
};

module.exports=require("../_shared/context").withContext(module.exports);
