'use strict';
const {session:readSession,requireApplication} = require('@core/identity-client');

// Delegate identity and launcher permissions to SaaS over HTTP.
async function requireAccess(ctx, options = {}) {
  const methods = options.methods || ['POST'];
  if (!methods.includes(ctx.req.method)) throw Object.assign(new Error(methods.join(', ') + ' required'), {status:405});
  const session = await readSession(ctx);
  const label = options.applicationLabel || 'Data Migration';
  if (!session.authenticated) throw Object.assign(new Error('Sign in to use ' + label), {status:401});
  await requireApplication(ctx, options.applicationCode || 'core-data-migration');
  ctx.res.setHeader('cache-control', 'no-store');
  if (options.requireTenant) {
    if (!ctx.cookies.current_tenant) throw Object.assign(new Error('Select an active tenant'), {status:400});
    if (session.current_tenant !== ctx.cookies.current_tenant)
      throw Object.assign(new Error('No access to active tenant'), {status:403});
  }
  return session;
}
module.exports = {requireAccess};
