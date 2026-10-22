"use strict";
const {authTenant,moveWorkflowObject}=require('../_shared/erp');
module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  let access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const result=await moveWorkflowObject(ctx,access,{kind:'accounting_object',id:ctx.body.accounting_object_id,actionId:ctx.body.workflow_next_id,comment:ctx.body.comment});
  if(result.status)return ctx.send(result.status,result.body);
  return result;
};

module.exports=require("../_shared/context").withContext(module.exports);
