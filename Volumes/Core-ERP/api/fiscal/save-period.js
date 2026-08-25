'use strict';
const {authTenant,requireAdmin,clean,nullable}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);
  const id=nullable(ctx.body.fiscal_period_id);
  const orgId=ctx.body.organisation_id;
  const yearId=ctx.body.fiscal_year_id;
  const number=Number.parseInt(ctx.body.period_number,10);
  const start=clean(ctx.body.start_date);
  const end=clean(ctx.body.end_date);
  if(!orgId||!yearId||!Number.isFinite(number)||number<1||!start||!end){
    return ctx.send(400,{error:'Organisation, fiscal year, period number, start date and end date are required'});
  }
  const year=await ctx.broker('core_erp','query',{
    text:`SELECT fiscal_year_code FROM erp_fiscal_year WHERE tenant_id=$1 AND organisation_id=$2 AND fiscal_year_id=$3`,
    values:[access.tenantId,orgId,yearId]
  });
  if(!year.rowCount)return ctx.send(404,{error:'Fiscal year not found'});
  const periodCode=clean(ctx.body.period_code,`${year.rows[0].fiscal_year_code}-${String(number).padStart(2,'0')}`);
  const status=clean(ctx.body.status,'open');
  const r=id
    ? await ctx.broker('core_erp','query',{
      text:`UPDATE erp_fiscal_period
            SET period_number=$4,period_code=$5,start_date=$6,end_date=$7,status=$8,updated_at=now()
            WHERE tenant_id=$1 AND organisation_id=$2 AND fiscal_period_id=$3
            RETURNING *`,
      values:[access.tenantId,orgId,id,number,periodCode,start,end,status]
    })
    : await ctx.broker('core_erp','query',{
      text:`INSERT INTO erp_fiscal_period(tenant_id,organisation_id,fiscal_year_id,period_number,period_code,start_date,end_date,status)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT(tenant_id,organisation_id,fiscal_year_id,period_number) DO UPDATE
            SET period_code=excluded.period_code,start_date=excluded.start_date,end_date=excluded.end_date,status=excluded.status,updated_at=now()
            RETURNING *`,
      values:[access.tenantId,orgId,yearId,number,periodCode,start,end,status]
    });
  if(!r.rowCount)return ctx.send(404,{error:'Fiscal period not found'});
  return {fiscal_period:r.rows[0]};
};
