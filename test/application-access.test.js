'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const user={user_id:'verified-user',email:'current@example.test',user_type:'administration_user'};
test('application middleware verifies live SaaS identity and tenant before application database access',async()=>{
  let state={authenticated:true,user,current_tenant:'tenant-1'},calls=0;
  const identity=http.createServer((req,res)=>{
    calls++;assert.equal(req.headers.cookie,'core_session=signed; current_tenant=tenant-1');
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify(req.url==='/api/application/list'?{applications:[{application_code:'core-database-management'}]}:state));
  });
  await new Promise(resolve=>identity.listen(0,'127.0.0.1',resolve));
  const config={identity:{url:'http://127.0.0.1:'+identity.address().port,timeoutMs:1000}};
  function ctx(broker=async()=>{throw Error('Unexpected database access');}){
    return {config,req:{method:'GET',headers:{cookie:'core_session=signed; current_tenant=tenant-1'}},
      cookies:{current_tenant:'tenant-1'},body:{},query:{},res:{setHeader(){}},send:(status,body)=>({status,body}),broker};
  }
  const admin=require('../Volumes/Core-Admin/api/admin/summary');
  const monitor=require('../Volumes/Core-Monitor/api/monitor/brokerprofiles');
  const tenantHandlers=[require('../Volumes/Core-ERP/api/setup/bootstrap'),require('../Volumes/Core-Tasks/api/tasks/list'),require('../Volumes/Core-ObjectSphere/api/items/list')];
  try{
    assert.deepEqual(await admin(ctx(async()=>({rows:[{users:1}]}))),{users:1});
    state={authenticated:true,user:{...user,user_type:'standard_user'},current_tenant:'tenant-1'};
    assert.equal((await admin(ctx())).status,403);assert.equal((await monitor(ctx())).status,403);
    state={authenticated:false,user:null,current_tenant:null};
    for(const handler of tenantHandlers)assert.equal((await handler(ctx())).status,401);
    state={authenticated:true,user,current_tenant:'another-tenant'};
    for(const handler of tenantHandlers)assert.equal((await handler(ctx())).status,403);
    const {requireAccess}=require('../Volumes/Core-DBManager/api/_shared/access');
    await assert.rejects(requireAccess(ctx(),{methods:['GET'],applicationCode:'core-database-management',requireTenant:true}),{status:403});
    state={authenticated:true,user,current_tenant:'tenant-1'};
    const session=await requireAccess(ctx(),{methods:['GET'],applicationCode:'core-database-management',requireTenant:true});
    assert.equal(session.user.email,user.email);assert.ok(calls>=10);
    await new Promise(resolve=>identity.close(resolve));
    await assert.rejects(admin(ctx()),{status:503});
    for(const handler of tenantHandlers)assert.equal((await handler(ctx())).status,503);
  }finally{if(identity.listening)await new Promise(resolve=>identity.close(resolve));}
});
test('Broker and SMTP own their dependencies and authenticate without SaaS',async()=>{
  for(const app of ['Broker','SMTP']){
    const pkg=require('../Volumes/Core-'+app+'/package.json');
    assert.ok(!Object.keys(pkg.dependencies).some(name=>name.startsWith('@core/')));
  }
  const {authorize}=require('../Volumes/Core-Broker/api/_shared/broker');
  const profile={name:'database',profileKey:'service-key',host:'database.test',database:'db',user:'user'};
  assert.equal(authorize({body:{brokerProfile:'database'},req:{headers:{'x-core-key':'wrong'}}},{dbProfiles:[profile]}).status,403);
  assert.equal(authorize({body:{brokerProfile:'database'},req:{headers:{'x-core-key':'service-key'}}},{dbProfiles:[profile]}).profile,profile);
  const send=require('../Volumes/Core-SMTP/api/mail/send');
  const ctx={config:{smtpProfiles:[{name:'mail',profileKey:'service-key'}]},body:{profile:'mail',to:'test@example.test',subject:'Test'},
    req:{method:'POST',headers:{'x-core-key':'wrong'}},logger:{info(){},warn(){},error(){}},send:(status,body)=>({status,body})};
  assert.equal((await send(ctx)).status,403);
  ctx.req.headers['x-core-key']='service-key';assert.equal((await send(ctx)).development,true);
});
