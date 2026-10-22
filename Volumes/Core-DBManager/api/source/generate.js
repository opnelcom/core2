'use strict';
const {access,resolveSource}=require('../_shared/connections');
const {postgres}=require('../_shared/migration');
module.exports=async ctx=>{
  const {tenantId}=await access(ctx);const source=await resolveSource(ctx,tenantId);
  return postgres.withSource(source,ctx.config,async client=>({tenant_id:tenantId,...await postgres.generate(client,ctx.body,ctx.config)}));
};

module.exports=require("../_shared/context").withContext(module.exports);
