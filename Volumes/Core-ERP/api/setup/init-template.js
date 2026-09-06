'use strict';
const {authTenant,requireAdmin,seedOrganisationDefaults}=require('../_shared/erp');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);

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
      `DELETE FROM erp_posting_rule WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_financial_statement_format WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_user_role WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_role_permission WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_role WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_master_data_record WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_master_data_type WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_ledger_account WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_legal_entity_relationship WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_legal_entity_address WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_legal_entity_identification WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_legal_entity WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_ledger_account_type WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_transaction_type WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_transaction_group WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_fiscal_period WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_fiscal_year WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_division WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_country WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_currency WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_tax_rate WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_tax_type WHERE tenant_id=$1 AND organisation_id=$2`,
      `DELETE FROM erp_ledger_family WHERE tenant_id=$1 AND organisation_id=$2`,
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
  return {ok:true,organisation:org.rows[0]};
};
