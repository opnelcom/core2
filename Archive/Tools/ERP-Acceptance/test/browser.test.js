'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {BrowserExecutor,BrowserGap}=require('../lib/browser');
const {Runner}=require('../lib/runner'),{Store}=require('../lib/store');
let playwright;try{playwright=require(process.env.ERP_TEST_PLAYWRIGHT_MODULE||'playwright');}catch{}
for(const mode of ['ui-visible','ui-headless'])test(`${mode}: real form save, API read verification and duplicate prevention`,{skip:!playwright},async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'erp-browser-test-'));let record,writes=0;
  const server=http.createServer((req,res)=>{
    if(req.url.startsWith('/erp/api/modules/save')){let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{record={...JSON.parse(raw),module_id:'module-1'};writes++;res.setHeader('content-type','application/json');res.end(JSON.stringify({module:record}));});return;}
    res.setHeader('content-type','text/html');res.end(`<button id="add-module" onclick="document.getElementById('module-form').hidden=false">Add</button><form id="module-form" hidden><input id="module-code" required><input id="module-name" required><input id="module-active" type="checkbox"><button type="submit">Save</button></form><script>document.getElementById('module-form').onsubmit=async e=>{e.preventDefault();await fetch('/erp/api/modules/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({module_code:document.getElementById('module-code').value,module_name:document.getElementById('module-name').value,is_active:document.getElementById('module-active').checked})});};</script>`);
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const client={baseUrl:`http://127.0.0.1:${server.address().port}`,cookies:new Map(),async request(endpoint,method='GET'){assert.equal(method,'GET','Browser runner must not write via API client');return {modules:record?[record]:[]};}};
  const browser=new BrowserExecutor(client,path.join(dir,'evidence'),{playwright});t.after(async()=>{await browser.close();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});});
  const store=new Store(dir),runner=new Runner(store,client,browser),step={id:'module',kind:'entity',title:'Module',dependsOn:[],endpoint:'/erp/api/modules/save',body:{organisation_id:'org',module_code:'acceptance',module_name:'Acceptance',is_active:true},lookup:{endpoint:'/erp/api/modules/list',collection:'modules',match:{module_code:'acceptance'}},expected:{module_name:'Acceptance',is_active:true}};
  const run=runner.create({steps:[step]},{adminOrganisationId:'org'},{}),result=await runner.step(run.id,step.id,mode);
  assert.equal(result.results.module.status,'passed',result.results.module.error);assert.equal(writes,1);assert.equal(result.results.module.evidence.browser.mode,mode);
  assert.ok(result.results.module.evidence.browser.requests.some(r=>r.method==='POST'&&r.status===200));
  const again=await runner.step(run.id,step.id,mode);assert.equal(again.results.module.status,'passed');assert.equal(again.results.module.evidence.browser.action,'existing');assert.equal(writes,1);
});
test('UI gap stops unattended execution without falling back to API mutations',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'erp-browser-gap-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let writes=0;
  const runner=new Runner(new Store(dir),{async request(){writes++;throw new Error('No API calls allowed');}},{async execute(){throw new BrowserGap('Unsupported UI control','capability_gap');}});
  const first={id:'first',title:'First',kind:'entity',dependsOn:[],body:{}},second={...first,id:'second'};
  const run=runner.create({steps:[first,second]},{},{}),result=await runner.all(run.id,'ui-headless');assert.equal(result.results.first.status,'capability_gap');assert.equal(result.results.second,undefined);assert.equal(writes,0);assert.notEqual(result.status,'complete');
});
