'use strict';
delete require.cache[require.resolve('../_shared/erp')];
const {authTenant}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  const roleId=ctx.query.role_id;
  if(!orgId||!roleId)return ctx.send(400,{error:'organisation_id and role_id are required'});
  const result=await ctx.broker('core_erp','query',{
    text:`SELECT rm.module_id
          FROM erp_role_module rm
          JOIN erp_role r ON r.role_id=rm.role_id
          WHERE r.tenant_id=$1 AND r.organisation_id=$2 AND r.role_id=$3
          ORDER BY rm.module_id`,
    values:[access.tenantId,orgId,roleId]
  });
  return {module_ids:result.rows.map(row=>row.module_id)};
};
