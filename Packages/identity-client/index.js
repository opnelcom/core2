'use strict';

const fail = (status, message) => Object.assign(new Error(message), {status});

function settings(ctx) {
  const config = ctx.config.identity;
  if (!config || typeof config.url !== 'string') throw fail(503, 'Identity service is not configured');
  let url;
  try { url = new URL(config.url); } catch { throw fail(503, 'Invalid identity service URL'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw fail(503, 'Invalid identity service URL');
  const timeoutMs = config.timeoutMs ?? 10000;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw fail(503, 'Invalid identity service timeout');
  return {url: config.url.replace(/\/$/, ''), timeoutMs};
}

async function request(ctx, endpoint, fetchImpl = fetch) {
  const config = settings(ctx);
  try {
    const response = await fetchImpl(config.url + endpoint, {
      method: 'GET', headers: {cookie: ctx.req.headers.cookie || ''},
      signal: AbortSignal.timeout(config.timeoutMs), redirect: 'error'
    });
    if (!response.ok) throw new Error('Identity request failed');
    return await response.json();
  } catch { throw fail(503, 'Unable to verify identity. Try again.'); }
}

async function session(ctx, fetchImpl = fetch) {
  const data = await request(ctx, '/api/auth/session', fetchImpl);
  if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.authenticated !== 'boolean')
    throw fail(503, 'Invalid identity response');
  if (data.authenticated && (!data.user || typeof data.user.user_id !== 'string' || !data.user.user_id ||
      typeof data.user.email !== 'string' || !data.user.email)) throw fail(503, 'Invalid identity response');
  return data;
}

async function requireUser(ctx, fetchImpl = fetch) {
  const result = await session(ctx, fetchImpl);
  if (!result.authenticated) throw fail(401, 'Authentication required');
  return result.user;
}

async function tenantSession(ctx, fetchImpl = fetch) {
  let result;
  try { result = await session(ctx, fetchImpl); }
  catch (error) { return {status: error.status || 503, body: {error: error.message}}; }
  if (!result.authenticated) return {status:401, body:{error:'Authentication required'}};
  const tenantId = ctx.cookies.current_tenant;
  if (!tenantId) return {status:400, body:{error:'No current tenant'}};
  if (result.current_tenant !== tenantId) return {status:403, body:{error:'No access to active tenant'}};
  const {user_id, email, known_name, full_name} = result.user;
  return {tenantId, auth:{user_id, email, known_name, full_name}};
}

async function requireApplication(ctx, code, fetchImpl = fetch) {
  const result = await request(ctx, '/api/application/list', fetchImpl);
  if (!Array.isArray(result?.applications)) throw fail(503, 'Invalid application access response');
  if (!result.applications.some(app => app.application_code === code)) throw fail(403, 'Application access required');
}

// Application middleware, installed by each consumer; the HTTP Runtime never loads it.
function withIdentity(handler) {
  return async ctx => {
    const local = ctx;
    let checkedSession;
    local.auth = ctx.auth || (async () => {
      checkedSession ??= session(local);
      const result = await checkedSession;
      return result.authenticated ? result.user : null;
    });
    local.tenantSession = ctx.tenantSession || (() => tenantSession(local));
    return handler(local);
  };
}

module.exports = {session, requireUser, tenantSession, requireTenant:tenantSession, requireApplication, withIdentity};
