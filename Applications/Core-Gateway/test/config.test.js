'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
function run(config,options={}){
  const listeners=[],reads=[],writes=[];let handler;
  const fakeFs={
    readFileSync(file){reads.push(file);if(file.endsWith('gateway.json'))return options.raw??JSON.stringify(config);return 'certificate';},
    existsSync(){return !options.missingCertificates;},mkdirSync(){},appendFileSync(file){writes.push(file);}
  };
  const server=kind=>({listen(port,host,callback){listeners.push({kind,port});callback();}});
  const context={URL,Buffer,console:{log(){}},process:{env:{CONTENT_ROOT:'/wrong',LOG_ROOT:'/wrong',PORT:'9999',HTTPS_PORT:'9998'}},require(name){
    if(name==='fs')return fakeFs;
    if(name==='path')return path.posix;
    if(name==='http')return {createServer(fn){handler=fn;return server('http');}};
    if(name==='https')return {createServer(){return server('https');}};
    return require(name);
  }};
  vm.runInNewContext(source,context);
  return {listeners,reads,writes,request(url){let status,body;handler({url,headers:{},socket:{}},{writeHead(s){status=s;},end(b){body=b;}});return {status,body};}};
}
const config=()=>({port:3100,tls:{enabled:true,port:3543},routes:[]});
test('JSON ports and fixed content/log paths ignore environment overrides',()=>{
  const app=run(config());
  assert.deepEqual(app.listeners,[{kind:'http',port:3100},{kind:'https',port:3543}]);
  assert.ok(app.reads.includes('/app/content/config/gateway.json'));
  assert.ok(app.writes.every(file=>file.startsWith('/app/content/logs/')));
  assert.ok(app.writes.length>0);
  assert.equal(app.request('/health').status,200);
});
test('disabled TLS does not require a port or certificates',()=>{
  const app=run({port:3100,tls:{enabled:false},routes:[]},{missingCertificates:true});
  assert.deepEqual(app.listeners,[{kind:'http',port:3100}]);
});
test('invalid configuration and unavailable TLS certificates fail startup',()=>{
  assert.throws(()=>run(config(),{raw:'invalid'}),/Unable to read Gateway configuration/);
  for(const port of [undefined,0,65536,'3000',1.5])assert.throws(()=>run({...config(),port}),/Gateway port/);
  assert.throws(()=>run({...config(),tls:{enabled:true}}),/tls.port/);
  assert.throws(()=>run({...config(),tls:{enabled:true,port:3100}}),/must differ/);
  assert.throws(()=>run({...config(),routes:undefined}),/routes/);
  assert.throws(()=>run({...config(),routes:[{prefix:'/',target:'invalid'}]}),/valid URL/);
  assert.throws(()=>run(config(),{missingCertificates:true}),/certificate or key/);
});
test('invalid configuration on a later request returns 503 instead of fallback routing',()=>{
  const c=config();const app=run(c);
  delete c.port;
  assert.equal(app.request('/health').status,503);
});
