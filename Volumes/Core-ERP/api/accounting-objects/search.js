'use strict';
const {authTenant,clean,nullable,requireModuleAccess}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  if(!orgId)return ctx.send(400,{error:'organisation_id is required'});
  const term=clean(ctx.query.search);
  const excludeId=nullable(ctx.query.exclude_accounting_object_id);
  const values=[access.tenantId,orgId,excludeId,term?`%${term.toLowerCase()}%`:null];
  const r=await ctx.broker('core_erp','query',{
    text:`SELECT o.accounting_object_id,o.object_code,o.object_name,o.accounting_object_type_id,
            t.type_code,t.type_name,d.division_name owner_division_name
          FROM erp_accounting_object o
          JOIN erp_accounting_object_type t ON t.accounting_object_type_id=o.accounting_object_type_id
          JOIN erp_division d ON d.division_id=o.owner_division_id
          WHERE o.tenant_id=$1 AND o.organisation_id=$2 AND o.workflow_status <> 'deleted'
          AND ($3::uuid IS NULL OR o.accounting_object_id <> $3::uuid)
          AND (
            $4::text IS NULL
            OR lower(t.type_code) LIKE $4
            OR lower(t.type_name) LIKE $4
            OR lower(o.object_code) LIKE $4
            OR lower(o.object_name) LIKE $4
            OR lower(concat_ws(' - ',t.type_name,o.object_code,o.object_name)) LIKE $4
            OR lower(concat_ws(' - ',t.type_code,o.object_code,o.object_name)) LIKE $4
          )
          ORDER BY t.type_name,o.object_code,o.object_name
          LIMIT 50`,
    values
  });
  const checks=new Map();
  for(const row of r.rows){
    if(!checks.has(row.accounting_object_type_id))checks.set(row.accounting_object_type_id,requireModuleAccess(ctx,access,{organisationId:orgId,resourceKind:'accounting_object_type',resourceCode:row.accounting_object_type_id}));
  }
  const deniedByType=new Map(await Promise.all([...checks].map(async([id,promise])=>[id,!!(await promise)])));
  return {records:r.rows.filter(row=>!deniedByType.get(row.accounting_object_type_id))};
};
