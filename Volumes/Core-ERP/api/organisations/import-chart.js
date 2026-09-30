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
    text:`WITH source_accounts AS (
            SELECT a.*,t.type_code account_type_code,st.type_code required_subledger_type_code
            FROM erp_gl_account a
            LEFT JOIN erp_gl_account_type t ON t.gl_account_type_id=a.gl_account_type_id
            LEFT JOIN erp_subledger_account_type st ON st.subledger_account_type_id=a.required_subledger_account_type_id
            WHERE a.tenant_id=$1 AND a.organisation_id=$2 AND a.workflow_status <> 'deleted'
          ),
          target_types AS (
            SELECT gl_account_type_id,type_code
            FROM erp_gl_account_type
            WHERE tenant_id=$1 AND organisation_id=$3
          )
          INSERT INTO erp_gl_account(tenant_id,organisation_id,account_code,account_name,gl_account_type_id,requires_subledger,required_subledger_account_type_id,workflow_status,additional_data,created_by_email,updated_by_email,approved_by_email,approved_at)
          SELECT $1,$3,s.account_code,s.account_name,tt.gl_account_type_id,s.requires_subledger,target_subledger_type.subledger_account_type_id,'approved',s.additional_data,$4,$4,$4,now()
          FROM source_accounts s
          LEFT JOIN target_types tt ON tt.type_code=s.account_type_code
          LEFT JOIN erp_subledger_account_type target_subledger_type ON target_subledger_type.tenant_id=$1 AND target_subledger_type.organisation_id=$3 AND target_subledger_type.type_code=s.required_subledger_type_code
          ON CONFLICT DO NOTHING
          RETURNING gl_account_id`,
    values:[access.tenantId,sourceId,targetId,access.auth.email]
  });
  return {accounts_imported:r.rowCount};
};
