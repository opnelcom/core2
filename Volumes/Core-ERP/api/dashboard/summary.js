'use strict';
const {authTenant}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  if(!orgId)return ctx.send(400,{error:'organisation_id is required'});

  const count=async text=>{
    const result=await ctx.broker('core_erp','query',{text,values:[access.tenantId,orgId]});
    return Number(result.rows[0]?.count)||0;
  };
  const [divisions,legalEntities,glAccounts,subledgers,periods,journals]=await Promise.all([
    count(`SELECT count(*) FROM erp_division WHERE tenant_id=$1 AND organisation_id=$2 AND workflow_status <> 'deleted'`),
    count(`SELECT count(*) FROM erp_legal_entity WHERE tenant_id=$1 AND organisation_id=$2 AND workflow_status <> 'deleted'`),
    count(`SELECT count(*) FROM erp_ledger_account WHERE tenant_id=$1 AND organisation_id=$2 AND ledger_family_code='gl' AND workflow_status <> 'deleted'`),
    count(`SELECT count(*) FROM erp_ledger_account WHERE tenant_id=$1 AND organisation_id=$2 AND ledger_family_code<>'gl' AND workflow_status <> 'deleted'`),
    count(`SELECT count(*) FROM erp_fiscal_period WHERE tenant_id=$1 AND organisation_id=$2`),
    count(`SELECT count(*) FROM erp_journal WHERE tenant_id=$1 AND organisation_id=$2 AND workflow_status <> 'deleted'`)
  ]);
  return {divisions,legal_entities:legalEntities,gl_accounts:glAccounts,subledgers,periods,journals};
};
