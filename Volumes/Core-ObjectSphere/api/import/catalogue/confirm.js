'use strict';
const {authTenant,ensureSchema}=require('../../_shared/items');
const {prepare,commit}=require('../../_shared/catalogue');
module.exports=async ctx=>{
 if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
 const access=await authTenant(ctx);if(access.status)return ctx.send(access.status,access.body);
 await ensureSchema(ctx);
 try{const plan=await prepare(ctx,access);const result=await commit(ctx,access,plan);return ctx.send(201,result);}
 catch(e){if(e.code)throw e;return ctx.send(400,{error:e.message});}
};

module.exports=require("../../_shared/context").withContext(module.exports);
