'use strict';
const fs=require('fs');
const path=require('path');
delete require.cache[require.resolve('../_shared/erp')];
const {authTenant}=require('../_shared/erp');

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
