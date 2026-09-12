'use strict';
const {authTenant,isTenantAdministrator}=require('../_shared/erp');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  if(!isTenantAdministrator(access))return ctx.send(403,{error:'Tenant administrator access is required to assign the first Security Administrator'});
  const orgId=ctx.body.organisation_id;
  if(!orgId)return ctx.send(400,{error:'organisation_id is required'});

  const existing=await ctx.broker('core_erp','query',{
    text:`SELECT count(DISTINCT lower(ur.email)) AS count
      FROM erp_user_role ur
      JOIN erp_role role ON role.role_id=ur.role_id
      WHERE ur.tenant_id=$1
        AND ur.organisation_id=$2
        AND role.is_admin=true
        AND role.is_active=true
        AND ur.valid_from <= CURRENT_DATE
        AND (ur.valid_to IS NULL OR ur.valid_to >= CURRENT_DATE)`,
    values:[access.tenantId,orgId]
  });
  if(Number(existing.rows[0]?.count)||0){
    return ctx.send(409,{error:'This organisation already has a Security Administrator'});
  }

  const role=await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_role(tenant_id,organisation_id,role_code,role_name,role_description,is_admin,is_active)
      VALUES($1,$2,'security_administrator','Security Administrator','Setup administration only, without master data, transaction or report access.',true,true)
      ON CONFLICT(tenant_id,organisation_id,role_code) DO UPDATE
      SET role_name=excluded.role_name,
        role_description=excluded.role_description,
        is_admin=true,
        is_active=true
      RETURNING *`,
    values:[access.tenantId,orgId]
  });
  await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_user_role(tenant_id,organisation_id,role_id,email,valid_from,valid_to)
      VALUES($1,$2,$3,lower($4),CURRENT_DATE,NULL)
      ON CONFLICT(tenant_id,organisation_id,role_id,email) DO UPDATE
      SET valid_from=LEAST(erp_user_role.valid_from,excluded.valid_from),
        valid_to=NULL`,
    values:[access.tenantId,orgId,role.rows[0].role_id,access.auth.email]
  });

  return {ok:true,role:role.rows[0],email:access.auth.email};
};
