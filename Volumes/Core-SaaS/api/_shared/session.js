'use strict';
const crypto = require('node:crypto');
function secret(config) {
  if (typeof config.sessionSecret !== 'string' || !config.sessionSecret.trim() || config.sessionSecret === 'change-me')
    throw Object.assign(new Error('SaaS sessionSecret must be configured securely'), {status:503});
  return config.sessionSecret;
}
function auth(ctx) {
  const key = secret(ctx.config);
  const token = ctx.cookies.core_session;
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payload, signature] = parts;
    const expected = crypto.createHmac('sha256', key).update(payload).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!data || !Number.isFinite(data.exp) || data.exp <= Date.now() || !data.user_id || !data.email) return null;
    return data;
  } catch { return null; }
}
function signSession(config, data, options = {}) {
  const maxAge = Number(options.maxAgeSeconds ?? config.sessionMaxAgeSeconds ?? 60*60*24*30);
  if (!Number.isInteger(maxAge) || maxAge <= 0) throw new Error('Invalid session lifetime');
  const payload = Buffer.from(JSON.stringify({...data, exp:Date.now()+maxAge*1000})).toString('base64url');
  const signature = crypto.createHmac('sha256', secret(config)).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
function withSession(handler) {
  return ctx => {
    const local = ctx;
    local.auth = ctx.auth || (() => auth(local));
    local.signSession = ctx.signSession || ((data, options) => signSession(local.config, data, options));
    return handler(local);
  };
}
module.exports = {auth, signSession, withSession};
