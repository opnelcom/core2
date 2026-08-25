'use strict';
const {authTenant,requireAdmin,clean,nullable,bool}=require('../_shared/erp');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);
  const id=nullable(ctx.body.account_type_id);
  const orgId=ctx.body.organisation_id;
  const family=clean(ctx.body.ledger_family_code).toLowerCase();
  const code=clean(ctx.body.account_type_code).toLowerCase().replace(/\s+/g,'_');
  const name=clean(ctx.body.account_type_name);
  if(!orgId||!family||!code||!name)return ctx.send(400,{error:'Organisation, family, code and name are required'});
  const values=id
    ? [access.tenantId,id,family,code,name,bool(ctx.body.is_required),bool(ctx.body.is_active)]
    : [access.tenantId,orgId,family,code,name,bool(ctx.body.is_required),bool(ctx.body.is_active)];
  const text=id
    ? `UPDATE erp_ledger_account_type
       SET ledger_family_code=$3,account_type_code=$4,account_type_name=$5,is_required=$6,is_active=$7
       WHERE tenant_id=$1 AND account_type_id=$2
       RETURNING *`
    : `INSERT INTO erp_ledger_account_type(tenant_id,organisation_id,ledger_family_code,account_type_code,account_type_name,is_required,is_seeded,is_active)
       VALUES($1,$2,$3,$4,$5,$6,false,$7)
       RETURNING *`;
  const r=await ctx.broker('core_erp','query',{text,values});
  if(!r.rowCount)return ctx.send(404,{error:'Ledger type not found'});
  return {ledger_type:r.rows[0]};
};
