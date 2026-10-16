"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const defaults=require('../seeds/template-defaults.json');
const {validateSchemaDefinition}=require('../api/_shared/erp/utils');
const {seedOrganisationDefaults}=require('../api/_shared/erp/seeding');
const removed={
  subledger_account:{customer:['registrationNumber','taxNumber'],vendor:['registrationNumber','taxNumber'],employee:['employeeNumber'],
    cash_point:['responsiblePerson','activeFrom','activeTo'],asset_ppe:['custodian'],asset_ip:['custodian'],asset_intangibles:['custodian'],asset_rou:['custodian'],capex_project:['projectCode','status','projectManager']},
  accounting_object:{region:['responsiblePerson'],opex_project:['projectManager'],cost_centre:['manager'],profit_centre:['manager'],contract:['responsiblePerson'],
    tour_vehicle:['registration'],tour_departure:['operationalStatus'],tour_booking:['operationalStatus'],tour_job_card:['operationalStatus'],tour_quote:['operationalStatus'],tour_invoice:['operationalStatus']},
};
const schemaFor=(kind,type)=>kind==='subledger_account'?defaults.ledgerFamilySchemas[type]:defaults.accountingObjectTypeMetadata[type].schema_json;
test('retired fields disappear from definitions, tabs, required lists, presentation sections and example data',()=>{
  for(const [kind,types]of Object.entries(removed))for(const [type,fields]of Object.entries(types)){
    const schema=schemaFor(kind,type);
    assert.deepEqual(validateSchemaDefinition(schema),[],type);
    for(const field of fields){
      assert.equal(schema.properties[field],undefined,`${type}/${field}`);
      assert.ok(!schema.required?.includes(field));
      assert.ok(!(schema.tabs||[]).some(tab=>tab.fields.includes(field)));
      assert.ok(!(defaults.accountingObjectTypeMetadata[type]?.ui_schema_json?.sections||[]).some(section=>section.fields.includes(field)));
      assert.ok(defaults.exampleData.filter(e=>e.class===kind&&e.type===type).every(e=>!Object.hasOwn(e.data||{},field)));
    }
  }
});
test('retained fields have distinct identification, contact, commercial, membership and historical purposes',()=>{
  const s=defaults.ledgerFamilySchemas,o=defaults.accountingObjectTypeMetadata;
  assert.ok(o.fleet_vehicle.schema_json.properties.registration);assert.ok(o.fleet_vehicle.schema_json.required.includes('registration'));
  assert.ok(o.tour_guide.schema_json.properties.phone);
  for(const type of ['customer','vendor'])for(const field of ['email','phone','contacts','addresses'])assert.ok(s[type].properties[field],`${type}/${field}`);
  for(const [type,fields]of [['employee',['firstName','lastName','startDate','endDate','employmentAssignments']],['loan',['loanNumber','interestRate','interestTerms']],['asset_ppe',['assetTag','serialNumber']],['vendor',['bankAccountNumber','paymentAccounts']]])for(const field of fields)assert.ok(s[type].properties[field]);
  for(const [type,fields]of [['contract',['contractNumber','startDate','endDate','parties']],['insurance_policy',['policyNumber']],['insurance_claim',['insurerClaimReference']],['team',['members','responsibilities']],['opex_project',['startDate','endDate','budgetAmount','budgetBreakdown','participants']]])for(const field of fields)assert.ok(o[type].schema_json.properties[field]);
});
test('Resources retain authority for retired person fields using existing optional role mappings',()=>{
  for(const [kind,type,role]of [['subledger_account','capex_project','project_manager'],['subledger_account','cash_point','cash_custodian'],
    ...['asset_ppe','asset_ip','asset_intangibles','asset_rou'].map(type=>['subledger_account',type,'asset_custodian']),
    ['accounting_object','region','regional_manager'],['accounting_object','opex_project','project_manager'],['accounting_object','cost_centre','cost_centre_manager'],['accounting_object','profit_centre','profit_centre_manager'],['accounting_object','contract','contract_manager']]){
    const mapping=defaults.resourceRoleTypeMappings.find(row=>row[0]===kind&&row[1]===type&&row[2]===role);
    assert.ok(mapping,`${type}/${role}`);assert.equal(mapping[3],false);
  }
});
test('type seeding persists the cleaned definitions on insert and update without altering database structure or record codes',async()=>{
  const writes=[];
  await seedOrganisationDefaults({planning:true,broker:async(_p,_a,q)=>{writes.push(...(q.statements||[q]));return {rows:[{is_template:true,tax_type_id:'tax'}]};}},
    {tenantId:'tenant',auth:{email:'owner@example.test'}},'org');
  for(const [kind,types]of Object.entries(removed)){
    const statement=writes.find(q=>q.text.includes(`INSERT INTO erp_${kind}_type(`));
    assert.match(statement.text,/schema_json=excluded\.schema_json/);
    const payload=JSON.parse(statement.values[2]);
    for(const [type,fields]of Object.entries(types)){
      const row=payload.find(r=>(r.type_code||r.ledger_family_code)===type);
      assert.ok(row,type);for(const field of fields)assert.equal(row.schema_json.properties[field],undefined);
    }
  }
  assert.ok(writes.every(q=>!/^\s*(CREATE|ALTER|DROP)\b/.test(q.text)));
});

let chromium;try{({chromium}=require('playwright'));}catch{}
test('cleaned definitions render without retired controls at desktop and narrow widths',{skip:!chromium},async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.SHOWIF_BROWSER_CHANNEL?{channel:process.env.SHOWIF_BROWSER_CHANNEL}:{})});
  try{
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setContent('<style>body{display:block!important;overflow:auto!important;padding:16px}</style><form class="panel form accounting-record-editor" id="accounting-object-form"><div class="account-editor-tabs"><button data-record-tab="general">Identification</button></div><div id="accounting-object-detail-fields"></div></form>');
    await page.addStyleTag({content:fs.readFileSync(require.resolve('../public/style.css'),'utf8')});
    await page.addScriptTag({content:fs.readFileSync(require.resolve('../public/schema-visibility'),'utf8')});
    const app=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
    await page.addScriptTag({content:'const $=id=>document.getElementById(id);const state={orgId:""};const pretty=name=>name;function syncRequiredMarkers(){}\n'+app.slice(app.indexOf('  function schemaFields('),app.indexOf('  function syncRecordTypeDescription('))+app.slice(app.indexOf('  function collectSchemaDetail('),app.indexOf('  function collectAccountDetail('))});
    for(const width of [1100,390]){
      await page.setViewportSize({width,height:900});
      for(const [kind,types]of Object.entries(removed))for(const [type,fields]of Object.entries(types)){
        const schema=schemaFor(kind,type);
        await page.evaluate(s=>{renderSchemaDetailFields('accounting-object-detail-fields',s,{});const first=document.querySelector('[data-account-detail-tab]');if(first)showAccountingEditorTab('accounting-object',`schema:${first.dataset.accountDetailTab}`);},schema);
        for(const field of fields)assert.equal(await page.locator(`[data-detail-field="${field}"]`).count(),0,`${type}/${field}`);
      }
      await page.evaluate(s=>renderSchemaDetailFields('accounting-object-detail-fields',s,{}),defaults.accountingObjectTypeMetadata.fleet_vehicle.schema_json);
      assert.equal(await page.locator('[data-detail-field="registration"]').count(),1);
    }
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
