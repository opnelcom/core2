'use strict';
const {authTenant,requireAdmin}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);
  const sourceId=ctx.body.source_organisation_id;
  const targetId=ctx.body.target_organisation_id;
  if(!sourceId||!targetId||sourceId===targetId)return ctx.send(400,{error:'Source and target organisations are required'});
  const r=await ctx.broker('core_erp','query',{
    text:`WITH target_root AS (
            SELECT division_id FROM erp_division WHERE tenant_id=$1 AND organisation_id=$3 AND parent_division_id IS NULL LIMIT 1
          ),
          source_accounts AS (
            SELECT a.*,t.account_type_code
            FROM erp_ledger_account a
            LEFT JOIN erp_ledger_account_type t ON t.account_type_id=a.account_type_id
            WHERE a.tenant_id=$1 AND a.organisation_id=$2 AND a.ledger_family_code='gl' AND a.workflow_status <> 'deleted'
          ),
          target_types AS (
            SELECT account_type_id,account_type_code
            FROM erp_ledger_account_type
            WHERE tenant_id=$1 AND organisation_id=$3 AND ledger_family_code='gl'
          )
          INSERT INTO erp_ledger_account(tenant_id,organisation_id,owner_division_id,ledger_family_code,account_code,account_name,account_type_id,requires_subledger,required_subledger_family_code,workflow_status,additional_data,created_by_email,updated_by_email,approved_by_email,approved_at)
          SELECT $1,$3,tr.division_id,'gl',s.account_code,s.account_name,tt.account_type_id,s.requires_subledger,s.required_subledger_family_code,'approved',s.additional_data,$4,$4,$4,now()
          FROM source_accounts s CROSS JOIN target_root tr LEFT JOIN target_types tt ON tt.account_type_code=s.account_type_code
          ON CONFLICT DO NOTHING
          RETURNING ledger_account_id`,
    values:[access.tenantId,sourceId,targetId,access.auth.email]
  });
  return {accounts_imported:r.rowCount};
};
