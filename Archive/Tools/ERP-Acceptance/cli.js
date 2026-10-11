'use strict';
const path=require('node:path');
const {Store}=require('./lib/store');
const {Runner}=require('./lib/runner');
const {BrowserExecutor}=require('./lib/browser');
const {ErpClient}=require('./lib/client');
const {buildPack}=require('./packs/business-inception');
const {validateParameters}=require('./server');
async function main(){
  if(!process.env.ERP_TEST_URL || !process.env.ERP_TEST_EMAIL || !process.env.ERP_TEST_PASSWORD)throw new Error('Set ERP_TEST_URL, ERP_TEST_EMAIL and ERP_TEST_PASSWORD; optional ERP_TEST_TENANT');
  const client=new ErpClient(process.env.ERP_TEST_URL), identity=await client.login(process.env.ERP_TEST_EMAIL,process.env.ERP_TEST_PASSWORD,process.env.ERP_TEST_TENANT);
  const store=new Store(path.join(__dirname,'data')),browser=new BrowserExecutor(client,path.join(store.root,'browser-evidence')),runner=new Runner(store,client,browser),args=process.argv.slice(2);
  let run;
  if(args[0]==='resume') {run=store.get(args[1]);if(['baseUrl','tenant','email'].some(k=>run.connection[k]!=={baseUrl:client.baseUrl,...identity}[k]))throw new Error('Connection does not match saved run');}
  else {
    const start=process.env.ERP_TEST_START || '2026-10-01',end=process.env.ERP_TEST_END || '2026-10-31';
    const parameters=validateParameters({adminOrganisationId:process.env.ERP_TEST_ADMIN_ORG,organisationCode:process.env.ERP_TEST_ORG || `ERPTEST-${Date.now()}`,organisationName:'ERP acceptance business',startDate:start,endDate:end,transactionDate:process.env.ERP_TEST_DATE || start,yearCode:'ACCEPTANCE',periodCode:'ACCEPTANCE-01'});
    const bootstrap=await client.request('/erp/api/setup/bootstrap');if(bootstrap.organisations.some(o=>o.organisation_code===parameters.organisationCode))throw new Error('Organisation exists; resume its run instead');
    run=runner.create(buildPack(),parameters,{baseUrl:client.baseUrl,...identity});
  }
  console.log(`Run ${run.id}`);process.on('SIGINT',()=>{runner.pause(run.id);console.log('Pause requested after current step');});
  let result;try{result=await runner.all(run.id,process.env.ERP_TEST_MODE||'auto');}finally{await browser.close();}
  const passed=Object.values(result.results).filter(r=>r.status==='passed').length;
  console.log(`${passed}/${result.pack.steps.length} passed. Results: ${store.filename(run.id)}`);
  for(const [id,r]of Object.entries(result.results))if(r.status==='failed')console.log(`${id}: ${r.error || JSON.stringify(r.evidence.differences)}`);
  process.exitCode=result.status==='complete'?0:1;
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
