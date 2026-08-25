'use strict';
const {authTenant,requireAdmin,clean,nullable}=require('../_shared/erp');

const divisionStatuses=new Set(['draft','submitted','approved','rejected','blocked','archived','deleted']);

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);
  const id=nullable(ctx.body.division_id);
  const orgId=ctx.body.organisation_id;
  const code=clean(ctx.body.division_code).toUpperCase();
  const name=clean(ctx.body.division_name);
  if(!orgId||!code||!name)return ctx.send(400,{error:'Organisation, code and name are required'});
  const parent=nullable(ctx.body.parent_division_id);
  const status=clean(ctx.body.workflow_status,'approved').toLowerCase();
  if(!divisionStatuses.has(status))return ctx.send(400,{error:'Invalid division status'});
  const values=id
    ? [access.tenantId,id,parent,code,name,status,access.auth.email]
    : [access.tenantId,orgId,parent,code,name,status,access.auth.email];
  const text=id
    ? `UPDATE erp_division SET parent_division_id=$3,division_code=$4,division_name=$5,workflow_status=$6,updated_by_email=$7,updated_at=now()
       WHERE tenant_id=$1 AND division_id=$2 AND workflow_status <> 'deleted' RETURNING *`
    : `INSERT INTO erp_division(tenant_id,organisation_id,parent_division_id,division_code,division_name,workflow_status,created_by_email,updated_by_email)
       VALUES($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *`;
  const r=await ctx.broker('core_erp','query',{text,values});
  if(!r.rowCount)return ctx.send(404,{error:'Division not found'});
  return {division:r.rows[0]};
};
