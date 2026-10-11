'use strict';
const {authTenant,isAdministrator,hasResourcePermission}=require('../_shared/erp');
const {uuid,reportTableReady}=require('../_shared/erp/report-definitions');
module.exports=async ctx=>{
 const access=await authTenant(ctx);if(access.status)return ctx.send(access.status,access.body);
 try{
  const org=uuid(ctx.query.organisation_id,'Organisation');
  const setup=ctx.query.setup==='1';if(setup&&!isAdministrator(access))return ctx.send(403,{error:'Administrator access required'});
  if(!await reportTableReady(ctx))return {reports:[],schema_required:true};
  const result=await ctx.broker('core_erp','query',{text:`SELECT erp_report.*, ARRAY(SELECT module_id FROM erp_report_module WHERE report_id=erp_report.report_id) AS module_ids FROM erp_report WHERE tenant_id=$1 AND organisation_id=$2 ${setup?'':'AND is_active=true'} ORDER BY report_name`,values:[access.tenantId,org]});
  if(setup)return {reports:result.rows};
  const division=ctx.query.division_id;if(!division)return {reports:[]};uuid(division,'Division');
  const valid=await ctx.broker('core_erp','query',{text:"SELECT division_id FROM erp_division WHERE tenant_id=$1 AND organisation_id=$2 AND division_id=$3 AND workflow_status<>'deleted'",values:[access.tenantId,org,division]});if(!valid.rows.length)return ctx.send(404,{error:'Division is unavailable'});
  const reports=[];
  for(const row of result.rows)if(await hasResourcePermission(ctx,access,{organisationId:org,divisionId:division,resourceKind:'report',resourceCode:row.report_id,workflowStatus:'view'}))reports.push({report_id:row.report_id,report_code:row.report_code,report_name:row.report_name,description:row.description,parameters:row.definition_json.parameters||[],module_ids:row.module_ids,definition_version:row.definition_version});
  return {reports};
 }catch(e){if(e.status)return ctx.send(e.status,{error:e.message});throw e;}
};
