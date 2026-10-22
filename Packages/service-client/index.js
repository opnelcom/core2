'use strict';
const fail = message => Object.assign(new Error(message), {status:500});
function baseUrl(config, key) {
  const value = config[key];
  let url;
  try { url = new URL(value); } catch { throw fail(key + ' must be configured'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw fail(key + ' must use HTTP or HTTPS');
  return value.replace(/\/$/, '');
}
async function post(url, key, payload, timeoutMs = 30000, fetchImpl = fetch) {
  let response, result;
  try {
    response = await fetchImpl(url, {method:'POST', headers:{'content-type':'application/json','x-core-key':key},
      body:JSON.stringify(payload), signal:AbortSignal.timeout(timeoutMs), redirect:'error'});
    result = await response.json();
  } catch { throw Object.assign(new Error('Service unavailable'), {status:503}); }
  if (!response.ok) throw Object.assign(new Error(result.error || 'Service request failed'), {status:response.status, details:result});
  return result;
}
function brokerClient(config, fetchImpl = fetch) {
  return async (profile, action, payload = {}) => {
    const url = baseUrl(config, 'dbBrokerURL');
    const brokerProfile = profile || payload.brokerProfile || config.dbBrokerProfile;
    if (!brokerProfile) throw fail('DB broker profile required');
    const entry = Array.isArray(config.dbBrokerProfiles) ? config.dbBrokerProfiles.find(x => x?.name === brokerProfile) : null;
    const key = payload.brokerKey || entry?.key || config.dbBrokerKey;
    if (!key) throw fail('DB broker key required');
    const {brokerKey, brokerProfile:ignored, ...data} = payload;
    return post(url + '/api/broker/' + action, key, {brokerProfile,...data}, config.serviceTimeoutMs, fetchImpl);
  };
}
function smtpClient(config, fetchImpl = fetch) {
  return async (action, payload = {}) => {
    const url = baseUrl(config, 'smtpUrl');
    if (!payload.profile) throw fail('SMTP profile required');
    const key = payload.profileKey || config.smtpProfileKey;
    if (!key) throw fail('SMTP profile key required');
    const {profileKey, ...data} = payload;
    return post(url + '/api/mail/' + action, key, data, config.serviceTimeoutMs, fetchImpl);
  };
}
function withServices(handler) {
  return ctx => {
    ctx.broker ||= brokerClient(ctx.config);
    ctx.smtp ||= smtpClient(ctx.config);
    return handler(ctx);
  };
}
module.exports = {brokerClient, smtpClient, withServices};
