'use strict';
const {authTenant,clean,nullable,bool,parseJson}=require('../_shared/erp');

const arrays=(body,name)=>{
  const value=parseJson(body[name],[]);
  return Array.isArray(value)?value:[];
};

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const id=nullable(ctx.body.legal_entity_id);
  const orgId=ctx.body.organisation_id;
  const entityType=clean(ctx.body.entity_type,'company');
  const legalName=clean(ctx.body.legal_name);
  const knownName=clean(ctx.body.known_name);
  const status=clean(ctx.body.workflow_status,'draft');
  if(!orgId||!legalName||!knownName)return ctx.send(400,{error:'Organisation, legal name and known name are required'});
  if(!['draft','submitted','approved','rejected','blocked','archived','deleted'].includes(status))return ctx.send(400,{error:'Invalid workflow status'});
  let additionalData={};
  try{
    additionalData=parseJson(ctx.body.additional_data,{});
  }catch{
    return ctx.send(400,{error:'Additional data must be valid JSON'});
  }
  let identifications;
  let addresses;
  let relationships;
  try{
    identifications=arrays(ctx.body,'identifications');
    addresses=arrays(ctx.body,'addresses');
    relationships=arrays(ctx.body,'relationships');
  }catch{
    return ctx.send(400,{error:'Child rows must be valid JSON arrays'});
  }
  const entityValues=[access.tenantId,orgId,entityType,legalName,knownName,status,nullable(ctx.body.effective_from),nullable(ctx.body.effective_to),JSON.stringify(additionalData),access.auth.email];
  const entitySql=id
    ? `UPDATE erp_legal_entity
       SET entity_type=$3,legal_name=$4,known_name=$5,workflow_status=$6,effective_from=COALESCE($7::date,effective_from),effective_to=$8::date,additional_data=$9::jsonb,updated_by_email=$10,updated_at=now()
       WHERE tenant_id=$1 AND organisation_id=$2 AND legal_entity_id=$11
       RETURNING *`
    : `INSERT INTO erp_legal_entity(tenant_id,organisation_id,entity_type,legal_name,known_name,workflow_status,effective_from,effective_to,additional_data,created_by_email,updated_by_email)
       VALUES($1,$2,$3,$4,$5,$6,COALESCE($7::date,CURRENT_DATE),$8::date,$9::jsonb,$10,$10)
       RETURNING *`;
  const saved=await ctx.broker('core_erp','query',{text:entitySql,values:id?[...entityValues,id]:entityValues});
  if(!saved.rowCount)return ctx.send(404,{error:'Legal entity not found'});
  const entityId=saved.rows[0].legal_entity_id;
  await ctx.broker('core_erp','query',{text:`DELETE FROM erp_legal_entity_identification WHERE tenant_id=$1 AND legal_entity_id=$2`,values:[access.tenantId,entityId]});
  await ctx.broker('core_erp','query',{text:`DELETE FROM erp_legal_entity_address WHERE tenant_id=$1 AND legal_entity_id=$2`,values:[access.tenantId,entityId]});
  await ctx.broker('core_erp','query',{text:`DELETE FROM erp_legal_entity_relationship WHERE tenant_id=$1 AND from_legal_entity_id=$2`,values:[access.tenantId,entityId]});
  for(const row of identifications){
    if(!clean(row.identification_type)||!clean(row.identification_number))continue;
    await ctx.broker('core_erp','query',{
      text:`INSERT INTO erp_legal_entity_identification(tenant_id,organisation_id,legal_entity_id,identification_type,identification_number,issuing_authority,country_code,valid_from,valid_to,is_active)
            VALUES($1,$2,$3,$4,$5,$6,$7,COALESCE($8::date,CURRENT_DATE),$9::date,$10)`,
      values:[access.tenantId,orgId,entityId,clean(row.identification_type),clean(row.identification_number),nullable(row.issuing_authority),nullable(row.country_code),nullable(row.valid_from),nullable(row.valid_to),row.is_active===undefined?true:bool(row.is_active)]
    });
  }
  for(const row of addresses){
    if(!clean(row.address_type)||!clean(row.address_line1))continue;
    await ctx.broker('core_erp','query',{
      text:`INSERT INTO erp_legal_entity_address(tenant_id,organisation_id,legal_entity_id,address_type,address_line1,address_line2,city,region,postal_code,country_code,valid_from,valid_to,is_primary)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11::date,CURRENT_DATE),$12::date,$13)`,
      values:[access.tenantId,orgId,entityId,clean(row.address_type),clean(row.address_line1),nullable(row.address_line2),nullable(row.city),nullable(row.region),nullable(row.postal_code),nullable(row.country_code),nullable(row.valid_from),nullable(row.valid_to),bool(row.is_primary)]
    });
  }
  for(const row of relationships){
    const toId=nullable(row.to_legal_entity_id);
    if(!toId||!clean(row.relationship_type))continue;
    await ctx.broker('core_erp','query',{
      text:`INSERT INTO erp_legal_entity_relationship(tenant_id,organisation_id,from_legal_entity_id,to_legal_entity_id,relationship_type,role_title,ownership_percentage,valid_from,valid_to,is_primary)
            SELECT $1,$2,$3,target.legal_entity_id,$5,$6,$7,COALESCE($8::date,CURRENT_DATE),$9::date,$10
            FROM erp_legal_entity target
            WHERE target.tenant_id=$1 AND target.organisation_id=$2 AND target.legal_entity_id=$4`,
      values:[access.tenantId,orgId,entityId,toId,clean(row.relationship_type),nullable(row.role_title),row.ownership_percentage===''||row.ownership_percentage===undefined?null:Number(row.ownership_percentage),nullable(row.valid_from),nullable(row.valid_to),bool(row.is_primary)]
    });
  }
  return {legal_entity:saved.rows[0]};
};
