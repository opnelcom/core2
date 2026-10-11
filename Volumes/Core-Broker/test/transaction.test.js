'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture({denied=false,queryFailure=false,rowCount=1}={}){
 const calls=[],client={query:async(text,values)=>{calls.push({text,values});if(queryFailure&&text==='INSERT INTO arbitrary_table VALUES($1)')throw Error('SQL failure');return {rows:[],rowCount,command:'SQL'};},release:()=>calls.push({text:'RELEASE'})};
 const scope={module:{exports:{}},require:name=>{assert.equal(name,'../_shared/broker','Broker must not import application code');return {brokerConfig:()=>({}),authorize:()=>denied?{status:403,body:{error:'Forbidden'}}:{profile:{name:'any_application'}},poolFor:()=>({connect:async()=>client}),recordProfileMetric:()=>{},summarizeSql:text=>text};}};
 vm.createContext(scope);vm.runInContext(fs.readFileSync(path.join(__dirname,'../api/broker/transaction.js'),'utf8'),scope);
 const ctx={req:{method:'POST'},body:{statements:[{text:'INSERT INTO arbitrary_table VALUES($1)',values:['value'],expectedRowCount:1}]},logger:{info:()=>{},warn:()=>{},error:()=>{}},send:(status,body)=>({status,body})};
 return {run:()=>scope.module.exports(ctx),ctx,calls};
}
test('generic SQL batches preserve order, parameters, commit and connection release',async()=>{
 const f=fixture();await f.run();assert.deepEqual(f.calls.map(c=>c.text),['BEGIN','INSERT INTO arbitrary_table VALUES($1)','COMMIT','RELEASE']);assert.deepEqual(f.calls[1].values,['value']);
});
test('SQL failure and expected-row mismatch roll back and release',async()=>{
 for(const options of [{queryFailure:true},{rowCount:0}]){const f=fixture(options);await assert.rejects(f.run);assert.deepEqual(f.calls.slice(-2).map(c=>c.text),['ROLLBACK','RELEASE']);assert.ok(!f.calls.some(c=>c.text==='COMMIT'));}
});
test('method, profile authentication and empty batches reject without a connection',async()=>{
 const method=fixture();method.ctx.req.method='GET';assert.equal((await method.run()).status,405);assert.equal(method.calls.length,0);
 const denied=fixture({denied:true});assert.equal((await denied.run()).status,403);assert.equal(denied.calls.length,0);
 const empty=fixture();empty.ctx.body.statements=[];assert.equal((await empty.run()).status,400);assert.equal(empty.calls.length,0);
});
