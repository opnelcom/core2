'use strict';

function moduleIds(body){
  return [...new Set((Array.isArray(body.module_ids)?body.module_ids:[]).map(String).filter(Boolean))];
}

async function validateModules(ctx,access,organisationId,ids){
  if(!ids.length)return {status:400,body:{error:'At least one module is required'}};
  const result=await ctx.broker('core_erp','query',{
    text:`SELECT module_id FROM erp_module
          WHERE tenant_id=$1 AND organisation_id=$2 AND module_id=ANY($3::uuid[]) AND is_active=true`,
    values:[access.tenantId,organisationId,ids]
  });
  if(result.rows.length!==ids.length)return {status:400,body:{error:'Every selected module must be active and belong to this organisation'}};
  return null;
}

async function replaceLinks(ctx,access,organisationId,{table,idColumn,idValue,moduleIds:ids,composite=false}){
  const deleteText=composite
    ? `DELETE FROM ${table} WHERE tenant_id=$1 AND organisation_id=$2 AND ${idColumn}=$3`
    : `DELETE FROM ${table} WHERE ${idColumn}=$3`;
  const insertText=composite
    ? `INSERT INTO ${table}(tenant_id,organisation_id,${idColumn},module_id)
       SELECT $1,$2,$3,module_id FROM erp_module WHERE tenant_id=$1 AND organisation_id=$2 AND module_id=ANY($4::uuid[])`
    : `INSERT INTO ${table}(${idColumn},module_id)
       SELECT $3,module_id FROM erp_module WHERE tenant_id=$1 AND organisation_id=$2 AND module_id=ANY($4::uuid[])`;
  await ctx.broker('core_erp','transaction',{statements:[
    {text:deleteText,values:[access.tenantId,organisationId,idValue]},
    {text:insertText,values:[access.tenantId,organisationId,idValue,ids]}
  ]});
}

module.exports={moduleIds,validateModules,replaceLinks};
