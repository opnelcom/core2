'use strict';
const {authTenant}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  if(!orgId)return ctx.send(400,{error:'organisation_id is required'});
  const [families,groups,types]=await Promise.all([
    ctx.broker('core_erp','query',{
      text:`SELECT *
            FROM erp_organisation_ledger_family
            WHERE tenant_id=$1 AND organisation_id=$2 AND is_active=true
            ORDER BY ledger_family_code`,
      values:[access.tenantId,orgId]
    }),
    ctx.broker('core_erp','query',{
      text:`SELECT *
            FROM erp_transaction_group
            WHERE tenant_id=$1 AND organisation_id=$2 AND is_active=true
            ORDER BY sort_order,group_name`,
      values:[access.tenantId,orgId]
    }),
    ctx.broker('core_erp','query',{
      text:`SELECT tt.*,tg.group_code,tg.group_name
            FROM erp_transaction_type tt
            JOIN erp_transaction_group tg ON tg.transaction_group_id=tt.transaction_group_id
            WHERE tt.tenant_id=$1 AND tt.organisation_id=$2 AND tt.is_active=true
            ORDER BY tg.sort_order,tt.sort_order,tt.type_name`,
      values:[access.tenantId,orgId]
    })
  ]);
  return {ledger_families:families.rows,transaction_groups:groups.rows,transaction_types:types.rows};
};
