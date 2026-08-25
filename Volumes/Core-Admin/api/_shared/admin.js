'use strict';
const crypto=require('crypto');
const {promisify}=require('util');
const scrypt=promisify(crypto.scrypt);

const userTypes=['standard_user','administration_user'];
const userStatuses=['pending','active','disabled'];
const tenantTypes=['personal_tenant','public_tenant'];
const tenantUserTypes=['owner','tenant_administrator','tenant_user'];
const rowStatuses=['active','disabled'];
const applicationTypes=['public_application','administration_application'];

function requireAdmin(ctx){
  const a=ctx.auth();
  if(!a||a.user_type!=='administration_user')return {status:403,body:{error:'Core administrator required'}};
  return {auth:a};
}

function clean(value){
  const v=String(value||'').trim();
  return v||null;
}

function cleanSvg(value){
  const raw=clean(value);
  const svg=raw&&raw.replace(/^\uFEFF/,'').replace(/^<\?xml[\s\S]*?\?>\s*/i,'').trim();
  if(!svg)return null;
  if(/<!doctype/i.test(svg))throw new Error('SVG icon cannot include a doctype');
  if(svg.length>20000)throw new Error('SVG icon must be 20KB or smaller');
  if(!/^<svg[\s>][\s\S]*<\/svg>$/.test(svg))throw new Error('SVG icon must be a complete <svg> element');
  if(/<(script|style|iframe|object|embed|foreignObject|link|meta)\b/i.test(svg))throw new Error('SVG icon contains unsupported elements');
  if(/\son[a-z]+\s*=/i.test(svg))throw new Error('SVG icon cannot include event handlers');
  if(/\sstyle\s*=/i.test(svg))throw new Error('SVG icon cannot include inline styles');
  if(/(?:href|src)\s*=\s*(['"])\s*(?!#|data:image\/)(?:javascript:|https?:|\/\/)/i.test(svg))throw new Error('SVG icon cannot reference external resources');
  if(/javascript\s*:/i.test(svg))throw new Error('SVG icon cannot include JavaScript URLs');
  return svg;
}

async function ensureApplicationColumns(ctx){
  await ctx.broker('core_saas','query',{text:`ALTER TABLE core_application ADD COLUMN IF NOT EXISTS application_description text`});
  await ctx.broker('core_saas','query',{text:`ALTER TABLE core_application ADD COLUMN IF NOT EXISTS application_icon_svg text`});
}

async function hashPassword(password){
  const salt=crypto.randomBytes(16).toString('hex');
  const key=await scrypt(password,salt,64);
  return `${salt}:${Buffer.from(key).toString('hex')}`;
}

module.exports={requireAdmin,clean,cleanSvg,ensureApplicationColumns,hashPassword,userTypes,userStatuses,tenantTypes,tenantUserTypes,rowStatuses,applicationTypes};
