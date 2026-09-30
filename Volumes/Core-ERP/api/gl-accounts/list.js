'use strict';
const {authTenant,isAdministrator}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  if(!orgId)return ctx.send(400,{error:'organisation_id is required'});
  const result=await ctx.broker('core_erp','query',{
    text:`SELECT account.*,type.type_code,type.type_name,
                 required_type.type_code required_subledger_type_code,
                 required_type.type_name required_subledger_type_name
          FROM erp_gl_account account
          LEFT JOIN erp_gl_account_type type ON type.gl_account_type_id=account.gl_account_type_id
          LEFT JOIN erp_subledger_account_type required_type ON required_type.subledger_account_type_id=account.required_subledger_account_type_id
          WHERE account.tenant_id=$1 AND account.organisation_id=$2 AND account.workflow_status<>'deleted'
            AND ($4::boolean OR EXISTS (
              SELECT 1 FROM erp_user_role ur
              JOIN erp_role role ON role.role_id=ur.role_id
              JOIN erp_role_permission permission ON permission.role_id=role.role_id
              WHERE ur.tenant_id=$1 AND ur.organisation_id=$2 AND lower(ur.email)=lower($3)
                AND role.is_active=true AND ur.valid_from<=CURRENT_DATE AND (ur.valid_to IS NULL OR ur.valid_to>=CURRENT_DATE)
                AND permission.resource_kind='gl_account' AND permission.division_id IS NULL
                AND permission.workflow_status IN('view','*')
                AND permission.valid_from<=CURRENT_DATE AND (permission.valid_to IS NULL OR permission.valid_to>=CURRENT_DATE)
            ))
          ORDER BY account.account_code,account.account_name`,
    values:[access.tenantId,orgId,access.auth.email,isAdministrator(access)]
  });
  return {gl_accounts:result.rows};
};
