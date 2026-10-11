'use strict';
class ErpClient {
  constructor(baseUrl, cookie = '') {
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Use an HTTP(S) ERP origin');
    this.baseUrl = url.origin; this.cookies = new Map();
    for (const pair of cookie.split(';')) { const i = pair.indexOf('='); if (i > 0) this.cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim()); }
  }
  async request(endpoint, method = 'GET', data = {}) {
    if (!/^\/(?:erp\/api\/|api\/auth\/)[a-z0-9/-]+$/.test(endpoint)) throw new Error('Unsupported ERP endpoint');
    const url = new URL(endpoint, this.baseUrl);
    if (method === 'GET') for (const [k, v] of Object.entries(data)) if (v != null) url.searchParams.set(k, String(v));
    const response = await fetch(url, { method, redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { 'content-type': 'application/json', cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ') },
      body: method === 'GET' ? undefined : JSON.stringify(data) });
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';')[0], i = pair.indexOf('='); this.cookies.set(pair.slice(0, i), pair.slice(i + 1)); }
    const raw = await response.text(); let body;
    try { body = JSON.parse(raw); } catch { throw new Error(`ERP returned non-JSON (${response.status}) at ${endpoint}`); }
    if (!response.ok) { const error = new Error(body.error || `ERP HTTP ${response.status}`); error.status = response.status; error.endpoint = endpoint; throw error; }
    return body;
  }
  async login(email, password, tenant) {
    const result = await this.request('/api/auth/login', 'POST', { email, password });
    if (tenant) this.cookies.set('current_tenant', tenant);
    const bootstrap = await this.request('/erp/api/setup/bootstrap');
    return { email: result.user.email, tenant: bootstrap.tenant_id };
  }
}
module.exports = { ErpClient };
