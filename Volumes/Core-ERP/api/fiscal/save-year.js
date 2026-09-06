'use strict';
const {authTenant,requireAdmin,clean,nullable}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);
  const orgId=ctx.body.organisation_id;
  const id=nullable(ctx.body.fiscal_year_id);
  const code=clean(ctx.body.fiscal_year_code);
  const start=clean(ctx.body.start_date);
  const end=clean(ctx.body.end_date);
  if(!orgId||!code||!start||!end)return ctx.send(400,{error:'Organisation, code, start and end dates are required'});
  const r=id
    ? await ctx.broker('core_erp','query',{
      text:`UPDATE erp_fiscal_year
            SET fiscal_year_code=$3,start_date=$4,end_date=$5,status=$6,updated_at=now()
            WHERE tenant_id=$1 AND organisation_id=$2 AND fiscal_year_id=$7
            RETURNING *`,
      values:[access.tenantId,orgId,code,start,end,clean(ctx.body.status,'open'),id]
    })
    : await ctx.broker('core_erp','query',{
      text:`INSERT INTO erp_fiscal_year(tenant_id,organisation_id,fiscal_year_code,start_date,end_date,status)
            VALUES($1,$2,$3,$4,$5,$6)
            ON CONFLICT(tenant_id,organisation_id,fiscal_year_code) DO UPDATE
            SET start_date=excluded.start_date,end_date=excluded.end_date,updated_at=now()
            RETURNING *`,
      values:[access.tenantId,orgId,code,start,end,clean(ctx.body.status,'open')]
    });
  if(!r.rowCount)return ctx.send(404,{error:'Fiscal year not found'});
  if(ctx.body.create_periods){
    await ctx.broker('core_erp','query',{
      text:`INSERT INTO erp_fiscal_period(tenant_id,organisation_id,fiscal_year_id,period_number,period_code,start_date,end_date,status)
            SELECT $1,$2,$3,n,concat($4::text,'-',lpad(n::text,2,'0')),
                   ($5::date + ((n-1)||' months')::interval)::date,
                   (($5::date + (n||' months')::interval)::date - 1),
                   'open'
            FROM generate_series(1,12) n
            ON CONFLICT DO NOTHING`,
      values:[access.tenantId,orgId,r.rows[0].fiscal_year_id,code,start]
    });
  }
  return {fiscal_year:r.rows[0]};
};
