'use strict';
const {authTenant}=require('../_shared/erp');
const {listActions}=require('../_shared/erp/object-actions');
module.exports=async ctx=>{
 if(ctx.req.method!=='GET')return ctx.send(405,{error:'GET required'});
 const access=await authTenant(ctx);if(access.status)return ctx.send(access.status,access.body);
 try{return await listActions(ctx,access);}catch(error){if(error.status)return ctx.send(error.status,{error:error.message});throw error;}
};

module.exports=require("../_shared/context").withContext(module.exports);
