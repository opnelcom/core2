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
  const id = ctx.query.exchange_rate_id;
  if (!validUuid(id))
    return ctx.send(400, { error: 'Valid exchange_rate_id required' });
  const result = await ctx.broker('core_erp', 'query', {
    text: `SELECT revision,previous_rate,rate,reason,changed_by_email,changed_at FROM erp_exchange_rate_change
      WHERE tenant_id=$1 AND organisation_id=$2 AND exchange_rate_id=$3 ORDER BY revision DESC`,
    values: [access.tenantId, access.organisationId, id]
  });
  return { changes: result.rows };
};
