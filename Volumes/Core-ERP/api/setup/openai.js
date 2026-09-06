'use strict';
const {authTenant,requireAdmin,clean}=require('../_shared/erp');
const {encryptKey,maskKey,loadOpenAISetting}=require('../_shared/openai-settings');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=clean(ctx.query.organisation_id||ctx.body.organisation_id);
  if(!orgId)return ctx.send(400,{error:'Organisation is required'});

  const org=await ctx.broker('core_erp','query',{
    text:`SELECT 1 FROM erp_organisation WHERE tenant_id=$1 AND organisation_id=$2 AND workflow_status <> 'deleted'`,
    values:[access.tenantId,orgId]
  });
  if(!org.rowCount)return ctx.send(404,{error:'Organisation not found'});

  if(ctx.req.method==='GET'){
    const setting=await loadOpenAISetting(ctx,access.tenantId,orgId);
    return {
      has_openai_api_key:!!setting?.api_key_ciphertext,
      openai_api_key_mask:maskKey(setting),
      model:setting?.model||'gpt-4.1-mini',
      updated_by_email:setting?.updated_by_email||null,
      updated_at:setting?.updated_at||null
    };
  }

  if(ctx.req.method!=='POST'&&ctx.req.method!=='PATCH')return ctx.send(405,{error:'GET, POST or PATCH required'});
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);

  const clear=ctx.body.clear_openai_api_key===true||ctx.body.clear_openai_api_key==='true';
  const model=clean(ctx.body.model)||'gpt-4.1-mini';
  const apiKey=clean(ctx.body.openai_api_key);
  if(!clear&&apiKey&&!apiKey.startsWith('sk-'))return ctx.send(400,{error:'OpenAI API key should start with sk-'});

  if(clear){
    const r=await ctx.broker('core_erp','query',{
      text:`INSERT INTO erp_organisation_openai_setting(tenant_id,organisation_id,api_key_ciphertext,api_key_iv,api_key_tag,model,updated_by_email)
            VALUES($1,$2,NULL,NULL,NULL,$3,$4)
            ON CONFLICT(tenant_id,organisation_id) DO UPDATE
            SET api_key_ciphertext=NULL,api_key_iv=NULL,api_key_tag=NULL,model=excluded.model,updated_by_email=excluded.updated_by_email,updated_at=now()
            RETURNING tenant_id,organisation_id,api_key_ciphertext,model,updated_by_email,updated_at`,
      values:[access.tenantId,orgId,model,access.auth.email]
    });
    return {setting:{has_openai_api_key:false,openai_api_key_mask:'',model:r.rows[0].model,updated_by_email:r.rows[0].updated_by_email,updated_at:r.rows[0].updated_at}};
  }

  if(apiKey){
    const encrypted=encryptKey(ctx,apiKey);
    const r=await ctx.broker('core_erp','query',{
      text:`INSERT INTO erp_organisation_openai_setting(
              tenant_id,organisation_id,api_key_ciphertext,api_key_iv,api_key_tag,model,updated_by_email
            )
            VALUES($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT(tenant_id,organisation_id) DO UPDATE
            SET api_key_ciphertext=excluded.api_key_ciphertext,
                api_key_iv=excluded.api_key_iv,
                api_key_tag=excluded.api_key_tag,
                model=excluded.model,
                updated_by_email=excluded.updated_by_email,
                updated_at=now()
            RETURNING tenant_id,organisation_id,api_key_ciphertext,model,updated_by_email,updated_at`,
      values:[access.tenantId,orgId,encrypted.api_key_ciphertext,encrypted.api_key_iv,encrypted.api_key_tag,model,access.auth.email]
    });
    return {setting:{has_openai_api_key:!!r.rows[0].api_key_ciphertext,openai_api_key_mask:'saved',model:r.rows[0].model,updated_by_email:r.rows[0].updated_by_email,updated_at:r.rows[0].updated_at}};
  }

  const r=await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_organisation_openai_setting(tenant_id,organisation_id,model,updated_by_email)
          VALUES($1,$2,$3,$4)
          ON CONFLICT(tenant_id,organisation_id) DO UPDATE
          SET model=excluded.model,updated_by_email=excluded.updated_by_email,updated_at=now()
          RETURNING tenant_id,organisation_id,api_key_ciphertext,model,updated_by_email,updated_at`,
    values:[access.tenantId,orgId,model,access.auth.email]
  });
  return {setting:{has_openai_api_key:!!r.rows[0].api_key_ciphertext,openai_api_key_mask:maskKey(r.rows[0]),model:r.rows[0].model,updated_by_email:r.rows[0].updated_by_email,updated_at:r.rows[0].updated_at}};
};
