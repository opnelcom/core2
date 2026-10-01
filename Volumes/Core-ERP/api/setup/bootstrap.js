'use strict';
const fs=require('fs');
const path=require('path');
delete require.cache[require.resolve('../_shared/erp')];
const {authTenant,canBootstrapSetup,isTenantSetupAdministrator}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const seedPath=path.join(process.env.CONTENT_ROOT||path.resolve(__dirname,'..','..'),'seeds','template-defaults.json');
  const {currencies}=JSON.parse(fs.readFileSync(seedPath,'utf8'));
  const schemaTables=await ctx.broker('core_erp','query',{
    text:`SELECT to_regclass('erp_organisation') organisation_table,
                 to_regclass('erp_user_tenant_context') tenant_context,
                 to_regclass('erp_user_organisation_context') organisation_context`
  });
  const tables=schemaTables.rows[0]||{};
  const currencyDefaults=currencies.map(([currency_code,currency_name,decimal_places,is_seeded])=>({
    currency_code,
    currency_name,
    decimal_places,
    is_seeded,
    is_active:true
  }));
  if(!tables.organisation_table){
    return {
      tenant_id:access.tenantId,
      user_id:access.auth.user_id,
      user_context:{organisation_id:null,organisations:[]},
      context_storage_available:false,
      organisations:[],
      can_bootstrap_setup:true,
      can_bootstrap_template_org:false,
      can_initialise_template_org:false,
      currencies:currencyDefaults
    };
  }
  const organisations=await ctx.broker('core_erp','query',{
    text:`SELECT * FROM erp_organisation WHERE tenant_id=$1 AND workflow_status <> 'deleted' ORDER BY is_template DESC,organisation_name`,
    values:[access.tenantId]
  });
  let userContext={organisation_id:null,organisations:[]};
  if(tables.tenant_context&&tables.organisation_context){
    const [tenantContext,organisationContexts]=await Promise.all([
      ctx.broker('core_erp','query',{
        text:`SELECT organisation_id FROM erp_user_tenant_context WHERE tenant_id=$1 AND user_id=$2`,
        values:[access.tenantId,access.auth.user_id]
      }),
      ctx.broker('core_erp','query',{
        text:`SELECT organisation_id,division_id,include_children
              FROM erp_user_organisation_context
              WHERE tenant_id=$1 AND user_id=$2`,
        values:[access.tenantId,access.auth.user_id]
      })
    ]);
    userContext={organisation_id:tenantContext.rows[0]?.organisation_id||null,organisations:organisationContexts.rows};
  }
  const canBootstrap=await canBootstrapSetup(ctx,access.tenantId);
  const canInitialiseTemplate=canBootstrap||await isTenantSetupAdministrator(ctx,{tenantId:access.tenantId,email:access.auth.email});
  return {
    tenant_id:access.tenantId,
    user_id:access.auth.user_id,
    user_context:userContext,
    context_storage_available:!!(tables.tenant_context&&tables.organisation_context),
    organisations:organisations.rows,
    can_bootstrap_setup:canBootstrap,
    can_bootstrap_template_org:canBootstrap,
    can_initialise_template_org:canInitialiseTemplate,
    currencies:currencyDefaults
  };
};
