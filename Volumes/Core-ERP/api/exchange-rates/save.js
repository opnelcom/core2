'use strict';
const { authTenant, requireAdmin } = require('../_shared/erp');
const { validUuid, validateRate, saveExchangeRate } = require('../_shared/erp/exchange-rates');
module.exports = async ctx => {
  if (ctx.req.method !== 'POST') return ctx.send(405, { error: 'POST required' });
  if (!validUuid(ctx.body?.organisation_id)) return ctx.send(400, { error: 'Valid organisation_id required' });
  const access = await authTenant(ctx);
  if (access.status) return ctx.send(access.status, access.body);
  const denied = requireAdmin(access);
  if (denied) return ctx.send(denied.status, denied.body);
  const body = ctx.body;
  let exchangeRate;
  try {
    exchangeRate = validateRate({ tenantId: access.tenantId, organisationId: body.organisation_id,
      email: access.auth.email, id: body.exchange_rate_id || null, from: body.from_currency_code,
      to: body.to_currency_code, effectiveFrom: body.effective_from, rate: body.rate,
      revision: body.revision, reason: body.reason });
  } catch (error) { return ctx.send(error.status || 400, { error: error.message }); }
  return { exchange_rate: await saveExchangeRate(ctx,exchangeRate) };
};
