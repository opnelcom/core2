'use strict';
const math = require('../../../public/exchange-rate-math');
const {randomUUID}=require('node:crypto');
const {createTransactionPlan}=require('./transaction-plan');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validUuid = value => typeof value === 'string' && uuid.test(value);
const fail = (status, message) => Object.assign(new Error(message), { status });
function validateRate(input) {
  const { tenantId, organisationId, email, id, from, to, effectiveFrom, revision, reason } = input || {};
  if (![tenantId, organisationId].every(validUuid) || !email)
    throw fail(400, 'Valid organisation and tenant identifiers are required');
  if (id && !validUuid(id)) throw fail(400, 'Invalid exchange rate identifier');
  if (![from, to].every(value => typeof value === 'string' && /^[A-Z]{3}$/.test(value)) || from === to)
    throw fail(400, 'Choose two different defined currencies');
  if (typeof effectiveFrom !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) || effectiveFrom < '0001-01-01' ||
      !Number.isFinite(Date.parse(effectiveFrom)) || new Date(effectiveFrom).toISOString().slice(0, 10) !== effectiveFrom)
    throw fail(400, 'Enter a valid effective date');
  let rate;
  try { rate = math.normalise(input.rate); } catch (error) { throw fail(400, error.message); }
  if (id && (!Number.isSafeInteger(revision) || revision < 1)) throw fail(400, 'A saved revision is required');
  if (id && (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 1000))
    throw fail(400, 'A correction reason of at most 1000 characters is required');
  return { tenantId, organisationId, email, id, from, to, effectiveFrom, rate, revision, reason: id ? reason.trim() : null };
}

// ERP owns validation and preparation; the final SQL batch rechecks its read inputs.
async function executeExchangeRateSave(client, input, plan = null) {
  const value = validateRate(input);
  const { tenantId, organisationId, email, id, from, to, effectiveFrom, rate, revision, reason } = value;
  const scope = [tenantId, organisationId];
  const organisation = await client.query('SELECT organisation_id FROM erp_organisation WHERE tenant_id=$1 AND organisation_id=$2 FOR UPDATE', scope);
  if (!organisation.rows.length) throw fail(404, 'Organisation not found');
  const admin = await client.query(`SELECT 1 FROM erp_user_role ur JOIN erp_role r ON r.role_id=ur.role_id
    WHERE ur.tenant_id=$1 AND ur.organisation_id=$2 AND lower(ur.email)=lower($3)
      AND r.is_admin=true AND r.is_active=true AND ur.valid_from<=CURRENT_DATE
      AND (ur.valid_to IS NULL OR ur.valid_to>=CURRENT_DATE)`, [...scope, email]);
  if (!admin.rows.length) throw fail(403, 'Administrator access required');
  const currencies = await client.query(`SELECT currency_code FROM erp_currency WHERE tenant_id=$1 AND organisation_id=$2
    AND currency_code IN ($3,$4) AND is_active=true ORDER BY currency_code FOR SHARE`, [...scope, from, to]);
  if (currencies.rows.length !== 2) throw fail(400, 'Both currencies must be active and defined in this organisation');
  let previous = null;
  if (id) {
    const selected = await client.query(`SELECT *,effective_from::text AS effective_from FROM erp_exchange_rate
      WHERE tenant_id=$1 AND organisation_id=$2 AND exchange_rate_id=$3 FOR UPDATE`, [...scope, id]);
    previous = selected.rows[0];
    if (!previous) throw fail(404, 'Exchange rate not found');
    if (previous.from_currency_code !== from || previous.to_currency_code !== to || previous.effective_from !== effectiveFrom)
      throw fail(400, 'The currency pair and effective date cannot be changed; create a new entry');
    if (previous.revision !== revision) throw fail(409, 'This rate was changed by another administrator. Reopen it before correcting it');
    if (math.normalise(previous.rate) === rate) throw fail(400, 'Change the rate before saving a correction');
  } else {
    const duplicate = await client.query(`SELECT 1 FROM erp_exchange_rate WHERE tenant_id=$1 AND organisation_id=$2
      AND least(from_currency_code,to_currency_code)=least($3::text,$4::text)
      AND greatest(from_currency_code,to_currency_code)=greatest($3::text,$4::text) AND effective_from=$5::date`, [...scope, from, to, effectiveFrom]);
    if (duplicate.rows.length) throw fail(409, 'A rate already exists for this pair and date, including the reverse direction. Correct the existing entry');
  }
  const rateId=id||randomUUID();
  const statement=id
    ? {text:`UPDATE erp_exchange_rate SET rate=$4,revision=revision+1,updated_by_email=$5,updated_at=now()
        WHERE tenant_id=$1 AND organisation_id=$2 AND exchange_rate_id=$3 RETURNING *,effective_from::text AS effective_from`,values:[...scope,id,rate,email],expectedRowCount:1}
    : {text:`INSERT INTO erp_exchange_rate(exchange_rate_id,tenant_id,organisation_id,from_currency_code,to_currency_code,effective_from,rate,created_by_email,updated_by_email)
        VALUES($8,$1,$2,$3,$4,$5,$6,$7,$7) RETURNING *,effective_from::text AS effective_from`,values:[...scope,from,to,effectiveFrom,rate,email,rateId],expectedRowCount:1};
  const saved=plan?plan.write(statement,{rows:[{exchange_rate_id:rateId,revision:previous?previous.revision+1:1,rate}],rowCount:1}):await client.query(statement.text,statement.values);
  const row = saved.rows[0];
  await client.query(`INSERT INTO erp_exchange_rate_change(tenant_id,organisation_id,exchange_rate_id,revision,previous_rate,rate,reason,changed_by_email)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [...scope, row.exchange_rate_id, row.revision, previous?.rate || null, row.rate, reason, email]);
  return [{ rows: [row], rowCount: 1, command: id ? 'UPDATE' : 'INSERT' }];
}
async function saveExchangeRate(ctx,input){
  const plan=createTransactionPlan(ctx,['erp_exchange_rate','erp_exchange_rate_change']);
  await executeExchangeRateSave(plan.client,input,plan);
  const result=await plan.commit();return result.results[0].rows[0];
}
module.exports = { validUuid, validateRate, executeExchangeRateSave, saveExchangeRate };
