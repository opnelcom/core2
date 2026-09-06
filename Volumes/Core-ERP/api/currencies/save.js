'use strict';
const {authTenant,requireAdmin,clean}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);
  const orgId=ctx.body.organisation_id;
  const code=clean(ctx.body.currency_code).toUpperCase();
  const name=clean(ctx.body.currency_name);
  const decimals=Number.parseInt(ctx.body.decimal_places,10);
  if(!orgId||!code||!name)return ctx.send(400,{error:'Organisation, currency code and name are required'});
  const decimalPlaces=Number.isFinite(decimals)?decimals:2;
  const r=await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_currency(tenant_id,organisation_id,currency_code,currency_name,decimal_places,is_active,is_seeded)
          VALUES($1,$2,$3,$4,$5,true,false)
          ON CONFLICT(tenant_id,organisation_id,currency_code) DO UPDATE
          SET currency_name=excluded.currency_name,
              decimal_places=excluded.decimal_places,
              is_active=true,
              updated_at=now()
          RETURNING *`,
    values:[access.tenantId,orgId,code,name,decimalPlaces]
  });
  return {currency:r.rows[0]};
};
