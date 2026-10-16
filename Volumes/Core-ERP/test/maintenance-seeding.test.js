"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const defaults=require('../seeds/template-defaults.json');
const {validateSchemaDefinition,validateSchema}=require('../api/_shared/erp/utils');
const visibility=require('../public/schema-visibility');
const {seedWorkflowActionRoles,seedWorkflowBindings}=require('../api/_shared/erp/workflow-seeding');
const {seedRecordExamples}=require('../api/_shared/erp/seed-record-examples');
const {seedOrganisationDefaults}=require('../api/_shared/erp/seeding');
const schemaFor=type=>defaults.accountingObjectTypeMetadata[type]?.schema_json||defaults.ledgerFamilySchemas[type];
const orderSchema=schemaFor('work_order'),fleetSchema=schemaFor('fleet_vehicle');
const resolveSample=value=>Array.isArray(value)?value.map(resolveSample):value&&typeof value==='object'?value.$ref?randomUUID():Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resolveSample(v)])):value;

test('Maintenance Order and Fleet Vehicle use valid configurable definitions and preserve allocation roles',()=>{
  for(const schema of [orderSchema,fleetSchema])assert.deepEqual(validateSchemaDefinition(schema),[]);
  assert.deepEqual(orderSchema.properties.asset.target,{class:'subledger_account',types:['asset_ppe','asset_rou']});
  assert.deepEqual(orderSchema.properties.vehicle.target,{class:'accounting_object',types:['fleet_vehicle']});
  assert.equal(fleetSchema.properties.assetAccount.target.class,'subledger_account');
  assert.equal(defaults.accountingObjectTypeMetadata.work_order.default_grid_view,'status');
  assert.equal(defaults.accountingObjectTypeMetadata.fleet_vehicle.default_grid_view,'columnar');
  assert.ok(defaults.moduleSeeds.some(r=>r[0]==='maintenance'));
  assert.deepEqual(defaults.moduleMappings.accountingObjectTypes.work_order,['maintenance']);
});
test('Work Area reveals only the correct reference while retaining optional-reference validation',()=>{
  for(const [area,visible] of [['property','property'],['equipment','asset'],['fleet','vehicle']]){
    for(const field of ['property','asset','vehicle'])assert.equal(visibility.evaluate(orderSchema.properties[field].showif,{workArea:area},undefined,'object',orderSchema),field===visible);
    assert.deepEqual(validateSchema(orderSchema,{workArea:area}),[]);
  }
  assert.ok(validateSchema(orderSchema,{}).includes('workArea is required'));
  assert.ok(validateSchema(orderSchema,{workArea:'invalid'}).length);
  assert.deepEqual(fleetSchema.required,['registration','make','model']);
});
test('new examples cover all three work areas and six valid Maintenance workflow statuses with resolvable references',()=>{
  const examples=defaults.exampleData.filter(e=>['work_order','fleet_vehicle'].includes(e.type));
  assert.equal(examples.length,8);
  const known=new Set(defaults.exampleData.map(e=>JSON.stringify([e.class,e.type,e.code])));
  const checkRefs=value=>{if(!value||typeof value!=='object')return;if(value.$ref){assert.ok(known.has(JSON.stringify(value.$ref)),JSON.stringify(value.$ref));return;}Object.values(value).forEach(checkRefs);};
  for(const e of examples){checkRefs(e.data);assert.deepEqual(validateSchema(schemaFor(e.type),resolveSample(e.data)),[]);}
  const orders=examples.filter(e=>e.type==='work_order');
  assert.deepEqual([...new Set(orders.map(e=>e.data.workArea))].sort(),['equipment','fleet','property']);
  const workflow=defaults.workflows.find(w=>w.path_name==='Maintenance');
  for(const e of orders)assert.ok(workflow.steps.some(s=>s.step_code===e.workflowStatus));
  assert.equal(new Set(orders.map(e=>e.workflowStatus)).size,6);
});
test('seeded dedicated permission roles match every Maintenance action and remain distinct from resource roles',async()=>{
  let query;
  await seedWorkflowActionRoles({broker:async(_p,_a,q)=>{query=q;}},{tenantId:'tenant'},'org',defaults);
  assert.deepEqual(query.values.slice(0,2),['tenant','org']);
  const assignments=JSON.parse(query.values[2]),workflow=defaults.workflows.find(w=>w.path_name==='Maintenance');
  for(const step of workflow.steps)for(const action of step.actions){
    const codes=assignments.filter(a=>a.current_step_code===step.step_code&&a.action_label===action.action_label).map(a=>a.role_code);
    assert.ok(codes.includes('maintenance_manager'));assert.deepEqual(codes,action.role_codes);
  }
  const expected={'Submit':'maintenance_requester','Delete':'maintenance_requester','Allocate Team':'maintenance_coordinator','Put in progress':'maintenance_coordinator','Resolved':'maintenance_technician'};
  for(const action of workflow.steps.flatMap(s=>s.actions))if(expected[action.action_label])assert.ok(action.role_codes.includes(expected[action.action_label]));
  for(const code of ['maintenance_requester','maintenance_coordinator','maintenance_technician','maintenance_manager'])assert.equal(defaults.roleSeeds.find(r=>r[0]===code)[3],false);
  assert.ok(defaults.resourceRoleTypeMappings.some(r=>r[1]==='fleet_vehicle'&&r[2]==='fleet_custodian'));
  assert.match(query.text,/role\.tenant_id=\$1 AND role\.organisation_id=\$2/);
  const malformed=structuredClone(defaults);malformed.workflows.find(w=>w.path_name==='Maintenance').steps[0].actions[0].role_codes=['unknown'];
  await assert.rejects(()=>seedWorkflowActionRoles({broker:async()=>assert.fail('No write expected')},{tenantId:'tenant'},'org',malformed),/Invalid seeded workflow action roles/);
});
test('definition seeding plans scoped permissions, module links, role assignments and type workflow bindings without DDL or user-role assignments for dedicated roles',async()=>{
  const calls=[];
  await seedOrganisationDefaults({planning:true,broker:async(_p,_a,q)=>{calls.push(...(q.statements||[q]));return {rows:[{is_template:true,tax_type_id:'tax'}]};}},
    {tenantId:'tenant',auth:{email:'owner@example.test'}},'org');
  assert.ok(calls.every(q=>!/^\s*(ALTER|CREATE|DROP)\b/.test(q.text)));
  const permission=calls.find(q=>q.text.includes('raw_expanded AS'));
  assert.match(permission.text,/type\.object_kind=p.resource_kind/);
  const grants=JSON.parse(permission.values[2]).filter(r=>r.role_code.startsWith('maintenance_'));
  assert.ok(grants.some(r=>r.resource_code==='work_order'&&r.resource_kind==='accounting_object'));
  assert.ok(grants.every(r=>r.resource_kind!=='master_data'));
  assert.ok(calls.some(q=>q.text.includes('INSERT INTO erp_workflow_action_role')&&JSON.parse(q.values[2]).some(a=>a.path_name==='Maintenance')));
  const bindings=[];await seedWorkflowBindings({broker:async(_p,_a,q)=>bindings.push(...q.statements)},{tenantId:'tenant'},'org');
  assert.ok(bindings.some(q=>q.values[2]==='Maintenance'&&q.values[3].includes('work_order')));
  assert.ok(bindings.some(q=>q.values[2]==='Full Master Data Management'&&q.values[3].includes('fleet_vehicle')));
  assert.ok(!calls.some(q=>q.text.includes('INSERT INTO erp_user_role')&&q.text.includes('maintenance_')));
});

function exampleFixture({invalidStatus=false,existing=false}={}){
  const calls=[],typeId=randomUUID(),division=randomUUID();
  return {calls,ctx:{broker:async(_p,action,q)=>{
    if(action==='transaction'){calls.push(...q.statements);return {};}
    calls.push(q);
    if(q.text.includes('SELECT 1 FROM erp_organisation'))return {rows:[{}]};
    if(q.text.includes('SELECT division_id'))return {rows:[{division_id:division}]};
    if(q.text.startsWith('SELECT r.'))return {rows:existing?[{id:randomUUID()}]:[]};
    if(q.text.includes('schema_json,workflow_path_id FROM'))return {rows:[{id:typeId,schema_json:orderSchema,workflow_path_id:randomUUID()}]};
    if(q.text.includes('FROM erp_workflow_step'))return {rows:invalidStatus?[]:[{}]};
    throw new Error('Unexpected query '+q.text);
  }}};
}
test('example seeding validates explicit status against the type workflow and saves status with version snapshots',async()=>{
  const f=exampleFixture();const result=await seedRecordExamples(f.ctx,{tenantId:'tenant',auth:{email:'owner@example.test'}},'org',[
    {class:'accounting_object',type:'work_order',code:'MO-TEST',name:'Test',workflowStatus:'in_progress',data:{workArea:'property'}}]);
  assert.equal(result.inserted,1);
  const insert=f.calls.find(q=>q.text.startsWith('INSERT INTO erp_accounting_object('));
  assert.equal(insert.values[9],'in_progress');assert.equal(insert.values[1],'tenant');assert.equal(insert.values[2],'org');
  assert.ok(f.calls.some(q=>q.text.startsWith('INSERT INTO erp_object_data_version')));
  assert.ok(f.calls.some(q=>q.text.includes('workflow_path_id=$3 AND step_code=$4')));
  const invalid=exampleFixture({invalidStatus:true});
  await assert.rejects(()=>seedRecordExamples(invalid.ctx,{tenantId:'tenant',auth:{email:'owner@example.test'}},'org',[
    {class:'accounting_object',type:'work_order',code:'BAD',name:'Bad',workflowStatus:'active',data:{workArea:'property'}}]),/Invalid example workflow status/);
  assert.ok(!invalid.calls.some(q=>q.text.startsWith('INSERT')));
  const preserved=exampleFixture({existing:true});
  assert.equal((await seedRecordExamples(preserved.ctx,{tenantId:'tenant',auth:{email:'owner@example.test'}},'org',[
    {class:'accounting_object',type:'work_order',code:'EXISTING',name:'Do not overwrite',workflowStatus:'draft',data:{workArea:'fleet'}}])).inserted,0);
  assert.ok(!preserved.calls.some(q=>q.text.startsWith('INSERT')));
});

test('the complete example catalogue resolves new references together with existing legal-entity and asset examples',async()=>{
  const calls=[],division=randomUUID();
  const ctx={broker:async(_p,action,q)=>{
    if(action==='transaction'){calls.push(...q.statements);return {};}
    if(q.text.includes('SELECT 1 FROM erp_organisation'))return {rows:[{}]};
    if(q.text.includes('SELECT division_id'))return {rows:[{division_id:division}]};
    if(q.text.startsWith('SELECT r.')&&q.text.includes('FROM erp_accounting_dimension r'))return {rows:[{id:q.values[4]||randomUUID(),type_id:randomUUID(),owner_division_id:division}]};
    if(q.text.startsWith('SELECT r.'))return {rows:[]};
    if(q.text.includes('schema_json,workflow_path_id FROM')){
      const type=q.values[2],schema=schemaFor(type)||defaults.customerSchema;
      assert.ok(schema,type);return {rows:[{id:randomUUID(),schema_json:schema,workflow_path_id:randomUUID()}]};
    }
    if(q.text.includes('FROM erp_workflow_step'))return {rows:[{}]};
    throw new Error('Unexpected query '+q.text);
  }};
  const result=await seedRecordExamples(ctx,{tenantId:'tenant',auth:{email:'owner@example.test'}},'org',defaults.exampleData);
  assert.equal(result.inserted,defaults.exampleData.length);
  const orders=calls.filter(q=>q.text.startsWith('INSERT INTO erp_accounting_object(')&&String(q.values[5]).startsWith('MO-'));
  assert.equal(orders.length,6);assert.equal(new Set(orders.map(q=>q.values[9])).size,6);
  for(const q of calls.filter(q=>q.text.startsWith('INSERT INTO erp_subledger_account('))){
    const positions=[...q.text.matchAll(/\$(\d+)/g)].map(m=>Number(m[1]));assert.equal(Math.max(...positions),q.values.length);
    if(q.text.includes('legal_entity_id'))assert.match(q.text,/\$8::jsonb,\$11,\$10/);
  }
});

let chromium;
try { ({chromium}=require('playwright')); } catch {}
test('configured maintenance references switch by Work Area and Fleet fields render at desktop and narrow widths',{skip:!chromium},async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.SHOWIF_BROWSER_CHANNEL?{channel:process.env.SHOWIF_BROWSER_CHANNEL}:{})});
  try {
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setContent('<style>body{display:block!important;overflow:auto!important;padding:16px}</style><form class="panel form accounting-record-editor" id="accounting-object-form"><div class="account-editor-tabs"><button data-record-tab="general" class="active">Identification</button></div><div id="accounting-object-detail-fields"></div></form>');
    await page.addStyleTag({content:fs.readFileSync(require.resolve('../public/style.css'),'utf8')});
    await page.addScriptTag({content:fs.readFileSync(require.resolve('../public/schema-visibility'),'utf8')});
    const app=fs.readFileSync(require.resolve('../public/app.js'),'utf8');
    await page.addScriptTag({content:'const $=id=>document.getElementById(id);const state={orgId:""};const pretty=name=>name;function syncRequiredMarkers(){}\n'+app.slice(app.indexOf('  function schemaFields('),app.indexOf('  function syncRecordTypeDescription('))+app.slice(app.indexOf('  function collectSchemaDetail('),app.indexOf('  function collectAccountDetail('))});
    for(const width of [1100,390]){
      await page.setViewportSize({width,height:900});
      await page.evaluate(schema=>renderSchemaDetailFields('accounting-object-detail-fields',schema,{workArea:'property'}),orderSchema);
      await page.evaluate(()=>showAccountingEditorTab('accounting-object','schema:tab-0'));
      for(const [area,visible] of [['property','property'],['equipment','asset'],['fleet','vehicle']]){
        await page.selectOption('[data-detail-field="workArea"]',area);
        for(const field of ['property','asset','vehicle'])assert.equal(await page.locator(`[data-detail-field="${field}"]`).evaluate(input=>input.closest('label').hidden),field!==visible);
      }
      assert.equal(await page.locator('[data-detail-field="workArea"]').evaluate(input=>input.required),true);
      assert.equal(await page.locator('[data-detail-field="vehicle"]').evaluate(input=>input.required),false);
      if(process.env.MAINTENANCE_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.MAINTENANCE_SCREENSHOT_DIR,`maintenance-work-area-${width}.png`),fullPage:true});
      await page.evaluate(schema=>renderSchemaDetailFields('accounting-object-detail-fields',schema,{registration:'DEMO-001',make:'Example',model:'Van'}),fleetSchema);
      await page.evaluate(()=>showAccountingEditorTab('accounting-object','schema:tab-0'));
      assert.equal(await page.locator('[data-detail-field="registration"]').inputValue(),'DEMO-001');
      assert.equal(await page.locator('[data-detail-field="assetAccount"]').evaluate(input=>input.required),false);
      assert.equal(await page.locator('[data-account-detail-tab]').count(),5);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    }
    assert.deepEqual(errors,[]);
  } finally {await browser.close();}
});
