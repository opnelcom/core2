'use strict';
const {authTenant,requireAdmin,clean,nullable,bool,parseJson}=require('../_shared/erp');

const legalEntityRequiredFamilies=new Set(['customer','vendor','contract','loan']);

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);
  const id=nullable(ctx.body.ledger_account_id);
  const orgId=ctx.body.organisation_id;
  const divisionId=ctx.body.owner_division_id;
  const family=clean(ctx.body.ledger_family_code,'gl');
  const legalEntityId=nullable(ctx.body.legal_entity_id);
  const code=clean(ctx.body.account_code);
  const name=clean(ctx.body.account_name);
  if(!orgId||!divisionId||!family||!code||!name)return ctx.send(400,{error:'Organisation, owner division, family, code and name are required'});
  if(legalEntityRequiredFamilies.has(family)&&!legalEntityId)return ctx.send(400,{error:`${family} accounts must be linked to a legal entity`});
  if(legalEntityId){
    const entity=await ctx.broker('core_erp','query',{
      text:`SELECT 1 FROM erp_legal_entity WHERE tenant_id=$1 AND organisation_id=$2 AND legal_entity_id=$3 AND workflow_status <> 'deleted'`,
      values:[access.tenantId,orgId,legalEntityId]
    });
    if(!entity.rowCount)return ctx.send(400,{error:'Legal entity must exist in this organisation'});
  }
  const payload=[
    access.tenantId,orgId,divisionId,family,code,name,nullable(ctx.body.account_type_id),legalEntityId,
    bool(ctx.body.requires_subledger),nullable(ctx.body.required_subledger_family_code),
    parseJson(ctx.body.additional_data,{}),access.auth.email
  ];
  const text=id
    ? `UPDATE erp_ledger_account
       SET owner_division_id=$3,ledger_family_code=$4,account_code=$5,account_name=$6,account_type_id=$7,legal_entity_id=$8,requires_subledger=$9,required_subledger_family_code=$10,additional_data=$11::jsonb,updated_by_email=$12,updated_at=now()
       WHERE tenant_id=$1 AND organisation_id=$2 AND ledger_account_id=$13 AND workflow_status IN('draft','rejected','approved','blocked')
       RETURNING *`
    : `INSERT INTO erp_ledger_account(tenant_id,organisation_id,owner_division_id,ledger_family_code,account_code,account_name,account_type_id,legal_entity_id,requires_subledger,required_subledger_family_code,additional_data,workflow_status,created_by_email,updated_by_email,approved_by_email,approved_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,'approved',$12,$12,$12,now()) RETURNING *`;
  const r=await ctx.broker('core_erp','query',{text,values:id?[...payload,id]:payload});
  if(!r.rowCount)return ctx.send(404,{error:'Ledger account not found or cannot be edited'});
  return {account:r.rows[0]};
};
