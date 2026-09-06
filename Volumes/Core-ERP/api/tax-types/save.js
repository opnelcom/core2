'use strict';
const {authTenant,requireAdmin,clean,nullable,bool}=require('../_shared/erp');

function normalCode(value){
  return clean(value).toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
}

function taxDirection(value){
  const direction=clean(value,'none').toLowerCase();
  return ['output','input','none'].includes(direction)?direction:'none';
}

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);
  const id=nullable(ctx.body.tax_type_id);
  const orgId=ctx.body.organisation_id;
  const code=normalCode(ctx.body.tax_type_code);
  const description=clean(ctx.body.tax_type_description);
  const direction=taxDirection(ctx.body.tax_direction);
  const rates=Array.isArray(ctx.body.rates)?ctx.body.rates:[];
  if(!orgId||!code||!description)return ctx.send(400,{error:'Organisation, code and description are required'});

  const seenStarts=new Set();
  for(const rate of rates){
    rate.tax_rate_id=nullable(rate.tax_rate_id);
    rate.tax_rate=Number.parseFloat(rate.tax_rate);
    rate.valid_from=clean(rate.valid_from);
    rate.valid_to=nullable(rate.valid_to);
    rate.is_active=bool(rate.is_active);
    if(!Number.isFinite(rate.tax_rate)||rate.tax_rate<0||!rate.valid_from){
      return ctx.send(400,{error:'Every tax rate needs a non-negative rate and valid from date'});
    }
    if(seenStarts.has(rate.valid_from))return ctx.send(400,{error:`Duplicate rate start date ${rate.valid_from}`});
    seenStarts.add(rate.valid_from);
  }

  const saved=id
    ? await ctx.broker('core_erp','query',{
      text:`UPDATE erp_tax_type
            SET tax_type_code=$3,tax_type_description=$4,tax_direction=$5,is_active=$6,updated_at=now()
            WHERE tenant_id=$1 AND organisation_id=$2 AND tax_type_id=$7
            RETURNING *`,
      values:[access.tenantId,orgId,code,description,direction,bool(ctx.body.is_active),id]
    })
    : await ctx.broker('core_erp','query',{
      text:`INSERT INTO erp_tax_type(tenant_id,organisation_id,tax_type_code,tax_type_description,tax_direction,is_active,is_seeded)
            VALUES($1,$2,$3,$4,$5,$6,false)
            ON CONFLICT(tenant_id,organisation_id,tax_type_code) DO UPDATE
            SET tax_type_description=excluded.tax_type_description,
                tax_direction=excluded.tax_direction,
                is_active=excluded.is_active,
                updated_at=now()
            RETURNING *`,
      values:[access.tenantId,orgId,code,description,direction,bool(ctx.body.is_active)]
    });
  if(!saved.rowCount)return ctx.send(404,{error:'Tax type not found'});
  const taxType=saved.rows[0];

  for(const rate of rates){
    if(rate.tax_rate_id){
      const updated=await ctx.broker('core_erp','query',{
        text:`UPDATE erp_tax_rate
              SET tax_rate=$4,valid_from=$5,valid_to=$6,is_active=$7,updated_at=now()
              WHERE tenant_id=$1 AND organisation_id=$2 AND tax_type_id=$3 AND tax_rate_id=$8
              RETURNING tax_rate_id`,
        values:[access.tenantId,orgId,taxType.tax_type_id,rate.tax_rate,rate.valid_from,rate.valid_to,rate.is_active,rate.tax_rate_id]
      });
      if(!updated.rowCount)return ctx.send(404,{error:'Tax rate not found'});
    }else{
      await ctx.broker('core_erp','query',{
        text:`INSERT INTO erp_tax_rate(tenant_id,organisation_id,tax_type_id,tax_rate,valid_from,valid_to,is_active,is_seeded)
              VALUES($1,$2,$3,$4,$5,$6,$7,false)
              ON CONFLICT(tax_type_id,valid_from) DO UPDATE
              SET tax_rate=excluded.tax_rate,
                  valid_to=excluded.valid_to,
                  is_active=excluded.is_active,
                  updated_at=now()`,
        values:[access.tenantId,orgId,taxType.tax_type_id,rate.tax_rate,rate.valid_from,rate.valid_to,rate.is_active]
      });
    }
  }

  return {tax_type:taxType};
};
