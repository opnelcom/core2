'use strict';
const {authTenant,requireAdmin}=require('../_shared/erp');
const {catalogue,publicCatalogue,uuid}=require('../_shared/erp/report-definitions');
module.exports=async ctx=>{
 const access=await authTenant(ctx);if(access.status)return ctx.send(access.status,access.body);
 const denied=requireAdmin(access);if(denied)return ctx.send(denied.status,denied.body);
 try{const org=uuid(ctx.query.organisation_id,'Organisation');return {datasets:publicCatalogue(await catalogue(ctx,access,org))};}catch(e){if(e.status)return ctx.send(e.status,{error:e.message});throw e;}
};

module.exports=require("../_shared/context").withContext(module.exports);
