"use strict";
const {authTenant,canInitialiseTemplateOrganisation}=require("../_shared/erp");
const {initialiseTemplate}=require('../_shared/erp/template-initialisation');
module.exports=async ctx=>{
 if(ctx.req.method!=="POST")return ctx.send(405,{error:"POST required"});
 const access=await authTenant(ctx);if(access.status)return ctx.send(access.status,access.body);
 if(ctx.body.confirmed!==true)return ctx.send(400,{error:"Confirmation required"});
 if(!await canInitialiseTemplateOrganisation(ctx,{tenantId:access.tenantId,email:access.auth.email}))return ctx.send(403,{error:"ERP Setup Administrator access required"});
 return {ok:true,...await initialiseTemplate(ctx,{access,mode:"definitions",confirmed:true})};
};

module.exports=require("../_shared/context").withContext(module.exports);
