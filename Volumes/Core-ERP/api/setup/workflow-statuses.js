"use strict";
const {randomUUID}=require('crypto');
const {authTenant,requireAdmin,requireBusinessAccess,clean,normalizeStepCode}=require('../_shared/erp');
module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.req.method==='GET'?ctx.query.organisation_id:ctx.body.organisation_id;
  if(!orgId)return ctx.send(400,{error:'organisation_id is required'});
  if(ctx.req.method==='GET'){
    const denied=await requireBusinessAccess(ctx,access,orgId);
    if(denied)return ctx.send(denied.status,denied.body);
    const r=await ctx.broker('core_erp','query',{text:`SELECT * FROM erp_workflow_status WHERE tenant_id=$1 AND organisation_id=$2 ORDER BY status_label`,values:[access.tenantId,orgId]});
    return {workflow_statuses:r.rows};
  }
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);
  const id=ctx.body.workflow_status_id;
  if(ctx.req.method==='DELETE'){
    const r=await ctx.broker('core_erp','query',{text:`DELETE FROM erp_workflow_status s WHERE tenant_id=$1 AND organisation_id=$2 AND workflow_status_id=$3 AND NOT EXISTS(SELECT 1 FROM erp_workflow_path_status p WHERE p.tenant_id=s.tenant_id AND p.organisation_id=s.organisation_id AND p.step_code=s.status_code) RETURNING *`,values:[access.tenantId,orgId,id]});
    if(!r.rowCount)return ctx.send(409,{error:'Status was not found or is used by a workflow'});
    return {ok:true};
  }
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'GET, POST or DELETE required'});
  for (const key of ['enabled_for_use','displayed']) {
    if (ctx.body[key] !== undefined && typeof ctx.body[key] !== 'boolean') return ctx.send(400,{error:`${key} must be a boolean`});
  }
  const code=normalizeStepCode(ctx.body.status_code),label=clean(ctx.body.status_label),description=clean(ctx.body.description),colour=clean(ctx.body.colour);
  if(!/^[a-z][a-z0-9_]*$/.test(code)||!label||!/^#[0-9a-f]{6}$/i.test(colour))return ctx.send(400,{error:'A code (letters, digits, underscores), label and six-digit hex colour are required'});
  const r=await ctx.broker('core_erp','query',id?{text:`UPDATE erp_workflow_status SET status_label=$4,description=$5,colour=$6,enabled_for_use=$8,displayed=$9,updated_at=now() WHERE tenant_id=$1 AND organisation_id=$2 AND workflow_status_id=$3 AND status_code=$7 RETURNING *`,values:[access.tenantId,orgId,id,label,description,colour,code,ctx.body.enabled_for_use===true,ctx.body.displayed!==false]}:{text:`INSERT INTO erp_workflow_status(tenant_id,organisation_id,workflow_status_id,status_code,status_label,description,colour,enabled_for_use,displayed) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,values:[access.tenantId,orgId,randomUUID(),code,label,description,colour,ctx.body.enabled_for_use===true,ctx.body.displayed!==false]});
  if(!r.rowCount)return ctx.send(404,{error:'Status was not found; an existing status code cannot be changed'});
  return {ok:true,workflow_status:r.rows[0]};
};
