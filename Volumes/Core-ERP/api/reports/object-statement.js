'use strict';
const {authTenant}=require('../_shared/erp');
const {runStatement}=require('../_shared/erp/object-statement');
module.exports=async ctx=>{
 if(ctx.req.method!=='GET')return ctx.send(405,{error:'GET required'});
 const access=await authTenant(ctx);if(access.status)return ctx.send(access.status,access.body);
 try{return await runStatement(ctx,access);}catch(error){if(error.status)return ctx.send(error.status,{error:error.message});throw error;}
};
