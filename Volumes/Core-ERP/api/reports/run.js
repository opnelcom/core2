'use strict';
const {authTenant}=require('../_shared/erp');
const {catalogue,compileReport,reportScope,loadReport,fail}=require('../_shared/erp/report-definitions');
const {reportXlsx}=require('../_shared/erp/report-xlsx');
module.exports=async ctx=>{
 if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
 const access=await authTenant(ctx);if(access.status)return ctx.send(access.status,access.body);
 try{
  const b=ctx.body;
  if(Object.keys(b).some(k=>!['organisation_id','division_id','report_id','include_child_divisions','parameters','offset','export'].includes(k)))fail('Unsupported report execution setting');
  if(b.include_child_divisions!==undefined&&typeof b.include_child_divisions!=='boolean')fail('Include child divisions must be boolean');
  if(b.export!==undefined&&b.export!=='xlsx')fail('Unsupported export format');
  const scope=await reportScope(ctx,access,{organisationId:b.organisation_id,divisionId:b.division_id,reportId:b.report_id,includeChildren:b.include_child_divisions===true});
  const report=await loadReport(ctx,access,b.organisation_id,b.report_id);
  const exporting=b.export==='xlsx',offset=exporting?0:(b.offset??0),pageSize=exporting?10000:100;
  const query=compileReport(report.definition_json,await catalogue(ctx,access,b.organisation_id),{tenantId:access.tenantId,organisationId:b.organisation_id,divisionIds:scope,parameters:b.parameters||{},offset,limit:pageSize+1});
  const result=await ctx.broker('core_erp','query',{text:query.text,values:query.values});
  if(exporting&&result.rows.length>pageSize)fail('Excel export exceeds 10,000 rows. Narrow the report parameters; no file was truncated.',422);
  const rows=result.rows.slice(0,pageSize),runAt=new Date().toISOString();
  const common={report_id:report.report_id,report_name:report.report_name,definition_version:report.definition_version,run_at:runAt,organisation_id:b.organisation_id,division_id:b.division_id,permitted_division_count:scope.length,columns:query.columns};
  if(exporting)return {...common,filename:`${report.report_code}.xlsx`,content_type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',data_base64:reportXlsx(query.columns,rows).toString('base64'),row_count:rows.length};
  return {...common,rows,next_offset:result.rows.length>pageSize?offset+pageSize:null};
 }catch(e){if(e.status)return ctx.send(e.status,{error:e.message});throw e;}
};

module.exports=require("../_shared/context").withContext(module.exports);
