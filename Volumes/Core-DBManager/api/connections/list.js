'use strict';
const {access,ensureSchema,fields}=require('../_shared/connections');
module.exports=async ctx=>{
  const {tenantId}=await access(ctx,['GET']);await ensureSchema(ctx);
  const result=await ctx.broker('core_dbmanager','query',{text:`SELECT ${fields} FROM dbmanager_connection WHERE tenant_id=$1 ORDER BY lower(connection_name),connection_id`,values:[tenantId]});
  return {tenant_id:tenantId,connections:result.rows};
};

module.exports=require("../_shared/context").withContext(module.exports);
