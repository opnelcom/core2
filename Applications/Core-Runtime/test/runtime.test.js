'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const http=require('node:http');
const {createRequire}=require('node:module');
const {readConfig}=require('../config');
const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
test('standalone Runtime serves static files and APIs using only generic context and application dependencies',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'runtime-test-'));
  for(const dir of ['api','api/_shared','public','config','logs','node_modules/example'])fs.mkdirSync(path.join(root,dir),{recursive:true});
  fs.writeFileSync(path.join(root,'config/config.json'),JSON.stringify({port:3100,maxBodyBytes:64}));
  fs.writeFileSync(path.join(root,'public/index.html'),'<html>Independent application</html>');
  fs.writeFileSync(path.join(root,'node_modules/example/index.js'),'module.exports="application dependency";');
  fs.writeFileSync(path.join(root,'api/echo.js'),`module.exports=async ctx=>({body:ctx.body,query:ctx.query,cookies:ctx.cookies,keys:Object.keys(ctx),dependency:require('example')});`);
  fs.writeFileSync(path.join(root,'api/_shared/private.js'),'module.exports=()=>"private";');
  const map=p=>typeof p==='string'&&p.startsWith('/app/content')?path.join(root,p.slice('/app/content'.length)):p;
  const fakeFs=new Proxy(fs,{get(target,key){const fn=target[key];return typeof fn==='function'?((p,...args)=>fn(map(p),...args)):fn;}});
  const appRequire=createRequire(path.join(root,'package.json'));
  let server,configuredPort;
  function load(name){
    if(name==='fs')return fakeFs;
    if(name==='path')return path.posix;
    if(name==='http')return {createServer(fn){
      server=http.createServer(fn);const listen=server.listen.bind(server);
      server.listen=(port,host,callback)=>{configuredPort=port;return listen(0,'127.0.0.1',callback);};return server;
    }};
    if(name==='./config')return {readConfig:()=>readConfig(path.join(root,'config/config.json'))};
    if(name.startsWith('/app/content'))return appRequire(map(name));
    return require(name);
  }
  load.cache=require.cache;
  vm.runInNewContext(source,{require:load,URL,URLSearchParams,Buffer,process:{env:{PORT:'9999',CONTENT_ROOT:'/wrong',LOG_ROOT:'/wrong'}},console:{log(){}}});
  await new Promise(resolve=>server.listening?resolve():server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try{
    assert.equal(configuredPort,3100);
    assert.equal((await fetch(base+'/health')).status,200);
    const page=await fetch(base+'/');assert.match(await page.text(),/Independent application/);
    const cached=await fetch(base+'/',{headers:{'if-none-match':page.headers.get('etag')}});assert.equal(cached.status,304);
    const response=await fetch(base+'/api/echo?q=value',{method:'POST',headers:{'content-type':'application/json',cookie:'example=value'},body:'{"value":42}'});
    const result=await response.json();
    assert.deepEqual(result.body,{value:42});assert.equal(result.query.q,'value');assert.equal(result.cookies.example,'value');
    assert.equal(result.dependency,'application dependency');
    for(const key of ['broker','smtp','auth','signSession','tenantSession'])assert.ok(!result.keys.includes(key));
    assert.equal((await fetch(base+'/api/_shared/private')).status,404);
    assert.equal((await fetch(base+'/api/echo',{method:'POST',body:'x'.repeat(65)})).status,413);
  }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});}
});
test('configuration rejects invalid ports and request limits',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'runtime-config-'));const file=path.join(root,'config.json');
  try{
    assert.throws(()=>readConfig(file),/Unable to read/);
    for(const config of [{},{port:0},{port:'3000'},{port:65536},{port:3000,maxBodyBytes:-1}]){
      fs.writeFileSync(file,JSON.stringify(config));assert.throws(()=>readConfig(file));
    }
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('health check uses the same JSON port and ignores PORT environment overrides',()=>{
  let port,exit;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../healthcheck.js'),'utf8'),{
    process:{env:{PORT:'9999'},exit:code=>{exit=code;}},
    require(name){
      if(name==='./config')return {readConfig:()=>({port:3100})};
      if(name==='http')return {get(options,callback){port=options.port;callback({statusCode:200,resume(){}});return {on(){}};}};
      return require(name);
    }
  });
  assert.equal(port,3100);assert.equal(exit,0);
});
