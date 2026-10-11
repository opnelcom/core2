'use strict';
const {access,ensureSchema,uuid,version,fail}=require('../_shared/connections');
module.exports=async ctx=>{
  const {tenantId}=await access(ctx);await ensureSchema(ctx);
  const result=await ctx.broker('core_dbmanager','query',{text:'DELETE FROM dbmanager_connection WHERE tenant_id=$1 AND connection_id=$2 AND version=$3 RETURNING connection_id',values:[tenantId,uuid(ctx.body.connection_id),version(ctx.body.version)]});
  if(!result.rows.length)throw fail(409,'Connection was changed or deleted. Reload and try again.');
  return {deleted:true,tenant_id:tenantId};
};
