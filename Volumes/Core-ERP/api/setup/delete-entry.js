'use strict';
const {authTenant,requireAdmin}=require('../_shared/erp');
const {prepareSetupDeletion}=require('../_shared/erp/setup-deletion');
module.exports=async ctx=>{
 if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
 const access=await authTenant(ctx);
 if(access.status)return ctx.send(access.status,access.body);
 const denied=requireAdmin(access);
 if(denied)return ctx.send(denied.status,denied.body);
 if(ctx.body.confirm_permanent_delete!==true)return ctx.send(400,{error:'Explicit confirmation of permanent deletion and data loss is required'});
 try{
   const plan=await prepareSetupDeletion(ctx,{tenantId:access.tenantId,organisationId:ctx.body.organisation_id,kind:ctx.body.kind,id:ctx.body.id});
   await plan.commit();return {ok:true};
 }catch(error){
   if(error.status)return ctx.send(error.status,{error:error.message});
   if(error.code==='23503')return ctx.send(409,{error:'This entry is referenced by other records and cannot be permanently deleted.'});
   throw error;
 }
};

module.exports=require("../_shared/context").withContext(module.exports);
