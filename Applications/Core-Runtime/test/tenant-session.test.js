'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {tenantSession}=require('../tenant-session');
const sessionEndpoint=require('../../../Volumes/Core-SaaS/api/auth/session');
const tenant='10000000-0000-0000-0000-000000000001';
const user={user_id:'10000000-0000-0000-0000-000000000002',email:'current@example.com',user_type:'administration_user'};
const ctx=()=>({cookies:{current_tenant:tenant},config:{},req:{headers:{cookie:'session=signed; current_tenant='+tenant}}});
const reply=data=>async()=>({ok:true,json:async()=>data});

test('valid membership uses SaaS identity and omits SaaS permissions',async()=>{
  let request;
  const result=await tenantSession(ctx(),async(url,options)=>{
    request={url,options};return {ok:true,json:async()=>({authenticated:true,user,current_tenant:tenant,role:'owner',applications:['erp']})};
  });
  assert.equal(result.auth.email,user.email);
  assert.equal(result.tenantId,tenant);
  assert.equal(result.auth.user_type,undefined);
  assert.equal(result.role,undefined);
  assert.equal(result.applications,undefined);
  assert.equal(request.url,'http://core-saas:3000/api/auth/session');
  assert.equal(request.options.headers.cookie,ctx().req.headers.cookie);
  assert.equal(request.options.redirect,'error');
});

test('invalid identity, missing tenant and rejected membership fail closed',async()=>{
  for(const data of [{authenticated:false,user:null},{authenticated:true,user:{}},{authenticated:'true',user}])
    assert.equal((await tenantSession(ctx(),reply(data))).status,401);
  const noTenant=ctx();noTenant.cookies={};
  assert.equal((await tenantSession(noTenant,reply({authenticated:true,user}))).status,400);
  for(const current_tenant of [null,undefined,'another-tenant'])
    assert.equal((await tenantSession(ctx(),reply({authenticated:true,user,current_tenant}))).status,403);
});

test('network failure, non-success status and invalid JSON deny access',async()=>{
  for(const fetcher of [async()=>{throw Error('connection refused');},async()=>({ok:false}),async()=>({ok:true,json:async()=>{throw Error('invalid JSON');}})])
    assert.equal((await tenantSession(ctx(),fetcher)).status,503);
  for(const data of [null,[], 'invalid'])
    assert.equal((await tenantSession(ctx(),reply(data))).status,503);
});

test('HTTP client integrates with SaaS session endpoint and checks active identity and membership on every request',async()=>{
  let activeUser=true,activeMembership=true,checks=0;
  const server=http.createServer(async(req,res)=>{
    assert.equal(req.url,'/api/auth/session');
    const result=await sessionEndpoint({auth:()=>({user_id:user.user_id,email:'stale@example.com'}),cookies:{current_tenant:tenant},broker:async(profile,action,q)=>{
      checks++;assert.equal(profile,'core_saas');
      if(q.text.includes('FROM core_user')){
        assert.match(q.text,/status='active'/);return {rowCount:activeUser?1:0,rows:activeUser?[user]:[]};
      }
      assert.deepEqual(q.values,[tenant,user.email]);
      assert.match(q.text,/t.status='active'/);assert.match(q.text,/tu.status='active'/);
      return {rowCount:activeMembership?1:0,rows:activeMembership?[{tenant_id:tenant}]:[]};
    }});
    res.setHeader('content-type','application/json');res.end(JSON.stringify(result));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const request=ctx();request.config.saasURL='http://127.0.0.1:'+server.address().port;
  try{
    assert.equal((await tenantSession(request)).auth.email,user.email);
    activeMembership=false;assert.equal((await tenantSession(request)).status,403);
    activeUser=false;assert.equal((await tenantSession(request)).status,401);
    assert.equal(checks,5);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('all application guards use membership API and ERP retains its own administrator checks',async()=>{
  const guards=[require('../../../Volumes/Core-ERP/api/_shared/tenant').authTenant,require('../../../Volumes/Core-ERP/api/_shared/erp/auth').authTenant,require('../../../Volumes/Core-Tasks/api/_shared/tasks').authTenant,require('../../../Volumes/Core-ObjectSphere/api/_shared/items').authTenant];
  for(const guard of guards){
    const denied={status:403,body:{error:'No access to active tenant'}};
    assert.deepEqual(await guard({tenantSession:async()=>denied,broker:async()=>{throw Error('Database access before identity check');}}),denied);
    const result=await guard({tenantSession:async()=>({auth:user,tenantId:tenant}),body:{},query:{}});
    assert.equal(result.tenantId,tenant);assert.equal(result.role,undefined);
  }
  const erp=guards[1];
  const result=await erp({tenantSession:async()=>({auth:user,tenantId:tenant}),body:{organisation_id:'org'},broker:async(profile,action,q)=>{
    assert.equal(profile,'core_erp');assert.match(q.text,/erp_user_role/);return {rowCount:0};
  }});
  assert.equal(result.setupAdministrator,false);
});

test('ObjectSphere import/export allow members without SaaS roles and reject invalid membership before database access',async()=>{
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
  for(const operation of ['import','export']){
    let membership={auth:user,tenantId:tenant},schemaCalls=0;
    const scope={module:{exports:{}},require(name){
      if(name==='../_shared/items')return {authTenant:async()=>membership,ensureSchema:async()=>{schemaCalls++;}};
      return require(name);
    }};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,`../../../Volumes/Core-ObjectSphere/api/setup/${operation}.js`),'utf8'),scope);
    const handler=scope.module.exports;
    const request={req:{method:'POST'},query:{},body:{mode:'append',export:{format:'objectsphere-tenant-export',version:1,data:{}}},send:(status,body)=>({status,body}),broker:async(profile,action,q)=>{
      assert.equal(profile,'core_objectsphere');
      return {results:q.statements.map(()=>({rows:[]}))};
    }};
    const allowed=await handler(request);
    assert.equal(allowed.status,undefined);
    assert.equal(schemaCalls,1);
    membership={status:403,body:{error:'No access to active tenant'}};
    request.broker=async()=>{throw Error('Database access without valid membership');};
    assert.equal((await handler(request)).status,403);
    assert.equal(schemaCalls,1);
  }
});
