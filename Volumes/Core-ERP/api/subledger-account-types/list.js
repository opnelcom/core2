'use strict';
const {authTenant}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  if(!orgId)return ctx.send(400,{error:'organisation_id is required'});
  const result=await ctx.broker('core_erp','query',{
    text:`SELECT t.*,COALESCE((SELECT array_agg(link.module_id ORDER BY module.sort_order,module.module_name)
            FROM erp_subledger_account_type_module link JOIN erp_module module ON module.module_id=link.module_id
            WHERE link.subledger_account_type_id=t.subledger_account_type_id),'{}'::uuid[]) module_ids
          FROM erp_subledger_account_type t
          WHERE t.tenant_id=$1 AND t.organisation_id=$2
          ORDER BY t.type_code`,
    values:[access.tenantId,orgId]
  });
  return {subledger_account_types:result.rows};
};
