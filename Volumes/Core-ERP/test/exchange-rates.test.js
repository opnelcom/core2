'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const math = require('../public/exchange-rate-math');
const { validateRate } = require('../api/_shared/erp/exchange-rates');
const id = n => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const input = { tenantId: id(1), organisationId: id(2), email: 'admin@example.com', from: 'USD', to: 'ZAR', effectiveFrom: '2026-10-11', rate: '18.5' };
test('exact decimal normalisation and reciprocal without binary floating point', () => {
  assert.equal(math.normalise('18.5'), '18.50000000');
  assert.equal(math.reciprocal('18.5'), '0.05405405');
  assert.equal(math.reciprocal('0.00000001'), '100000000.00000000');
  assert.equal(math.normalise('99999999999999999999.99999999'), '99999999999999999999.99999999');
  assert.equal(math.reciprocal('99999999999999999999.99999999'), '< 0.00000001');
  for (const value of ['0', '-1', '1e2', 'NaN', '1.000000001', '100000000000000000000', '1,20', 'Infinity', 18.5, null]) assert.throws(() => math.normalise(value));
});
test('calendar dates, pair, identifiers and correction reasons are validated', () => {
  assert.equal(validateRate(input).rate, '18.50000000');
  for (const patch of [{from:'USD',to:'USD'}, {from:'usd'}, {effectiveFrom:'2026-02-30'}, {effectiveFrom:'2025-02-29'}, {organisationId:'bad'}, {id:'bad'}, {rate:18.5}])
    assert.throws(() => validateRate({...input,...patch}), e => e.status === 400);
  assert.equal(validateRate({...input,effectiveFrom:'2024-02-29'}).effectiveFrom,'2024-02-29');
  for (const patch of [{revision:0,reason:'Correction'}, {revision:1,reason:''}, {revision:1,reason:' '.repeat(3)}, {revision:1,reason:'x'.repeat(1001)}])
    assert.throws(() => validateRate({...input,id:id(3),...patch}), e => e.status === 400);
  assert.equal(validateRate({...input,id:id(3),revision:1,reason:' Correction '}).reason, 'Correction');
});
test('API denies non-administrators before reading rates or requesting a transaction', async () => {
  let reads = 0;
  const ctx = { req:{method:'GET'},query:{organisation_id:id(2)},body:{organisation_id:id(2)},
    cookies:{current_tenant:id(1)},tenantSession:async function(){const auth=this.auth();return auth?{auth,tenantId:this.cookies.current_tenant}:{status:401,body:{error:"Authentication required"}};},auth:()=>({email:'user@example.com'}),send:(status,body)=>({status,body}),
    broker: async (profile, action, args) => {
      if(profile==="core_saas")throw new Error("Applications must not query SaaS tables");
      if(args.text.includes('FROM erp_organisation_user'))return {rows:[{}],rowCount:1};
      if(args.text.includes('role.is_admin=true'))return {rows:[],rowCount:0};
      reads++; throw new Error('Unauthorised read');
    } };
  for(const endpoint of ['list','history','save']) {
    ctx.req.method=endpoint==='save'?'POST':'GET';
    assert.equal((await require(`../api/exchange-rates/${endpoint}`)(ctx)).status,403);
  }
  assert.equal(reads,0);
});
