'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {session,tenantSession,withIdentity,requireApplication}=require('../index');
const user={user_id:'user-1',email:'member@example.test',user_type:'administration_user'};
const ctx=()=>({config:{identity:{url:'http://identity.test:3100',timeoutMs:1000}},req:{headers:{cookie:'core_session=signed; current_tenant=tenant-1'}},cookies:{current_tenant:'tenant-1'}});
const reply=data=>async()=>({ok:true,json:async()=>data});
test('tenant verification forwards session only to configured service and omits global permissions',async()=>{
  let request;
  const access=await tenantSession(ctx(),async(url,options)=>{
    request={url,options};return {ok:true,json:async()=>({authenticated:true,user,current_tenant:'tenant-1'})};
  });
  assert.equal(request.url,'http://identity.test:3100/api/auth/session');
  assert.equal(request.options.headers.cookie,ctx().req.headers.cookie);
  assert.equal(request.options.redirect,'error');
  assert.equal(access.tenantId,'tenant-1');assert.equal(access.auth.email,user.email);
  assert.equal(access.auth.user_type,undefined);
});
test('unauthenticated, missing tenant, mismatched tenant and unavailable identity deny access',async()=>{
  assert.equal((await tenantSession(ctx(),reply({authenticated:false,user:null}))).status,401);
  const missing=ctx();missing.cookies={};
  assert.equal((await tenantSession(missing,reply({authenticated:true,user}))).status,400);
  for(const tenant of [null,undefined,'tenant-2'])
    assert.equal((await tenantSession(ctx(),reply({authenticated:true,user,current_tenant:tenant}))).status,403);
  for(const data of [null,[],{}, {authenticated:true,user:{}},{authenticated:'true',user}])
    assert.equal((await tenantSession(ctx(),reply(data))).status,503);
  assert.equal((await tenantSession(ctx(),async()=>{throw Error('offline');})).status,503);
  assert.equal((await tenantSession({...ctx(),config:{}},reply({}))).status,503);
});
test('identity middleware is lazy, scoped to the request and preserves administrator identity',async()=>{
  const originalFetch=global.fetch;let calls=0;
  global.fetch=async()=>{calls++;return {ok:true,json:async()=>({authenticated:true,user})};};
  try{
    await withIdentity(async()=>{})(ctx());assert.equal(calls,0);
    const handler=withIdentity(async c=>{assert.equal((await c.auth()).user_type,'administration_user');await c.auth();});
    await handler(ctx());assert.equal(calls,1);
    await handler(ctx());assert.equal(calls,2);
  }finally{global.fetch=originalFetch;}
});
test('application assignment is checked and malformed responses fail closed',async()=>{
  await requireApplication(ctx(),'erp',reply({applications:[{application_code:'erp'}]}));
  await assert.rejects(requireApplication(ctx(),'erp',reply({applications:[]})),{status:403});
  await assert.rejects(requireApplication(ctx(),'erp',reply({})),{status:503});
});
