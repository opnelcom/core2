'use strict';
const {authTenant,requireAdmin,clean,nullable,normalizeStepCode}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.req.method==='GET'?ctx.query.organisation_id:ctx.body.organisation_id;
  if(!orgId)return ctx.send(400,{error:'organisation_id is required'});
  if(ctx.req.method==='GET'){
    const [paths,steps,next]=await Promise.all([
      ctx.broker('core_erp','query',{text:`SELECT * FROM erp_workflow_path WHERE tenant_id=$1 AND organisation_id=$2 ORDER BY path_name`,values:[access.tenantId,orgId]}),
      ctx.broker('core_erp','query',{text:`SELECT * FROM erp_workflow_step WHERE tenant_id=$1 AND organisation_id=$2 ORDER BY workflow_path_id,sort_order,step_label`,values:[access.tenantId,orgId]}),
      ctx.broker('core_erp','query',{text:`SELECT * FROM erp_workflow_next WHERE tenant_id=$1 AND organisation_id=$2 ORDER BY workflow_path_id,current_step_code,next_step_code`,values:[access.tenantId,orgId]})
    ]);
    return {workflow_paths:paths.rows,workflow_steps:steps.rows,workflow_next:next.rows};
  }
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'GET or POST required'});
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);
  const id=nullable(ctx.body.workflow_path_id);
  const name=clean(ctx.body.path_name);
  const initialStepCode=normalizeStepCode(ctx.body.initial_step_code);
  const active=ctx.body.is_active!==false&&ctx.body.is_active!=='false';
  const steps=(Array.isArray(ctx.body.steps)?ctx.body.steps:[]).map((step,index)=>({
    step_code:normalizeStepCode(step.step_code),
    step_label:clean(step.step_label||step.step_name),
    colour:clean(step.colour||step.color,'#667085'),
    sort_order:Number.isFinite(Number(step.sort_order))?Number(step.sort_order):(index+1)*10
  })).filter(step=>step.step_code&&step.step_label);
  const next=(Array.isArray(ctx.body.next)?ctx.body.next:[]).map(row=>({
    current_step_code:normalizeStepCode(row.current_step_code),
    next_step_code:normalizeStepCode(row.next_step_code)
  })).filter(row=>row.current_step_code&&row.next_step_code);
  if(!name||!initialStepCode)return ctx.send(400,{error:'Workflow path name and initial step are required'});
  if(!steps.some(step=>step.step_code===initialStepCode))return ctx.send(400,{error:'Initial step must be one of the workflow steps'});
  const duplicate=steps.find((step,index)=>steps.findIndex(other=>other.step_code===step.step_code)!==index);
  if(duplicate)return ctx.send(400,{error:`Workflow step code is duplicated: ${duplicate.step_code}`});
  const stepCodes=new Set(steps.map(step=>step.step_code));
  const invalidNext=next.find(row=>!stepCodes.has(row.current_step_code)||!stepCodes.has(row.next_step_code));
  if(invalidNext)return ctx.send(400,{error:'Every Workflow Next row must reference steps in the same path'});
  const savePath=id
    ? await ctx.broker('core_erp','query',{
        text:`UPDATE erp_workflow_path
              SET path_name=$3,initial_step_code=$4,is_active=$5,updated_at=now()
              WHERE tenant_id=$1 AND organisation_id=$2 AND workflow_path_id=$6
              RETURNING *`,
        values:[access.tenantId,orgId,name,initialStepCode,active,id]
      })
    : await ctx.broker('core_erp','query',{
        text:`INSERT INTO erp_workflow_path(tenant_id,organisation_id,path_name,initial_step_code,is_active,is_seeded)
              VALUES($1,$2,$3,$4,$5,false)
              ON CONFLICT(tenant_id,organisation_id,path_name) DO UPDATE
              SET initial_step_code=excluded.initial_step_code,is_active=excluded.is_active,updated_at=now()
              RETURNING *`,
        values:[access.tenantId,orgId,name,initialStepCode,active]
      });
  if(!savePath.rowCount)return ctx.send(404,{error:'Workflow path not found'});
  const path=savePath.rows[0];
  const statements=[
    {text:`DELETE FROM erp_workflow_next WHERE tenant_id=$1 AND organisation_id=$2 AND workflow_path_id=$3`,values:[access.tenantId,orgId,path.workflow_path_id]},
    {text:`DELETE FROM erp_workflow_step WHERE tenant_id=$1 AND organisation_id=$2 AND workflow_path_id=$3 AND step_code <> ALL($4::text[])`,values:[access.tenantId,orgId,path.workflow_path_id,steps.map(step=>step.step_code)]}
  ];
  steps.forEach(step=>statements.push({
    text:`INSERT INTO erp_workflow_step(tenant_id,organisation_id,workflow_path_id,step_code,step_label,colour,sort_order)
          VALUES($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT(workflow_path_id,step_code) DO UPDATE
          SET step_label=excluded.step_label,colour=excluded.colour,sort_order=excluded.sort_order,updated_at=now()`,
    values:[access.tenantId,orgId,path.workflow_path_id,step.step_code,step.step_label,step.colour,step.sort_order]
  }));
  next.forEach(row=>statements.push({
    text:`INSERT INTO erp_workflow_next(tenant_id,organisation_id,workflow_path_id,current_step_code,next_step_code)
          VALUES($1,$2,$3,$4,$5)
          ON CONFLICT(workflow_path_id,current_step_code,next_step_code) DO NOTHING`,
    values:[access.tenantId,orgId,path.workflow_path_id,row.current_step_code,row.next_step_code]
  }));
  await ctx.broker('core_erp','transaction',{statements});
  return {ok:true,workflow_path:path};
};
