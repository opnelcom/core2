'use strict';
delete require.cache[require.resolve('../_shared/erp')];
const {authTenant}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const [organisations,currencies]=await Promise.all([
    ctx.broker('core_erp','query',{text:`SELECT * FROM erp_organisation WHERE tenant_id=$1 AND workflow_status <> 'deleted' ORDER BY is_template DESC,organisation_name`,values:[access.tenantId]}),
    ctx.broker('core_erp','query',{text:`SELECT * FROM erp_currency WHERE is_active=true ORDER BY currency_code`})
  ]);
  return {tenant_id:access.tenantId,organisations:organisations.rows,currencies:currencies.rows,tenant_role:access.role};
};
