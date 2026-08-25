'use strict';
const {authTenant}=require('../_shared/erp');

const transitions={
  submit:{from:['draft','rejected'],to:'submitted'},
  approve:{from:['submitted'],to:'approved'},
  reject:{from:['submitted'],to:'rejected'},
  block:{from:['approved'],to:'blocked'},
  archive:{from:['approved','blocked','rejected'],to:'archived'},
  delete:{from:['draft','rejected'],to:'deleted'}
};

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const id=ctx.body.master_data_record_id;
  const action=ctx.body.action;
  const t=transitions[action];
  if(!id||!t)return ctx.send(400,{error:'Record and valid action are required'});
  const r=await ctx.broker('core_erp','query',{
    text:`UPDATE erp_master_data_record
          SET workflow_status=$3,
              approved_by_email=CASE WHEN $3='approved' THEN $4 ELSE approved_by_email END,
              approved_at=CASE WHEN $3='approved' THEN now() ELSE approved_at END,
              updated_by_email=$4,
              updated_at=now()
          WHERE tenant_id=$1 AND master_data_record_id=$2 AND workflow_status=ANY($5::text[])
          RETURNING *`,
    values:[access.tenantId,id,t.to,access.auth.email,t.from]
  });
  if(!r.rowCount)return ctx.send(400,{error:'Workflow action is not valid for the current state'});
  return {record:r.rows[0]};
};
