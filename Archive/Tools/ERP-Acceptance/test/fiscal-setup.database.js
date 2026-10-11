"use strict";
const {PGlite}=require("@electric-sql/pglite"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict");
const root=path.resolve(__dirname,"../../.."),erp=path.join(root,"Volumes/Core-ERP");
const id=n=>`10000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
(async()=>{const db=new PGlite();try{
 await db.exec(fs.readFileSync(path.join(erp,'schema/erp-schema.sql'),'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',''));
 await db.query("INSERT INTO erp_organisation(organisation_id,tenant_id,organisation_code,organisation_name) VALUES($1,$2,'TEST','Test'),($3,$2,'OTHER','Other')",[id(2),id(1),id(3)]);
 await db.query("INSERT INTO erp_division(division_id,tenant_id,organisation_id,division_code,division_name) VALUES($1,$2,$3,'TOP','Top')",[id(4),id(1),id(2)]);
 const query=async(text,values)=>{const r=await db.query(text,values);return {...r,rowCount:Math.max(r.affectedRows??0,r.rows.length)};};
 const traces=[];const client={query:async(text,values)=>{traces.push(text);return query(text,values);},release:()=>{}};
 const scope={module:{exports:{}},require:name=>{assert.equal(name,'../_shared/broker','Broker must not import ERP code');return {brokerConfig:()=>({}),authorize:()=>({profile:{name:'core_erp'}}),poolFor:()=>({connect:async()=>client}),recordProfileMetric:()=>{},summarizeSql:text=>text};}};
 vm.createContext(scope);vm.runInContext(fs.readFileSync(path.join(root,'Volumes/Core-Broker/api/broker/transaction.js'),'utf8'),scope);
 let admin=true,transactions=0;
 const ctx={req:{method:'POST'},body:{organisation_id:id(2)},cookies:{current_tenant:id(1)},tenantSession:async function(){const auth=this.auth();return auth?{auth,tenantId:this.cookies.current_tenant}:{status:401,body:{error:"Authentication required"}};},auth:()=>({email:'tester@example.com'}),send:(status,body)=>({status,body}),broker:async(profile,action,args)=>{
  if(profile==="core_saas")throw new Error("Applications must not query SaaS tables");
  if(args.text?.includes('role.is_admin=true'))return {rows:admin?[{}]:[],rowCount:admin?1:0};
  if(action==='transaction'){transactions++;return scope.module.exports({req:{method:'POST'},body:{brokerProfile:profile,...args},send:ctx.send,logger:{info:()=>{},warn:()=>{},error:()=>{}}});}
  return query(args.text,args.values);
 }};
 const year=require(path.join(erp,'api/fiscal/delete-year')),period=require(path.join(erp,'api/fiscal/delete-period'));
 const addYear=async(n,org=id(2),tenant=id(1))=>db.query("INSERT INTO erp_fiscal_year(fiscal_year_id,tenant_id,organisation_id,fiscal_year_code,start_date,end_date) VALUES($1,$2,$3,$4,'2026-01-01','2026-12-31')",[id(n),tenant,org,`FY${n}`]);
 const addPeriod=async(n,y)=>db.query("INSERT INTO erp_fiscal_period(fiscal_period_id,tenant_id,organisation_id,fiscal_year_id,period_number,period_code,start_date,end_date) VALUES($1,$2,$3,$4,$5,$6,'2026-01-01','2026-01-31')",[id(n),id(1),id(2),id(y),n,`P${n}`]);
 await addYear(10);await addPeriod(11,10);await addPeriod(12,10);
 ctx.body.fiscal_period_id=id(11);assert.equal((await period(ctx)).ok,true);assert.equal((await db.query('SELECT 1 FROM erp_fiscal_period WHERE fiscal_period_id=$1',[id(11)])).rows.length,0);
 await db.query("INSERT INTO erp_journal(tenant_id,organisation_id,fiscal_period_id,source_division_id,currency_code,workflow_status) VALUES($1,$2,$3,$4,'ZAR','draft')",[id(1),id(2),id(12),id(4)]);
 ctx.body.fiscal_period_id=id(12);
 for(const status of ['draft','submitted','approved','rejected','blocked','deleted','reversed']){await db.query('UPDATE erp_journal SET workflow_status=$1',[status]);await assert.rejects(()=>period(ctx),e=>e.status===409&&e.message.includes('1 transaction record'));}
 await addPeriod(13,10);ctx.body.fiscal_year_id=id(10);await assert.rejects(()=>year(ctx),e=>e.status===409);
 assert.equal((await db.query('SELECT count(*)::int n FROM erp_fiscal_period WHERE fiscal_year_id=$1',[id(10)])).rows[0].n,2,'blocked year deletion must retain unused children too');
 await addYear(20);await addPeriod(21,20);await addPeriod(22,20);ctx.body.fiscal_year_id=id(20);assert.equal((await year(ctx)).ok,true);assert.equal((await db.query('SELECT count(*)::int n FROM erp_fiscal_period WHERE fiscal_year_id=$1',[id(20)])).rows[0].n,0);
 await addYear(30);ctx.body.fiscal_year_id=id(30);assert.equal((await year(ctx)).ok,true,'empty year can be deleted');
 await addYear(40,id(3));ctx.body.fiscal_year_id=id(40);await assert.rejects(()=>year(ctx),e=>e.status===404);
 await addYear(50,id(2),id(9));ctx.body.fiscal_year_id=id(50);await assert.rejects(()=>year(ctx),e=>e.status===404);
 const before=transactions;admin=false;assert.equal((await year(ctx)).status,403);assert.equal(transactions,before);admin=true;
 ctx.req.method='GET';assert.equal((await year(ctx)).status,405);ctx.req.method='POST';ctx.body.fiscal_year_id='invalid';assert.equal((await year(ctx)).status,400);
 await addYear(60);await addPeriod(61,60);ctx.body.fiscal_period_id=id(61);
 const originalBroker=ctx.broker;let raced=false;
 ctx.broker=async(profile,action,args)=>{
  if(action==='transaction'&&!raced){raced=true;await db.query("INSERT INTO erp_journal(tenant_id,organisation_id,fiscal_period_id,source_division_id,currency_code,workflow_status) VALUES($1,$2,$3,$4,'ZAR','draft')",[id(1),id(2),id(61),id(4)]);}
  return originalBroker(profile,action,args);
 };
 await assert.rejects(()=>period(ctx),e=>e.status===409);
 assert.equal((await db.query('SELECT 1 FROM erp_fiscal_period WHERE fiscal_period_id=$1',[id(61)])).rows.length,1,'newly used period must survive stale preparation');
 assert.ok(traces.some(t=>t.startsWith('LOCK TABLE')));assert.ok(traces.includes('COMMIT'));assert.ok(traces.includes('ROLLBACK'));
 console.log('PASS: fiscal endpoints with generic SQL batches, locks, unused deletion, child cascade, transaction blocking, tenant/org isolation and admin/method validation');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
