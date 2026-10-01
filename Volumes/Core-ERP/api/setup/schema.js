'use strict';
const {canBootstrapSetup,isSetupAdministrator,runSchemaSql}=require('../_shared/erp');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const auth=ctx.auth();
  if(!auth)return ctx.send(401,{error:'Authentication required'});
  const tenantId=ctx.cookies.current_tenant;
  if(!tenantId)return ctx.send(400,{error:'No current tenant'});
  const access=await ctx.broker('core_saas','query',{
    brokerProfile:'core_saas',
    text:`SELECT 1
          FROM core_tenant t
          JOIN core_tenant_user tu ON tu.tenant_id=t.tenant_id
          WHERE t.tenant_id=$1
          AND lower(tu.email)=lower($2)
          AND t.status='active'
          AND tu.status='active'`,
    values:[tenantId,auth.email]
  });
  if(!access.rowCount)return ctx.send(403,{error:'No access to active tenant'});
  const organisationId=ctx.body?.access_organisation_id||null;
  const bootstrapAllowed=await canBootstrapSetup(ctx,tenantId);
  const setupAdministrator=await isSetupAdministrator(ctx,{tenantId,organisationId,email:auth.email});
  if(!bootstrapAllowed&&!setupAdministrator)return ctx.send(403,{error:'ERP Setup Administrator access is required'});
  await runSchemaSql(ctx);
  return {ok:true,initialised:true};
};
