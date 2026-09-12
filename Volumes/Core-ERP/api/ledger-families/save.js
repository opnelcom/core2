'use strict';
const {authTenant,requireAdmin,clean,bool}=require('../_shared/erp');
const {moduleIds,validateModules,replaceLinks}=require('../_shared/erp/modules');

function parseJson(value){
  const text=clean(value,'{}');
  try{return JSON.parse(text);}
  catch{return null;}
}

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);
  const orgId=ctx.body.organisation_id;
  const code=clean(ctx.body.ledger_family_code).toLowerCase().replace(/\s+/g,'_');
  const name=clean(ctx.body.family_name);
  const schema=parseJson(ctx.body.schema_json);
  const selectedModules=moduleIds(ctx.body);
  if(!orgId||!code||!name)return ctx.send(400,{error:'Organisation, subledger account type code and name are required'});
  if(!schema||Array.isArray(schema)||typeof schema!=='object')return ctx.send(400,{error:'Ledger family schema must be a valid JSON object'});
  const invalidModules=await validateModules(ctx,access,orgId,selectedModules);
  if(invalidModules)return ctx.send(invalidModules.status,invalidModules.body);
  const r=await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_ledger_family(tenant_id,organisation_id,ledger_family_code,family_name,requires_standard_account_type,requires_legal_entity,schema_json,is_active,is_seeded)
          VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,false)
          ON CONFLICT(tenant_id,organisation_id,ledger_family_code) DO UPDATE
          SET family_name=excluded.family_name,
              requires_standard_account_type=excluded.requires_standard_account_type,
              requires_legal_entity=excluded.requires_legal_entity,
              schema_json=excluded.schema_json,
              is_active=excluded.is_active,
              updated_at=now()
          RETURNING *`,
    values:[access.tenantId,orgId,code,name,bool(ctx.body.requires_standard_account_type),bool(ctx.body.requires_legal_entity),JSON.stringify(schema),bool(ctx.body.is_active)]
  });
  await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_subledger_account_type(tenant_id,organisation_id,type_code,type_name,requires_legal_entity,schema_json,is_active,is_seeded)
          VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,false)
          ON CONFLICT(tenant_id,organisation_id,type_code) DO UPDATE
          SET type_name=excluded.type_name,
              requires_legal_entity=excluded.requires_legal_entity,
              schema_json=excluded.schema_json,
              is_active=excluded.is_active,
              updated_at=now()`,
    values:[access.tenantId,orgId,code,name,bool(ctx.body.requires_legal_entity),JSON.stringify(schema),bool(ctx.body.is_active)]
  });
  await replaceLinks(ctx,access,orgId,{table:'erp_ledger_family_module',idColumn:'ledger_family_code',idValue:code,moduleIds:selectedModules,composite:true});
  return {ledger_family:r.rows[0]};
};
