'use strict';
const {catalogue,validateDefinition}=require('./report-definitions');
// Reset JSON-defined report configuration only in template organisations.
async function seedReportDefaults(ctx,access,organisationId,defaults){
 const org=await ctx.broker('core_erp','query',{text:"SELECT organisation_id FROM erp_organisation WHERE tenant_id=$1 AND organisation_id=$2 AND is_template=true AND workflow_status<>'deleted'",values:[access.tenantId,organisationId]});
 if(!org.rows.length)return {inserted:0,skipped:[]};
 const datasets=await catalogue(ctx,access,organisationId),statements=[],skipped=[];
 const modules=await ctx.broker('core_erp','query',{text:'SELECT module_code FROM erp_module WHERE tenant_id=$1 AND organisation_id=$2 AND is_active=true',values:[access.tenantId,organisationId]});
 const available=new Set(modules.rows.map(m=>m.module_code));
 for(const seed of defaults.reportSeeds||[]){
  try{validateDefinition(seed.definition_json,datasets);}catch(e){if(!e.status)throw e;skipped.push({report_code:seed.report_code,reason:e.message});continue;}
  const codes=seed.module_codes||[];
  const missing=codes.filter(code=>!available.has(code));
  if(!codes.length||missing.length){skipped.push({report_code:seed.report_code,reason:missing.length?`Unavailable modules: ${missing.join(', ')}`:'No seeded module allocation'});continue;}
  statements.push({text:`INSERT INTO erp_report(tenant_id,organisation_id,report_code,report_name,description,definition_json,is_active,created_by_email,updated_by_email)
    SELECT $1,organisation_id,$3,$4,$5,$6::jsonb,true,$7,$7 FROM erp_organisation WHERE tenant_id=$1 AND organisation_id=$2 AND is_template=true AND workflow_status<>'deleted'
    ON CONFLICT(tenant_id,organisation_id,report_code) DO UPDATE SET report_name=excluded.report_name,description=excluded.description,definition_json=excluded.definition_json,is_active=true,updated_by_email=excluded.updated_by_email,updated_at=now() RETURNING report_id`,values:[access.tenantId,organisationId,seed.report_code,seed.report_name,seed.description,JSON.stringify(seed.definition_json),access.auth.email]});
  statements.push({text:`DELETE FROM erp_report_module m USING erp_report r WHERE m.report_id=r.report_id AND r.tenant_id=$1 AND r.organisation_id=$2 AND r.report_code=$3`,values:[access.tenantId,organisationId,seed.report_code]});
  statements.push({text:`INSERT INTO erp_report_module(report_id,module_id)
    SELECT r.report_id,m.module_id FROM erp_report r
    JOIN erp_organisation o ON o.organisation_id=r.organisation_id AND o.tenant_id=r.tenant_id AND o.is_template=true AND o.workflow_status<>'deleted'
    JOIN erp_module m ON m.tenant_id=r.tenant_id AND m.organisation_id=r.organisation_id AND m.module_code=ANY($4::text[]) AND m.is_active=true
    WHERE r.tenant_id=$1 AND r.organisation_id=$2 AND r.report_code=$3 AND r.definition_json=$5::jsonb
      AND NOT EXISTS(SELECT 1 FROM erp_report_module existing WHERE existing.report_id=r.report_id)
    ON CONFLICT DO NOTHING RETURNING report_id`,values:[access.tenantId,organisationId,seed.report_code,codes,JSON.stringify(seed.definition_json)]});
 }
 if(!statements.length)return {inserted:0,skipped};
 const result=await ctx.broker('core_erp','transaction',{statements});
 return {inserted:result.results.filter((r,i)=>i%3===0).reduce((n,r)=>n+(r.rowCount||0),0),skipped};
}
module.exports={seedReportDefaults};
