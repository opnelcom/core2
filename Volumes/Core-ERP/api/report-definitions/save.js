'use strict';
const {authTenant,requireAdmin}=require('../_shared/erp');
const {catalogue,validateDefinition,uuid,fail}=require('../_shared/erp/report-definitions');
module.exports=async ctx=>{
 if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
 const access=await authTenant(ctx);if(access.status)return ctx.send(access.status,access.body);
 const denied=requireAdmin(access);if(denied)return ctx.send(denied.status,denied.body);
 try{
  const b=ctx.body,org=uuid(b.organisation_id,'Organisation'),id=b.report_id?uuid(b.report_id,'Report'):null;
  const code=String(b.report_code||'').trim(),name=String(b.report_name||'').trim(),description=String(b.description||'');
  if(!/^[a-z][a-z0-9_]{0,59}$/.test(code)||!name||name.length>120||description.length>4000)fail('Report needs a lowercase code, a name of at most 120 characters and a description of at most 4000 characters');
  if(typeof b.is_active!=='boolean')fail('Active must be boolean');
  validateDefinition(b.definition_json,await catalogue(ctx,access,org));
  if(!Array.isArray(b.module_ids))fail('Module allocations must be a list');
  const moduleIds=[...new Set(b.module_ids.map(v=>uuid(v,'Module')))];
  const modules=await ctx.broker('core_erp','query',{text:'SELECT module_id FROM erp_module WHERE tenant_id=$1 AND organisation_id=$2 AND module_id=ANY($3::uuid[]) AND is_active=true',values:[access.tenantId,org,moduleIds]});
  if(modules.rows.length!==moduleIds.length)fail('A selected module is unavailable in this organisation');

  const values=[access.tenantId,org,code,name,description,JSON.stringify(b.definition_json),b.is_active,access.auth.email];
  const text=id?`UPDATE erp_report SET report_code=$3,report_name=$4,description=$5,definition_json=$6::jsonb,is_active=$7,updated_by_email=$8,updated_at=now(),definition_version=definition_version+1 WHERE tenant_id=$1 AND organisation_id=$2 AND report_id=$9 AND definition_version=$10 RETURNING *`:`INSERT INTO erp_report(tenant_id,organisation_id,report_code,report_name,description,definition_json,is_active,created_by_email,updated_by_email) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$8) RETURNING *`;
  if(id&&(!Number.isSafeInteger(b.definition_version)||b.definition_version<1))fail('Definition version is required when editing');
  const saveValues=id?[...values,id,b.definition_version]:values;
  const moduleParam=saveValues.length+1;
  const result=await ctx.broker('core_erp','query',{text:`WITH saved AS (${text}), removed AS (DELETE FROM erp_report_module WHERE report_id IN(SELECT report_id FROM saved) AND NOT(module_id=ANY($${moduleParam}::uuid[]))), allocated AS (INSERT INTO erp_report_module(report_id,module_id) SELECT saved.report_id,unnest($${moduleParam}::uuid[]) FROM saved ON CONFLICT DO NOTHING) SELECT saved.*, $${moduleParam}::uuid[] AS module_ids FROM saved`,values:[...saveValues,moduleIds]});
  if(!result.rows.length)fail('Report changed or is unavailable. Reload before saving.',409);
  return {ok:true,report:result.rows[0]};
 }catch(e){if(e.status)return ctx.send(e.status,{error:e.message});if(e.code==='23505')return ctx.send(409,{error:'Report code is already in use'});throw e;}
};
