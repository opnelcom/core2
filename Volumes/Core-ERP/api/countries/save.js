'use strict';
const {authTenant,requireAdmin,clean,nullable,bool}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);
  const orgId=ctx.body.organisation_id;
  const code=clean(ctx.body.country_code).toUpperCase();
  const alpha3=clean(ctx.body.alpha3_code).toUpperCase();
  const numeric=clean(ctx.body.numeric_code);
  const name=clean(ctx.body.country_name);
  const official=clean(ctx.body.official_name,name);
  const region=nullable(ctx.body.region);
  const subregion=nullable(ctx.body.subregion);
  const currency=nullable(ctx.body.default_currency_code)?.toUpperCase()||null;
  const calling=nullable(ctx.body.calling_code);
  const postalRequired=bool(ctx.body.postal_code_required);
  const adminLabel=nullable(ctx.body.administrative_level_label);
  if(!orgId||!code||!name)return ctx.send(400,{error:'Organisation, country code and name are required'});
  if(code.length!==2)return ctx.send(400,{error:'Country code must be ISO alpha-2 format'});
  if(alpha3&&alpha3.length!==3)return ctx.send(400,{error:'Alpha-3 code must be 3 letters'});
  if(numeric&&!/^\d{3}$/.test(numeric))return ctx.send(400,{error:'Numeric code must be 3 digits'});
  if(currency&&currency.length!==3)return ctx.send(400,{error:'Default currency must be ISO 4217 format'});
  const r=await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_country(tenant_id,organisation_id,country_code,alpha3_code,numeric_code,country_name,official_name,region,subregion,default_currency_code,calling_code,postal_code_required,administrative_level_label,is_active,is_seeded)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,false)
          ON CONFLICT(tenant_id,organisation_id,country_code) DO UPDATE
          SET alpha3_code=excluded.alpha3_code,
              numeric_code=excluded.numeric_code,
              country_name=excluded.country_name,
              official_name=excluded.official_name,
              region=excluded.region,
              subregion=excluded.subregion,
              default_currency_code=excluded.default_currency_code,
              calling_code=excluded.calling_code,
              postal_code_required=excluded.postal_code_required,
              administrative_level_label=excluded.administrative_level_label,
              is_active=true,
              updated_at=now()
          RETURNING *`,
    values:[access.tenantId,orgId,code,alpha3||null,numeric||null,name,official,region,subregion,currency,calling,postalRequired,adminLabel]
  });
  return {country:r.rows[0]};
};
