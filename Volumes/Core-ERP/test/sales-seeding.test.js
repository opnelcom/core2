'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const defaults=require('../seeds/template-defaults.json');
const {validateSchemaDefinition,validateSchema}=require('../api/_shared/erp/utils');
const {normaliseWorkflow}=require('../api/_shared/erp/workflow-configuration');
const {seedWorkflowBindings}=require('../api/_shared/erp/workflow-seeding');
const {seedOrganisationDefaults}=require('../api/_shared/erp/seeding');

test('Sales definitions support prospects without customer accounts and add no example records',()=>{
  for(const code of ['sales_lead','sales_opportunity']){
    assert.ok(defaults.accountingObjectTypeSeeds.some(r=>r[0]===code));
    const schema=defaults.accountingObjectTypeMetadata[code].schema_json;
    assert.deepEqual(validateSchemaDefinition(schema),[]);
    assert.deepEqual(defaults.moduleMappings.accountingObjectTypes[code],['sales']);
    assert.equal(defaults.accountingObjectTypeMetadata[code].default_grid_view,'status');
    assert.ok(!defaults.exampleData.some(r=>r.type===code));
    assert.ok(defaults.rolePermissionSeeds.some(r=>r[0]==='organisation_sales_user'&&r[1]==='accounting_object'&&r[2]===code&&r[3]==='*'));
  }
  const lead=defaults.accountingObjectTypeMetadata.sales_lead.schema_json;
  assert.deepEqual(validateSchema(lead,{prospectName:'Prospect',email:'person@example.test'}),[]);
  const opportunity=defaults.accountingObjectTypeMetadata.sales_opportunity.schema_json;
  assert.deepEqual(validateSchema(opportunity,{scope:'Potential sale'}),[]);
  assert.deepEqual(opportunity.properties.lead.target,{class:'accounting_object',types:['sales_lead']});
  assert.deepEqual(opportunity.properties.customer.target,{class:'subledger_account',types:['customer']});
  assert.equal(lead.properties.closureReason.options.length,5);
  assert.equal(opportunity.properties.lossReason.options.length,8);
});

test('Sales workflows preserve alternative outcomes, reopening and skippable opportunity stages without implying automatic conversion',()=>{
  for(const name of ['Sales Lead','Sales Opportunity']){
    const workflow=defaults.workflows.find(w=>w.path_name===name);
    assert.doesNotThrow(()=>normaliseWorkflow(workflow,defaults.workflowStatuses));
    assert.ok(workflow.steps.every(s=>s.enabled_for_use === !['won','lost'].includes(s.step_code)));
    assert.ok(workflow.steps.flatMap(s=>s.actions).every(a=>a.role_codes.includes('organisation_sales_user')));
  }
  const lead=defaults.workflows.find(w=>w.path_name==='Sales Lead');
  assert.deepEqual(lead.steps.map(s=>s.step_code),['new','in_progress','converted','closed']);
  assert.equal(lead.steps.find(s=>s.step_code==='converted').actions.length,0);
  assert.equal(lead.steps.find(s=>s.step_code==='closed').actions[0].next_step_code,'in_progress');
  assert.ok(lead.steps[0].actions.some(a=>a.action_label==='Mark Converted'&&a.next_step_code==='converted'));
  const opportunity=defaults.workflows.find(w=>w.path_name==='Sales Opportunity');
  assert.deepEqual(opportunity.steps.map(s=>s.step_code),['open','proposal','negotiation','won','lost']);
  assert.ok(opportunity.steps[0].actions.some(a=>a.next_step_code==='won'));
  assert.equal(opportunity.steps.find(s=>s.step_code==='lost').actions[0].next_step_code,'open');
});

test('income and expense allocation remains optional and never substitutes for balance-sheet sub-ledgers',()=>{
  for(const code of ['sales_lead','sales_opportunity']){
    const lines=defaults.lineClassificationSeeds.filter(r=>r.type===code);
    assert.deepEqual(lines.map(r=>r.lineCode),['cash_sale_2','customer_invoice_2','supplier_invoice_1']);
    assert.ok(lines.every(r=>r.class==='accounting_object'&&r.requirement==='optional'&&r.valueBehaviour==='captured'));
  }
  assert.ok(defaults.lineDefinitionSeeds.some(r=>r[0]==='customer_invoice'&&r[1]===1&&r[5]==='customer'));
});

test('template seeding consolidates CRM, binds the two workflows and contains no schema or record writes',async()=>{
  assert.ok(!defaults.moduleSeeds.some(r=>r[0]==='crm'));
  assert.ok(!JSON.stringify(defaults.moduleMappings).includes('"crm"'));
  const calls=[];
  await seedOrganisationDefaults({planning:true,broker:async(_p,_a,q)=>{calls.push(...(q.statements||[q]));return {rows:[{is_template:true,tax_type_id:'tax'}]};}},{tenantId:'tenant',auth:{email:'owner@example.test'}},'org');
  const retirement=calls.find(q=>q.text.includes("module_code='crm'"));
  assert.deepEqual(retirement.values,['tenant','org']);
  assert.match(retirement.text,/is_seeded=true/);
  assert.ok(!calls.some(q=>/^\s*(ALTER|CREATE|DROP)\b/i.test(q.text)));
  assert.ok(!calls.some(q=>/INSERT INTO erp_accounting_object\s*\(/.test(q.text)));
  const bindings=[];
  await seedWorkflowBindings({broker:async(_p,_a,q)=>bindings.push(...q.statements)},{tenantId:'tenant'},'org');
  for(const [code,name] of [['sales_lead','Sales Lead'],['sales_opportunity','Sales Opportunity']])assert.ok(bindings.some(q=>q.values[2]===name&&q.values[3].includes(code)));
});
