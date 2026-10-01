'use strict';
const {authTenant}=require('../_shared/erp');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const organisationId=String(ctx.body.organisation_id||'').trim();
  const divisionId=String(ctx.body.division_id||'').trim()||null;
  const includeChildren=ctx.body.include_children===true;
  if(!organisationId)return ctx.send(400,{error:'organisation_id is required'});
  const valid=await ctx.broker('core_erp','query',{
    text:`SELECT organisation.organisation_id,division.division_id
          FROM erp_organisation organisation
          LEFT JOIN erp_division division
            ON division.tenant_id=organisation.tenant_id
           AND division.organisation_id=organisation.organisation_id
           AND division.division_id=$3::uuid
           AND division.workflow_status <> 'deleted'
          WHERE organisation.tenant_id=$1
            AND organisation.organisation_id=$2::uuid
            AND organisation.workflow_status <> 'deleted'`,
    values:[access.tenantId,organisationId,divisionId]
  });
  if(!valid.rowCount)return ctx.send(404,{error:'Organisation is not available'});
  if(divisionId&&!valid.rows[0].division_id)return ctx.send(400,{error:'Division does not belong to the selected organisation'});
  await ctx.broker('core_erp','transaction',{statements:[
    {
      text:`INSERT INTO erp_user_tenant_context(tenant_id,user_id,organisation_id,updated_at)
            VALUES($1,$2,$3,now())
            ON CONFLICT(tenant_id,user_id) DO UPDATE
            SET organisation_id=excluded.organisation_id,updated_at=now()`,
      values:[access.tenantId,access.auth.user_id,organisationId]
    },
    {
      text:`INSERT INTO erp_user_organisation_context(tenant_id,user_id,organisation_id,division_id,include_children,updated_at)
            VALUES($1,$2,$3,$4,$5,now())
            ON CONFLICT(tenant_id,user_id,organisation_id) DO UPDATE
            SET division_id=excluded.division_id,include_children=excluded.include_children,updated_at=now()`,
      values:[access.tenantId,access.auth.user_id,organisationId,divisionId,includeChildren]
    }
  ]});
  return {ok:true,organisation_id:organisationId,division_id:divisionId,include_children:includeChildren};
};
