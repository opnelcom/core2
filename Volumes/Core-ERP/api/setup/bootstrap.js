'use strict';
const fs=require('fs');
const path=require('path');
delete require.cache[require.resolve('../_shared/erp')];
const {authTenant}=require('../_shared/erp');

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

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const seedPath=path.join(process.env.CONTENT_ROOT||path.resolve(__dirname,'..','..'),'seeds','template-defaults.json');
  const {currencies}=JSON.parse(fs.readFileSync(seedPath,'utf8'));
  const organisations=await ctx.broker('core_erp','query',{
    text:`SELECT * FROM erp_organisation WHERE tenant_id=$1 AND workflow_status <> 'deleted' ORDER BY is_template DESC,organisation_name`,
    values:[access.tenantId]
  });
  return {
    tenant_id:access.tenantId,
    organisations:organisations.rows,
    can_bootstrap_template_org:await canBootstrapTemplateOrganisation(ctx,access.tenantId),
    currencies:currencies.map(([currency_code,currency_name,decimal_places,is_seeded])=>({
      currency_code,
      currency_name,
      decimal_places,
      is_seeded,
      is_active:true
    })),
    tenant_role:access.role
  };
};
