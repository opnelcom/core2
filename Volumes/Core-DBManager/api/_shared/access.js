'use strict';

// Delegate identity and launcher permissions to SaaS over HTTP.
async function requireAccess(ctx, options = {}) {
  const methods = options.methods || ['POST'];
  if (!methods.includes(ctx.req.method)) throw Object.assign(new Error(methods.join(', ') + ' required'), {status:405});
  const headers = {cookie: ctx.req.headers.cookie || ''};
  const base = ctx.config.saasURL || 'http://core-saas:3000';
  const sessionResponse = await fetch(base + '/api/auth/session', {headers, signal:AbortSignal.timeout(10000)});
  if (!sessionResponse.ok) throw Object.assign(new Error('Session check unavailable'), {status:503});
  const session = await sessionResponse.json();
  const label = options.applicationLabel || 'Data Migration';
  if (!session.authenticated) throw Object.assign(new Error('Sign in to use ' + label), {status:401});
  const response = await fetch(base + '/api/application/list', {headers, signal:AbortSignal.timeout(10000)});
  if (!response.ok) throw Object.assign(new Error('Application access check unavailable'), {status:503});
  const result = await response.json();
  if (!result.applications?.some(app => app.application_code === (options.applicationCode || 'core-data-migration'))) {
    throw Object.assign(new Error(label + ' application access required'), {status:403});
  }
  ctx.res.setHeader('cache-control', 'no-store');
  if (options.requireTenant && !session.current_tenant) throw Object.assign(new Error('Select an active tenant'), {status:400});
  return session;
}
module.exports = {requireAccess};
