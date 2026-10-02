'use strict';
const {authTenant,requireAdmin,clean,nullable,bool,validateTypeResourceRoleMappings,saveTypeResourceRoleMappings}=require('../_shared/erp');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);
  const id=nullable(ctx.body.gl_account_type_id);
  const orgId=ctx.body.organisation_id;
  const code=clean(ctx.body.type_code).toLowerCase().replace(/\s+/g,'_');
  const name=clean(ctx.body.type_name);
  if(!orgId||!code||!name)return ctx.send(400,{error:'Organisation, code and name are required'});
  if(Array.isArray(ctx.body.resource_role_mappings)){
    const validation=await validateTypeResourceRoleMappings(ctx,access,{organisationId:orgId,objectKind:'gl_account',objectTypeId:id,mappings:ctx.body.resource_role_mappings});
    if(validation.error)return ctx.send(400,{error:validation.error});
  }
  const result=id
    ? await ctx.broker('core_erp','query',{text:`UPDATE erp_gl_account_type SET type_code=$3,type_name=$4,is_required=$5,is_active=$6,updated_at=now() WHERE tenant_id=$1 AND organisation_id=$2 AND gl_account_type_id=$7 RETURNING *`,values:[access.tenantId,orgId,code,name,bool(ctx.body.is_required),bool(ctx.body.is_active),id]})
    : await ctx.broker('core_erp','query',{text:`INSERT INTO erp_gl_account_type(tenant_id,organisation_id,type_code,type_name,is_required,is_seeded,is_active) VALUES($1,$2,$3,$4,$5,false,$6) RETURNING *`,values:[access.tenantId,orgId,code,name,bool(ctx.body.is_required),bool(ctx.body.is_active)]});
  if(!result.rowCount)return ctx.send(404,{error:'GL account type not found'});
  if(Array.isArray(ctx.body.resource_role_mappings)){
    const saved=await saveTypeResourceRoleMappings(ctx,access,{organisationId:orgId,objectKind:'gl_account',objectTypeId:result.rows[0].gl_account_type_id,mappings:ctx.body.resource_role_mappings});
    if(saved.error)return ctx.send(400,{error:saved.error});
  }
  return {gl_account_type:result.rows[0]};
};
