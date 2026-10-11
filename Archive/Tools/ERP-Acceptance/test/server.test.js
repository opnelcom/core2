'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {createServer,validateParameters}=require('../server');
const {ErpClient}=require('../lib/client');
async function listen(server){await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return`http://127.0.0.1:${server.address().port}`;}
test('local server delivers preview, blocks cross-origin writes and requires an ERP connection',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'erp-server-')),server=createServer({dataRoot:dir});const origin=await listen(server);t.after(()=>{server.close();fs.rmSync(dir,{recursive:true,force:true});});
  assert.match(await (await fetch(origin)).text(),/ERP Acceptance/);
  const bootstrap=await(await fetch(`${origin}/api/bootstrap`)).json();assert.ok(bootstrap.pack.steps.length>200);assert.equal(bootstrap.connection,null);
  assert.equal((await fetch(`${origin}/api/runs`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,403);
  assert.equal((await fetch(`${origin}/api/runs`,{method:'POST',headers:{'content-type':'application/json','x-runner-token':bootstrap.token,origin:'http://untrusted.example'},body:'{}'})).status,403);
  const attempt=await fetch(`${origin}/api/runs`,{method:'POST',headers:{'content-type':'application/json','x-runner-token':bootstrap.token},body:'{}'});assert.match((await attempt.json()).error,/Connect/);
});
test('HTTP ERP client preserves login session cookies and verifies tenant selection',async t=>{
  let lastCookie;
  const erp=http.createServer((req,res)=>{res.setHeader('content-type','application/json');if(req.url==='/api/auth/login'){res.setHeader('set-cookie',['core_session=test-session; HttpOnly; Path=/','current_tenant=default; Path=/']);res.end(JSON.stringify({user:{email:'test@example.test'}}));}else{lastCookie=req.headers.cookie;res.end(JSON.stringify({tenant_id:'selected'}));}});
  const origin=await listen(erp);t.after(()=>erp.close());const client=new ErpClient(origin);const identity=await client.login('test@example.test','dummy','selected');assert.equal(identity.tenant,'selected');assert.match(lastCookie,/core_session=test-session/);assert.match(lastCookie,/current_tenant=selected/);
});
test('run parameters require a test organisation and an in-period transaction date',()=>{
  const p={adminOrganisationId:'00000000-0000-0000-0000-000000000001',organisationCode:'ERPTEST-123',organisationName:'Business',startDate:'2026-10-01',endDate:'2026-10-31',transactionDate:'2026-10-03',yearCode:'FY',periodCode:'FY-01'};
  assert.doesNotThrow(()=>validateParameters(p));assert.throws(()=>validateParameters({...p,organisationCode:'TEMPLATE'}));assert.throws(()=>validateParameters({...p,transactionDate:'2026-11-01'}));assert.throws(()=>validateParameters({...p,startDate:'2026-02-30'}));
});
