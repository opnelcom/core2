'use strict';
// Fiscal examples are explicit template configuration, never a rolling runtime date.
async function seedFiscalYearDefaults(ctx,access,organisationId,defaults){
 const statements=(defaults.fiscalYearSeeds||[]).map(seed=>({
  text:`WITH inserted AS (
    INSERT INTO erp_fiscal_year(tenant_id,organisation_id,fiscal_year_code,start_date,end_date,status)
    SELECT $1,o.organisation_id,$3,$4::date,$5::date,'open' FROM erp_organisation o
    WHERE o.tenant_id=$1 AND o.organisation_id=$2 AND o.is_template=true AND o.workflow_status<>'deleted'
      AND NOT EXISTS(SELECT 1 FROM erp_fiscal_year y WHERE y.tenant_id=$1 AND y.organisation_id=$2
        AND y.fiscal_year_code<>$3 AND y.start_date<=$5::date AND y.end_date>=$4::date)
    ON CONFLICT(tenant_id,organisation_id,fiscal_year_code) DO UPDATE SET start_date=excluded.start_date,end_date=excluded.end_date,status=excluded.status RETURNING *
  ), periods AS (
    INSERT INTO erp_fiscal_period(tenant_id,organisation_id,fiscal_year_id,period_number,period_code,start_date,end_date,status)
    SELECT tenant_id,organisation_id,fiscal_year_id,n,concat(fiscal_year_code,'-',lpad(n::text,2,'0')),
      (start_date+((n-1)||' months')::interval)::date,
      LEAST(end_date,(start_date+(n||' months')::interval)::date-1),'open'
    FROM inserted CROSS JOIN generate_series(1,12) n
    ON CONFLICT(tenant_id,organisation_id,fiscal_year_id,period_number) DO UPDATE SET period_code=excluded.period_code,start_date=excluded.start_date,end_date=excluded.end_date,status=excluded.status RETURNING fiscal_period_id
  ) SELECT (SELECT count(*) FROM inserted)::integer AS years_inserted,
    (SELECT count(*) FROM periods)::integer AS periods_inserted`,
  values:[access.tenantId,organisationId,seed.fiscal_year_code,seed.start_date,seed.end_date]
 }));
 if(!statements.length)return {years_inserted:0,periods_inserted:0};
 const result=await ctx.broker('core_erp','transaction',{statements});
 if(ctx.planning)return {years_inserted:0,periods_inserted:0};
 return result.results.reduce((total,r)=>({years_inserted:total.years_inserted+Number(r.rows[0].years_inserted),periods_inserted:total.periods_inserted+Number(r.rows[0].periods_inserted)}),{years_inserted:0,periods_inserted:0});
}
module.exports={seedFiscalYearDefaults};
