'use strict';
const nodeCrypto=require('crypto');
const {clean}=require('./erp');

function secret(ctx){
  const value=process.env.OPENAI_TENANT_SECRET||ctx.config.openaiTenantSecret||ctx.config.sessionSecret;
  return nodeCrypto.createHash('sha256').update(String(value||'erp-development-secret')).digest();
}

function encryptKey(ctx,value){
  const text=clean(value);
  if(!text)return null;
  const iv=nodeCrypto.randomBytes(12);
  const cipher=nodeCrypto.createCipheriv('aes-256-gcm',secret(ctx),iv);
  const ciphertext=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);
  return {
    api_key_ciphertext:ciphertext.toString('base64'),
    api_key_iv:iv.toString('base64'),
    api_key_tag:cipher.getAuthTag().toString('base64')
  };
}

function decryptKey(ctx,row){
  if(!row?.api_key_ciphertext||!row?.api_key_iv||!row?.api_key_tag)return null;
  const decipher=nodeCrypto.createDecipheriv(
    'aes-256-gcm',
    secret(ctx),
    Buffer.from(row.api_key_iv,'base64')
  );
  decipher.setAuthTag(Buffer.from(row.api_key_tag,'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(row.api_key_ciphertext,'base64')),
    decipher.final()
  ]).toString('utf8');
}

function maskKey(row){
  if(!row?.api_key_ciphertext)return '';
  return 'saved';
}

async function loadOpenAISetting(ctx,tenantId,organisationId){
  if(!organisationId)return null;
  const r=await ctx.broker('core_erp','query',{
    text:`SELECT tenant_id,organisation_id,api_key_ciphertext,api_key_iv,api_key_tag,model,updated_by_email,updated_at
          FROM erp_organisation_openai_setting
          WHERE tenant_id=$1 AND organisation_id=$2`,
    values:[tenantId,organisationId]
  });
  return r.rows[0]||null;
}

module.exports={encryptKey,decryptKey,maskKey,loadOpenAISetting};
