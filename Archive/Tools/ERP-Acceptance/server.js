'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { Store } = require('./lib/store');
const { Runner, resolve } = require('./lib/runner');
const { ErpClient } = require('./lib/client');
const { BrowserExecutor } = require('./lib/browser');
const { buildPack } = require('./packs/business-inception');
function validateParameters(p) {
  if (!/^ERPTEST-[A-Z0-9-]{3,50}$/.test(p.organisationCode || '')) throw new Error('Organisation code must start ERPTEST- and use uppercase letters, digits or hyphens');
  if (!String(p.organisationName || '').trim()) throw new Error('Organisation name is required');
  if(!/^[a-f0-9-]{36}$/i.test(p.adminOrganisationId||''))throw new Error('Select an existing organisation where you have setup administrator access');
  for (const key of ['startDate','endDate','transactionDate']) if (!/^\d{4}-\d{2}-\d{2}$/.test(p[key] || '') || new Date(p[key]).toISOString().slice(0,10) !== p[key]) throw new Error(`Invalid ${key}`);
  if (p.endDate < p.startDate || p.transactionDate < p.startDate || p.transactionDate > p.endDate) throw new Error('Transaction date must fall inside the test period');
  if (!p.yearCode || !p.periodCode) throw new Error('Financial year and period codes are required');
  return p;
}
function createServer(options = {}) {
  const store = new Store(options.dataRoot || path.join(__dirname,'data')), token = randomBytes(32).toString('hex');
  let connection, runner;
  const active = new Set();
  function json(res, status, body) { res.writeHead(status, {'content-type':'application/json', 'cache-control':'no-store'}); res.end(JSON.stringify(body)); }
  async function body(req) {
    let raw=''; for await (const chunk of req) { raw+=chunk; if(raw.length>1024*1024)throw new Error('Request too large'); }
    return raw ? JSON.parse(raw) : {};
  }
  function requireConnection(run) {
    if (!runner || !connection) throw new Error('Connect to the ERP first');
    if (run && ['baseUrl','tenant','email'].some(k=>run.connection[k]!==connection[k])) throw new Error('Reconnect using the ERP, tenant and account saved with this run');
  }
  const server = http.createServer(async (req,res) => {
    try {
      const host = req.headers.host || '';
      if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) return json(res,403,{error:'Local access only'});
      if (req.headers.origin && req.headers.origin !== `http://${host}`) return json(res,403,{error:'Cross-origin access denied'});
      const url = new URL(req.url,`http://${host}`);
      if(url.pathname==='/api/bootstrap' && req.method==='GET') return json(res,200,{token,connection:connection || null,pack:buildPack(),runs:store.list().map(({id,createdAt,status,parameters,connection})=>({id,createdAt,status,parameters,connection}))});
      if(url.pathname.startsWith('/api/')) {
        if(req.headers['x-runner-token']!==token)return json(res,403,{error:'Runner token required'});
        const input = req.method==='GET' ? {} : await body(req);
        if(url.pathname==='/api/connect' && req.method==='POST') {
          if(active.size)throw new Error('Pause execution before changing connection');
          const client = new ErpClient(input.baseUrl,input.cookie || '');
          let identity;
          if(input.cookie) { const bootstrap=await client.request('/erp/api/setup/bootstrap'); const session=await client.request('/api/auth/session'); identity={tenant:bootstrap.tenant_id,email:session.user?.email || session.auth?.email}; if(!identity.email)throw new Error('Session email unavailable; connect using email and password'); }
          else identity=await client.login(input.email,input.password,input.tenant);
          if(runner?.browser)await runner.browser.close();
          connection={baseUrl:client.baseUrl,...identity}; runner=new Runner(store,client,new BrowserExecutor(client,path.join(store.root,'browser-evidence')));
          const bootstrap=await client.request('/erp/api/setup/bootstrap');
          return json(res,200,{connection,organisations:bootstrap.organisations.map(o=>({id:o.organisation_id,name:o.organisation_name,code:o.organisation_code})),currentOrganisationId:bootstrap.user_context.organisation_id});
        }
        if(url.pathname==='/api/runs' && req.method==='POST') {
          requireConnection(); const parameters=validateParameters(input.parameters);
          const organisations=(await runner.client.request('/erp/api/setup/bootstrap')).organisations;
          if(organisations.some(o=>o.organisation_code===parameters.organisationCode))throw new Error('Organisation code already exists. Resume its saved run or choose a fresh code.');
          return json(res,201,runner.create(buildPack(),parameters,connection));
        }
        const match=url.pathname.match(/^\/api\/runs\/([a-f0-9-]{36})(?:\/(step|execute|pause|export|annotate))?$/);
        if(match) {
          const [,id,action]=match,run=store.get(id);
          if(req.method==='GET' && (!action || action==='export'))return json(res,200,run);
          requireConnection(run);
          if(action==='pause' && req.method==='POST') { runner.pause(id); return json(res,200,{requested:true}); }
          if(action==='annotate'&&req.method==='POST'){if(active.has(id))throw new Error('Pause execution before recording observations');return json(res,200,runner.annotate(id,input.stepId,input.status,input.note));}
          if(action==='execute' && req.method==='POST') {
            if(!['auto','ui-visible','ui-headless'].includes(input.mode||'auto'))throw new Error('Invalid unattended execution mode');
            if(active.has(id))throw new Error('Run is already executing'); active.add(id);
            runner.all(id,input.mode||'auto').catch(error=>{const r=store.get(id);r.events.push({at:new Date().toISOString(),message:error.message});store.save(r);}).finally(()=>active.delete(id));
            return json(res,202,{started:true});
          }
          if(action==='step' && req.method==='POST') {
            if(active.has(id))throw new Error('Pause unattended execution before selecting an individual step');
            active.add(id);try{return json(res,200,await runner.step(id,input.stepId,input.mode));}finally{active.delete(id);}
          }
        }
        if(url.pathname==='/api/resolve' && req.method==='POST') {
          const run=store.get(input.runId),step=run.pack.steps.find(s=>s.id===input.stepId); if(!step)throw new Error('Unknown step');
          try {return json(res,200,{body:resolve(step.body || step.query,runner ? runner.context(run) : {parameters:run.parameters,outputs:run.outputs,connection:run.connection})});}
          catch(error){return json(res,200,{body:step.body || step.query,unresolved:error.message});}
        }
        return json(res,404,{error:'Unknown endpoint'});
      }
      const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};
      if(req.method!=='GET' || !files[url.pathname])return json(res,404,{error:'Not found'});
      const file=files[url.pathname];res.writeHead(200,{'content-type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html',
        'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'cache-control':'no-store'});
      res.end(fs.readFileSync(path.join(__dirname,'public',file)));
    }catch(error){json(res,400,{error:error.message});}
  });
  return server;
}
if(require.main===module){const port=Number(process.env.ERP_TEST_PORT || 4314);createServer().listen(port,'127.0.0.1',()=>console.log(`ERP Acceptance: http://127.0.0.1:${port}`));}
module.exports={createServer,validateParameters};
