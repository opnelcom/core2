'use strict';
const {authTenant,requireAdmin,clean}=require('../_shared/erp');
const currencyFormat=require('../../public/currency-format');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);
  const orgId=ctx.body.organisation_id;
  const code=clean(ctx.body.currency_code).toUpperCase();
  const name=clean(ctx.body.currency_name);
  const decimals=Number(ctx.body.decimal_places??2);
  if(!orgId||!code||!name)return ctx.send(400,{error:'Organisation, currency code and name are required'});
  if(!/^[A-Z]{3}$/.test(code))return ctx.send(400,{error:'Currency code must contain three letters'});
  const decimalPlaces=decimals;
  if(ctx.body.format_json!==undefined&&(!ctx.body.format_json||typeof ctx.body.format_json!=='object'||Array.isArray(ctx.body.format_json)))return ctx.send(400,{error:'Currency format must be an object'});
  const {decimal_places:ignored,...format}=currencyFormat.settings({currency_code:code,format_json:ctx.body.format_json});
  const invalid=currencyFormat.validate(format,decimalPlaces);
  if(invalid)return ctx.send(400,{error:invalid});
  const r=await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_currency(tenant_id,organisation_id,currency_code,currency_name,decimal_places,format_json,is_active,is_seeded)
          VALUES($1,$2,$3,$4,$5,$6::jsonb,true,false)
          ON CONFLICT(tenant_id,organisation_id,currency_code) DO UPDATE
          SET currency_name=excluded.currency_name,
              decimal_places=excluded.decimal_places,
              format_json=excluded.format_json,
              is_active=true,
              updated_at=now()
          RETURNING *`,
    values:[access.tenantId,orgId,code,name,decimalPlaces,JSON.stringify(format)]
  });
  return {currency:r.rows[0]};
};
