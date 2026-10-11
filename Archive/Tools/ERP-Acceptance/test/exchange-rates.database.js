'use strict';
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..'), erp = path.join(root, 'Volumes/Core-ERP');
const { saveExchangeRate } = require(path.join(erp,'api/_shared/erp/exchange-rates'));
const id = n => `10000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
(async () => {
  const db = new PGlite();
  try {
    const schema = fs.readFileSync(path.join(erp,'schema/erp-schema.sql'),'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;','');
    await db.exec(schema); await db.exec(schema);
    await db.query(`INSERT INTO erp_organisation(organisation_id,tenant_id,organisation_code,organisation_name) VALUES($1,$2,'TEST','Test'),($3,$2,'OTHER','Other')`,[id(2),id(1),id(3)]);
    await db.query(`INSERT INTO erp_role(role_id,tenant_id,organisation_id,role_code,role_name,is_admin,is_active) VALUES($1,$2,$3,'ADMIN','Administrator',true,true)`,[id(4),id(1),id(2)]);
    await db.query(`INSERT INTO erp_user_role(tenant_id,organisation_id,role_id,email,valid_from) VALUES($1,$2,$3,'admin@example.com','2020-01-01')`,[id(1),id(2),id(4)]);
    await db.query(`INSERT INTO erp_currency(tenant_id,organisation_id,currency_code,currency_name,is_active) VALUES($1,$2,'USD','US Dollar',true),($1,$2,'ZAR','Rand',true),($1,$2,'EUR','Euro',true),($1,$2,'GBP','Pound',false)`,[id(1),id(2)]);
    const query=async(text,values)=>{const r=await db.query(text,values);return {...r,rowCount:Math.max(r.affectedRows??0,r.rows.length)};};
    let rejectAudit = false; const traces=[];
    const client={query:async(text,values)=>{traces.push(text);if(rejectAudit&&text.includes('INSERT INTO erp_exchange_rate_change'))throw new Error('Audit fixture failure');return query(text,values);},release:()=>{}};
    const scope={module:{exports:{}},require:name=>name==='../_shared/broker'?{brokerConfig:()=>({}),authorize:()=>({profile:{name:'core_erp'}}),poolFor:()=>({connect:async()=>client}),recordProfileMetric:()=>{},summarizeSql:text=>text}:require(name)};
    vm.createContext(scope); vm.runInContext(fs.readFileSync(path.join(root,'Volumes/Core-Broker/api/broker/transaction.js'),'utf8'),scope);
    let beforeBatch=null;
    const adapter={broker:async(profile,action,args)=>{
      assert.equal(args.operation,undefined);
      if(action==='query')return query(args.text,args.values);
      if(beforeBatch){const task=beforeBatch;beforeBatch=null;await task();}
      return scope.module.exports({req:{method:'POST'},body:{brokerProfile:profile,...args},logger:{info:()=>{},warn:()=>{},error:()=>{}},send:(status,body)=>({status,body})});
    }};
    const save=value=>saveExchangeRate(adapter,value);
    const input={tenantId:id(1),organisationId:id(2),email:'admin@example.com',from:'USD',to:'ZAR',effectiveFrom:'2026-10-11',rate:'18.5'};
    const first=await save(input); assert.equal(first.rate,'18.50000000'); assert.equal(first.revision,1);
    const corrected=await save({...input,id:first.exchange_rate_id,revision:1,rate:'18.6',reason:'Corrected quote'});
    assert.equal(corrected.revision,2);
    const changes=(await db.query('SELECT * FROM erp_exchange_rate_change ORDER BY revision')).rows;
    assert.equal(changes.length,2);assert.equal(changes[1].previous_rate,'18.50000000');assert.equal(changes[1].reason,'Corrected quote');
    for(const patch of [{from:'ZAR',to:'USD',rate:'0.05'},{}, {id:first.exchange_rate_id,revision:1,rate:'19',reason:'Stale'}])
      await assert.rejects(()=>save({...input,...patch}),e=>e.status===409);
    await assert.rejects(()=>save({...input,id:first.exchange_rate_id,revision:2,rate:'19',effectiveFrom:'2026-10-12',reason:'Moved'}),e=>e.status===400);
    await assert.rejects(()=>save({...input,id:first.exchange_rate_id,revision:2,rate:'18.6',reason:'No-op'}),e=>e.status===400);
    for(const patch of [{from:'GBP'}, {from:'JPY'}, {organisationId:id(3)}, {tenantId:id(9)}, {email:'reader@example.com'}])
      await assert.rejects(()=>save({...input,effectiveFrom:'2026-10-12',...patch}),e=>[400,403,404].includes(e.status));
    await save({...input,from:'EUR',rate:'20.25'});
    await save({...input,from:'ZAR',to:'USD',effectiveFrom:'2026-10-01',rate:'0.054'});
    rejectAudit=true;
    await assert.rejects(()=>save({...input,id:first.exchange_rate_id,revision:2,rate:'19',reason:'Rollback'}),/Audit fixture failure/);
    assert.equal((await db.query('SELECT rate,revision FROM erp_exchange_rate WHERE exchange_rate_id=$1',[first.exchange_rate_id])).rows[0].revision,2);
    assert.equal((await db.query('SELECT count(*)::int n FROM erp_exchange_rate_change')).rows[0].n,4);
    rejectAudit=false;
    // A second administrator commits after preparation but before submission.
    // The stale prepared batch must reject before any of its writes.
    beforeBatch=()=>save({...input,id:first.exchange_rate_id,revision:2,rate:'18.7',reason:'Concurrent correction'});
    await assert.rejects(()=>save({...input,id:first.exchange_rate_id,revision:2,rate:'19',reason:'Stale prepared save'}),e=>e.status===409);
    assert.equal((await db.query('SELECT rate FROM erp_exchange_rate WHERE exchange_rate_id=$1',[first.exchange_rate_id])).rows[0].rate,'18.70000000');
    // Database integrity protects direct inserts as well as server operations.
    await assert.rejects(()=>db.query(`INSERT INTO erp_exchange_rate(tenant_id,organisation_id,from_currency_code,to_currency_code,effective_from,rate,created_by_email,updated_by_email) VALUES($1,$2,'ZAR','USD','2026-10-11',1,'x','x')`,[id(1),id(2)]),e=>e.code==='23505');
    assert.ok(traces.includes('ROLLBACK')); assert.ok(traces.includes('COMMIT'));
    // Exercise the actual API-to-Broker shape and scoped list/history SQL.
    const ctx={req:{method:'POST'},body:{organisation_id:id(2),from_currency_code:'EUR',to_currency_code:'USD',effective_from:'2026-10-11',rate:'1.1'},
      query:{organisation_id:id(2)},cookies:{current_tenant:id(1)},tenantSession:async function(){const auth=this.auth();return auth?{auth,tenantId:this.cookies.current_tenant}:{status:401,body:{error:"Authentication required"}};},auth:()=>({email:'admin@example.com'}),send:(status,body)=>({status,body}),
      broker:async(profile,action,args)=>{
        if(profile==="core_saas")throw new Error("Applications must not query SaaS tables");
        if(action==='transaction')return scope.module.exports({req:{method:'POST'},body:{brokerProfile:profile,...args},logger:{info:()=>{},warn:()=>{},error:()=>{}},send:ctx.send});
        return query(args.text,args.values);
      }};
    const created=await require(path.join(erp,'api/exchange-rates/save'))(ctx);
    assert.ok(created.exchange_rate,JSON.stringify(created));assert.equal(created.exchange_rate.rate,'1.10000000');
    ctx.req.method='GET';ctx.body={};
    const listed=await require(path.join(erp,'api/exchange-rates/list'))(ctx);assert.equal(listed.exchange_rates.length,4);
    ctx.query.exchange_rate_id=created.exchange_rate.exchange_rate_id;
    const audited=await require(path.join(erp,'api/exchange-rates/history'))(ctx);assert.equal(audited.changes.length,1);
    ctx.query.exchange_rate_id=id(999);assert.equal((await require(path.join(erp,'api/exchange-rates/history'))(ctx)).changes.length,0);
    ctx.query.organisation_id=id(3);assert.equal((await require(path.join(erp,'api/exchange-rates/list'))(ctx)).status,403);
    await db.query('DELETE FROM erp_organisation WHERE organisation_id=$1',[id(2)]);
    assert.equal((await db.query('SELECT count(*)::int n FROM erp_exchange_rate_change')).rows[0].n,0);
    console.log('Exchange rates database: migration, pairs, corrections, permissions, stale revisions, rollback and cascade passed');
  } finally { await db.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
