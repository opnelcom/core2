'use strict';

// Shared HTTP client for identity and current-tenant membership only.
// Application permissions remain the responsibility of the calling application.
async function tenantSession(ctx, fetchImpl = fetch) {
  const tenantId = ctx.cookies.current_tenant;
  let response, session;
  try {
    response = await fetchImpl((ctx.config.saasURL || 'http://core-saas:3000') + '/api/auth/session', {
      method: 'GET',
      headers: {cookie: ctx.req.headers.cookie || ''},
      signal: AbortSignal.timeout(10000),
      redirect: 'error'
    });
    if (!response.ok) throw new Error('SaaS session request failed');
    session = await response.json();
    if (!session || typeof session !== 'object' || Array.isArray(session))
      throw new Error('Invalid SaaS session response');
  } catch {
    return {status:503, body:{error:'Unable to verify tenant membership. Try again.'}};
  }
  if (session.authenticated !== true || !session.user?.user_id || !session.user?.email)
    return {status:401, body:{error:'Authentication required'}};
  if (!tenantId) return {status:400, body:{error:'No current tenant'}};
  if (session.current_tenant !== tenantId)
    return {status:403, body:{error:'No access to active tenant'}};
  // Deliberately omit SaaS roles, user type and application assignments.
  const {user_id, email, known_name, full_name} = session.user;
  return {tenantId, auth:{user_id, email, known_name, full_name}};
}

module.exports = {tenantSession};
