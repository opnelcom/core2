'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildPack}=require('../packs/business-inception');
const {resolve}=require('../lib/runner');
const {comparePostings,cents}=require('../lib/checks');
const pack=buildPack();
test('scenario IDs and prerequisites form an ordered acyclic graph',()=>{
  const seen=new Set();for(const step of pack.steps){assert.ok(!seen.has(step.id),step.id);for(const dep of step.dependsOn)assert.ok(seen.has(dep),`${step.id} -> ${dep}`);seen.add(step.id);}
});
test('every seeded transaction type has a definition and an execution',()=>{
  for(const code of pack.seedCoverage.transactionTypes){assert.ok(pack.steps.some(s=>s.id===`type-${code}`));assert.ok(pack.steps.some(s=>s.kind==='journal'&&s.body.transaction_type_id.$ref===`outputs.type-${code}.transaction_type_id`),code);}
});
test('all configured journal inputs independently match accounting fixtures',()=>{
  const outputs={},parameters={adminOrganisationId:'00000000-0000-0000-0000-000000000001',organisationCode:'ERPTEST-123',organisationName:'Business',yearCode:'FY',periodCode:'FY-01',startDate:'2026-10-01',endDate:'2026-10-31',transactionDate:'2026-10-03'},connection={email:'tester@example.test'};
  for(const step of pack.steps){
    const row={};for(const field of ['organisation_id','division_id','module_id','role_id','workflow_path_id','gl_account_type_id','subledger_account_type_id','accounting_object_type_id','accounting_dimension_type_id','gl_account_id','legal_entity_id','subledger_account_id','accounting_object_id','accounting_dimension_id','fiscal_year_id','fiscal_period_id','transaction_group_id','transaction_type_id'])row[field]=`${step.id}:${field}`;
    outputs[step.id]=row;
  }
  const context={outputs,parameters,connection};
  for(const step of pack.steps){
    if(step.body)assert.doesNotThrow(()=>resolve(step.body,context),step.id);
    if(step.lookup)assert.doesNotThrow(()=>resolve(step.lookup,context),step.id);
    if(step.kind!=='journal')continue;
    const payload=resolve(step.body,context),definition=pack.steps.find(s=>s.id===payload.transaction_type_id.split(':')[0]);
    const actual=payload.lines.map(l=>{
      const config=definition.body.lines.find(d=>d.line_code===l.definition);assert.ok(config);
      if(config.subledger_requirement==='mandatory')assert.ok(l.subledger_account_id,step.id);
      assert.equal(l.accounting_objects.length,config.object_requirements.length,step.id);
      assert.equal(l.accounting_dimensions.length,config.dimension_requirements.length,step.id);
      return{gl:l.gl_account_id.split(':')[0].replace('gl-',''),subledger:l.subledger_account_id?.split(':')[0].replace('account-','')||null,
        debit:l.debit_amount,credit:l.credit_amount,objects:l.accounting_objects.map(o=>o.value_id.split(':')[0].replace('object-','')),dimensions:l.accounting_dimensions.map(d=>d.value_id.split(':')[0].replace('dimension-',''))};
    });
    assert.deepEqual(comparePostings(actual,step.expectedPostings),[],step.id);
    assert.equal(actual.reduce((sum,l)=>sum+cents(l.debit)-cents(l.credit),0),0,step.id);
  }
});
test('settlement requires project/asset objects and prevents unconfigured extra lines',()=>{
  const s=pack.steps.find(s=>s.id==='type-capex_settlement');assert.equal(s.body.allow_additional_lines,false);assert.equal(s.body.lines[0].occurrence,'repeatable');assert.equal(s.body.lines[2].amount_source,'balancing');assert.equal(s.body.lines[2].subledger_requirement,'mandatory');
});
