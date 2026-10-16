"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const defaults=require('../seeds/template-defaults.json');
const {codeNumberingSeedStatements,seedCodeNumbering}=require('../api/_shared/erp/seed-code-numbering');
const {validateCodeNumbering,numberedRecordStatement,executeNumberedStatements}=require('../api/_shared/erp/code-numbering');
const {seedOrganisationDefaults}=require('../api/_shared/erp/seeding');

test('all 55 seeded types have valid explicit defaults with 29 distinct automatic prefixes and confirmed manual exceptions',()=>{
  const automatic=[];
  for(const [kind,key] of [['gl_account','glAccountTypeSeeds'],['subledger_account','ledgerFamilies'],['accounting_object','accountingObjectTypeSeeds'],['accounting_dimension','accountingDimensionTypeSeeds']]){
    assert.deepEqual(Object.keys(defaults.codeNumberingTypes[kind]).sort(),defaults[key].map(row=>row[0]).sort());
    for(const settings of Object.values(defaults.codeNumberingTypes[kind])){
      assert.deepEqual(validateCodeNumbering(settings).value,settings);
      if(settings.mode==='automatic'){automatic.push(settings);assert.equal(settings.start,1);assert.equal(settings.end,999999);assert.equal(settings.padding,6);}
    }
  }
  assert.equal(automatic.length,29);assert.equal(new Set(automatic.map(c=>c.prefix)).size,29);
  for(const [kind,code] of [['subledger_account','bank'],['accounting_object','fleet_vehicle'],['accounting_object','tour_vehicle'],['accounting_object','region']])assert.equal(defaults.codeNumberingTypes[kind][code].mode,'manual');
  for(const kind of ['gl_account','accounting_dimension'])assert.ok(Object.values(defaults.codeNumberingTypes[kind]).every(c=>c.mode==='manual'));
  assert.ok(defaults.accountingObjectTypeMetadata.insurance_policy.schema_json.required.includes('policyNumber'));
});
test('seeding scopes settings to defined types, leaves counters and record codes untouched, and rejects invalid configuration before writes',async()=>{
  let batch;
  const ctx={broker:async(profile,action,q)=>{assert.equal(profile,'core_erp');assert.equal(action,'transaction');batch=q;}};
  await seedCodeNumbering(ctx,{tenantId:'tenant'},'org',defaults);
  assert.equal(batch.statements.length,4);
  assert.equal(batch.statements.flatMap(s=>JSON.parse(s.values[2])).length,55);
  for(const s of batch.statements){assert.deepEqual(s.values.slice(0,2),['tenant','org']);assert.match(s.text,/type\.tenant_id=\$1 AND type\.organisation_id=\$2 AND type\.type_code=p.type_code/);assert.doesNotMatch(s.text,/code_number_next|object_code|account_code|dimension_code/);}
  const invalid=structuredClone(defaults);invalid.codeNumberingTypes.accounting_object.work_order.end=0;
  await assert.rejects(()=>seedCodeNumbering({broker:async()=>assert.fail('Must not write')},{tenantId:'tenant'},'org',invalid),/Invalid seeded numbering/);
  const unknown=structuredClone(defaults);unknown.codeNumberingTypes.accounting_object.unknown={mode:'manual'};
  assert.throws(()=>codeNumberingSeedStatements({tenantId:'tenant'},'org',unknown),/unseeded/);
});
test('initialisation applies per-type settings after all types are created and no longer resets sequence counters',async()=>{
  const calls=[];
  await seedOrganisationDefaults({planning:true,broker:async(_p,_a,q)=>{calls.push(...(q.statements||[q]));return {rows:[{is_template:true,tax_type_id:'tax'}]};}},
    {tenantId:'tenant',auth:{email:'owner@example.test'}},'org');
  for(const kind of Object.keys(defaults.codeNumberingTypes)){
    const insert=calls.findIndex(q=>q.text.includes(`INSERT INTO erp_${kind}_type(`));
    const numbering=calls.findIndex(q=>q.text.includes(`UPDATE erp_${kind}_type type SET code_numbering=p.code_numbering`));
    assert.ok(insert>=0&&numbering>insert,kind);
  }
  assert.doesNotMatch(fs.readFileSync(require.resolve('../api/_shared/erp/template-initialisation'),'utf8'),/code_number_next\s*=\s*NULL/);
});

function allocationFixture(kind,settings,{next=null,existingCodes=[],existingRecord=null}={}){
  const codes=new Set(existingCodes),writes=[];
  const client={query:async(text,values)=>{
    if(text.startsWith('SELECT code_numbering'))return {rows:[{code_numbering:settings,code_number_next:next}]};
    if(text.startsWith('SELECT 1 FROM'))return {rows:codes.has(values[2])?[{}]:[]};
    if(text.startsWith('SELECT')&&text.includes(' AS code'))return {rows:existingRecord?[{code:existingRecord}]:[]};
    if(text.startsWith('UPDATE erp_')&&text.includes('code_number_next=')){next=values[3];return {rows:[],rowCount:1};}
    writes.push({text,values});codes.add(values[3]);return {rows:[],rowCount:1};
  }};
  const statement=submittedId=>numberedRecordStatement({text:`INSERT INTO erp_${kind} VALUES($1,$2,$3,$4,$5)`,values:['tenant','org','type','ignored-input','record']},
    {kind,typeParameter:3,codeParameter:4,idParameter:5,submittedId});
  return {client,statement,writes,next:()=>next};
}
test('confirmed policy, claim, employee and meter settings allocate internal codes using the existing ERP allocator',async()=>{
  for(const [kind,code,prefix] of [['accounting_object','insurance_policy','POL-'],['accounting_object','insurance_claim','CLM-'],['subledger_account','employee','EMP-'],['accounting_object','utility_meter','MTR-']]){
    const f=allocationFixture(kind,defaults.codeNumberingTypes[kind][code]);
    await executeNumberedStatements(f.client,[f.statement(null)]);await executeNumberedStatements(f.client,[f.statement(null)]);
    assert.deepEqual(f.writes.map(q=>q.values[3]),[prefix+'000001',prefix+'000002']);assert.equal(f.next(),3);
  }
});
test('existing matching codes are skipped, established cursors continue, edits preserve codes, and exhausted ranges reject writes',async()=>{
  const settings=defaults.codeNumberingTypes.accounting_object.work_order;
  const collision=allocationFixture('accounting_object',settings,{existingCodes:['MO-000001']});
  await executeNumberedStatements(collision.client,[collision.statement(null)]);assert.equal(collision.writes[0].values[3],'MO-000002');
  const continued=allocationFixture('accounting_object',settings,{next:42});
  await executeNumberedStatements(continued.client,[continued.statement(null)]);assert.equal(continued.writes[0].values[3],'MO-000042');
  const edited=allocationFixture('accounting_object',settings,{next:42,existingRecord:'MO-001'});
  await executeNumberedStatements(edited.client,[edited.statement('record')]);assert.equal(edited.writes[0].values[3],'MO-001');assert.equal(edited.next(),42);
  const exhausted=allocationFixture('accounting_object',settings,{next:1000000});
  await assert.rejects(()=>executeNumberedStatements(exhausted.client,[exhausted.statement(null)]),/range exhausted/);assert.equal(exhausted.writes.length,0);
});
