'use strict';
const {authTenant,moveWorkflowObject}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const result=await moveWorkflowObject(ctx,access,{
    kind:'accounting_object',
    id:ctx.body.accounting_object_id,
    nextStepCode:ctx.body.next_step_code||ctx.body.workflow_status,
    comment:ctx.body.comment
  });
  if(result.status)return ctx.send(result.status,result.body);
  return result;
};
