'use strict';
const {authTenant,seedOrganisationDefaults}=require('../_shared/erp');

async function canBootstrapTemplateOrganisation(ctx,tenantId){
  const result=await ctx.broker('core_erp','query',{
    text:`WITH setup_roles AS (
            SELECT role_id
            FROM erp_role
            WHERE tenant_id=$1
              AND is_admin=true
              AND is_active=true
          ), setup_users AS (
            SELECT 1
            FROM erp_user_role ur
            JOIN setup_roles role ON role.role_id=ur.role_id
            WHERE ur.tenant_id=$1
              AND ur.valid_from<=CURRENT_DATE
              AND (ur.valid_to IS NULL OR ur.valid_to>=CURRENT_DATE)
            LIMIT 1
          )
          SELECT
            (SELECT count(*) FROM setup_roles) AS setup_role_count,
            EXISTS (SELECT 1 FROM setup_users) AS has_setup_user`,
    values:[tenantId]
  });
  const row=result.rows[0]||{};
  return (Number(row.setup_role_count)||0)===0||row.has_setup_user!==true;
}

async function isCurrentUserSetupAdministrator(ctx,access){
  const result=await ctx.broker('core_erp','query',{
    text:`SELECT 1
          FROM erp_user_role ur
          JOIN erp_role role ON role.role_id=ur.role_id
          WHERE ur.tenant_id=$1
            AND lower(ur.email)=lower($2)
            AND role.is_admin=true
            AND role.is_active=true
            AND ur.valid_from<=CURRENT_DATE
            AND (ur.valid_to IS NULL OR ur.valid_to>=CURRENT_DATE)
          LIMIT 1`,
    values:[access.tenantId,access.auth.email]
  });
  return !!result.rowCount;
}

async function assignCurrentUserAsSecurityAdministrator(ctx,access,organisationId){
  const result=await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_user_role(tenant_id,organisation_id,role_id,email,valid_from,valid_to)
          SELECT $1,$2,role.role_id,lower($3),CURRENT_DATE,NULL
          FROM erp_role role
          WHERE role.tenant_id=$1
            AND role.organisation_id=$2
            AND role.role_code='security_administrator'
            AND role.is_admin=true
            AND role.is_active=true
          ON CONFLICT(tenant_id,organisation_id,role_id,email) DO UPDATE
          SET valid_from=LEAST(erp_user_role.valid_from,excluded.valid_from),
              valid_to=NULL
          RETURNING *`,
    values:[access.tenantId,organisationId,access.auth.email]
  });
  if(!result.rowCount){
    throw new Error('Security Administrator role was not created during template initialisation');
  }
}

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const bootstrapAllowed=await canBootstrapTemplateOrganisation(ctx,access.tenantId);
  if(!bootstrapAllowed&&!await isCurrentUserSetupAdministrator(ctx,access)){
    return ctx.send(403,{error:'Setup Administrator access is required to re-initialise the template organisation'});
  }

  const existing=await ctx.broker('core_erp','query',{
    text:`SELECT organisation_id
          FROM erp_organisation
          WHERE tenant_id=$1 AND organisation_code='TEMPLATE'
          ORDER BY created_at
          LIMIT 1`,
    values:[access.tenantId]
  });
  const existingId=existing.rows[0]?.organisation_id;
  if(existingId){
    const statements=[
      `DELETE FROM erp_journal_line WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_journal WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_transaction_line_definition WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_financial_statement_format WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_user_role WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_role_permission WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_role WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_workflow_history WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_accounting_dimension WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_accounting_object WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_subledger_account WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_gl_account WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_accounting_dimension_type WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_accounting_object_type WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_subledger_account_type WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_gl_account_type WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_legal_entity_relationship WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_legal_entity_address WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_legal_entity_identification WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_legal_entity WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_transaction_type WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_transaction_group WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_fiscal_period WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_fiscal_year WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_division WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_country WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_currency WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_tax_rate WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_tax_type WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_workflow_next WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_workflow_step WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_workflow_path WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_organisation WHERE tenant_id=$1 AND organisation_id=$2`
    ];
    await ctx.broker('core_erp','transaction',{
      statements:statements.map(text=>({text,values:[access.tenantId,existingId]}))
    });
  }

  const org=await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_organisation(tenant_id,organisation_code,organisation_name,is_template,base_currency_code,workflow_status,created_by_email,updated_by_email,approved_by_email,approved_at)
          VALUES($1,'TEMPLATE','Template Organisation',true,'ZAR','approved',$2,$2,$2,now())
          RETURNING *`,
    values:[access.tenantId,access.auth.email]
  });
  const orgId=org.rows[0].organisation_id;
  await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_division(tenant_id,organisation_id,parent_division_id,division_code,division_name,workflow_status,created_by_email,updated_by_email)
          VALUES($1,$2,NULL,'ROOT','Template Organisation','approved',$3,$3)`,
    values:[access.tenantId,orgId,access.auth.email]
  });
  await seedOrganisationDefaults(ctx,access,orgId);
  await assignCurrentUserAsSecurityAdministrator(ctx,access,orgId);
  return {ok:true,organisation:org.rows[0]};
};
