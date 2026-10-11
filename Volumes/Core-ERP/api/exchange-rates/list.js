'use strict';
const { authTenant, requireAdmin } = require('../_shared/erp');
const { validUuid } = require('../_shared/erp/exchange-rates');
module.exports = async ctx => {
  if (ctx.req.method !== 'GET') return ctx.send(405, { error: 'GET required' });
  if (!validUuid(ctx.query?.organisation_id)) return ctx.send(400, { error: 'Valid organisation_id required' });
  const access = await authTenant(ctx);
  if (access.status) return ctx.send(access.status, access.body);
  const denied = requireAdmin(access);
  if (denied) return ctx.send(denied.status, denied.body);
  const result = await ctx.broker('core_erp', 'query', {
    text: `SELECT r.*,r.effective_from::text AS effective_from FROM erp_exchange_rate r WHERE r.tenant_id=$1 AND r.organisation_id=$2
      ORDER BY r.effective_from DESC,r.from_currency_code,r.to_currency_code`,
    values: [access.tenantId, access.organisationId]
  });
  return { exchange_rates: result.rows };
};
