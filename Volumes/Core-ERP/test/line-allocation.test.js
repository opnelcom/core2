'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {objectAllocationError,objectDefinitionError}=require('../api/_shared/erp/line-allocation');
const seeds=require('../seeds/template-defaults.json');
const permitted=[{accounting_object_type_id:'property'},{accounting_object_type_id:'cost_centre'}];
const definition={object_requirement:'mandatory',object_value_behaviour:'captured',subledger_requirement:'not_used'};

test('mandatory allocation selects one of the permitted types, optional permits none, and both reject multiple or mixed allocations',()=>{
 for(const type of permitted){assert.equal(objectAllocationError(definition,permitted,[{type_id:type.accounting_object_type_id,value_id:'record'}],null),null);}
 assert.match(objectAllocationError(definition,permitted,[],null),/requires one/);
 assert.equal(objectAllocationError({...definition,object_requirement:'optional'},permitted,[],null),null);
 assert.match(objectAllocationError(definition,permitted,[{type_id:'other',value_id:'record'}],null),/unconfigured/);
 assert.match(objectAllocationError(definition,permitted,[{type_id:'property',value_id:'one'},{type_id:'cost_centre',value_id:'two'}],null),/at most one/);
 assert.match(objectAllocationError(definition,permitted,[{type_id:'property',value_id:'one'}],'supplier'),/cannot combine/);
 assert.match(objectAllocationError({object_requirement:'not_used'},permitted,[{type_id:'property',value_id:'one'}],null),/does not use/);
});

test('fixed allocation permits only its single configured record; defaulted values can be changed within permitted types',()=>{
 const selected=[{type_id:'cost_centre',value_id:'facilities'}];
 assert.equal(objectAllocationError({...definition,object_value_behaviour:'fixed',default_accounting_object_id:'facilities'},permitted,selected,null),null);
 assert.match(objectAllocationError({...definition,object_value_behaviour:'fixed',default_accounting_object_id:'other'},permitted,selected,null),/fixed/);
 assert.equal(objectAllocationError({...definition,object_value_behaviour:'defaulted',default_accounting_object_id:'other'},permitted,selected,null),null);
});

test('definition requirement belongs to the allocation, with alternative types and only one default value',()=>{
 const line={...definition,object_requirements:[{type_id:'property'},{type_id:'cost_centre'}]};
 assert.equal(objectDefinitionError(line),null);
 assert.match(objectDefinitionError({...line,subledger_requirement:'mandatory'}),/both/);
 assert.match(objectDefinitionError({...line,object_requirements:[]}),/permitted/);
 assert.match(objectDefinitionError({...line,object_requirement:'not_used'}),/permitted/);
 assert.match(objectDefinitionError({...line,object_value_behaviour:'fixed'}),/provide one/);
 assert.match(objectDefinitionError({...line,object_requirements:[{type_id:'property'},{type_id:'property'}]}),/distinct/);
});

test('all seeded allocations resolve to income-statement lines, permitted types and agreed domain rules',()=>{
 const types=new Set(seeds.accountingObjectTypeSeeds.map(row=>row[0]));
 const codes=new Map(seeds.lineDefinitionSeeds.map(row=>[row[8]||`${row[0]}_${row[1]}`,row]));
 for(const plan of seeds.objectAllocationSeeds){
   const line=codes.get(plan.lineCode);assert.ok(line,plan.lineCode);assert.equal(line[4],false);
   const gl=seeds.chartTemplate.find(row=>row[0]===line[3]);assert.ok(['expense','revenue'].includes(gl[2]),plan.lineCode);
   assert.ok(plan.permittedTypes.every(type=>types.has(type)));assert.equal(new Set(plan.permittedTypes).size,plan.permittedTypes.length);
 }
 const allocation=code=>seeds.objectAllocationSeeds.find(row=>row.lineCode===code);
 assert.deepEqual(allocation('supplier_invoice_1').permittedTypes,['property','cost_centre']);
 assert.deepEqual(allocation('electricity_consumption').permittedTypes,['utility_meter']);
 assert.deepEqual(allocation('property_rates').permittedTypes,['property']);
 assert.deepEqual(allocation('tour_customer_invoice_2').permittedTypes,['tour_booking']);
 assert.equal(allocation('cash_sale_2'),undefined);
 assert.ok(!seeds.lineClassificationSeeds.some(row=>row.class==='accounting_object'));
 assert.ok(!seeds.exampleDataBindings.some(row=>row.class==='accounting_object'));
});

function setupFixture(){
 const calls=[];
 const erp={authTenant:async()=>({tenantId:'tenant'}),requireAdmin:()=>null,clean:(v,f='')=>String(v??'').trim()||f,nullable:v=>v||null,validateWorkflowPath:async()=>null};
 const scope={module:{exports:{}},require:name=>name==='crypto'?require('node:crypto'):name.endsWith('/context')?require('../api/_shared/context'):name.endsWith('/transaction-line-order')?require('../api/_shared/erp/transaction-line-order'):name.endsWith('/transaction-plan')?require('../api/_shared/erp/transaction-plan'):name.endsWith('/line-allocation')?require('../api/_shared/erp/line-allocation'):name.endsWith('/grid-views')?require('../api/_shared/erp/grid-views'):name.endsWith('/modules')?{moduleIds:()=>[],validateModules:async()=>null,replaceLinks:async()=>{}}:erp};
 vm.createContext(scope);vm.runInContext(fs.readFileSync(require.resolve('../api/transaction-types/save'),'utf8'),scope);
 const line={gl_account_id:'expense',debit_credit:'debit',subledger_requirement:'not_used',object_requirement:'mandatory',object_value_behaviour:'captured',object_requirements:[{type_id:'property'},{type_id:'cost_centre'}],dimension_requirements:[{type_id:'service',requirement:'mandatory',value_behaviour:'fixed',accounting_dimension_id:'water'}]};
 const ctx={req:{method:'POST'},body:{organisation_id:'org',transaction_group_id:'group',workflow_path_id:'workflow',type_code:'invoice',type_name:'Invoice',lines:[line,{gl_account_id:'payable',debit_credit:'credit',subledger_requirement:'mandatory',subledger_account_type_id:'vendor'}]},send:(status,body)=>({status,body}),broker:async(_p,action,q)=>{
  calls.push(q);if(action==='transaction')return {results:q.statements.map(()=>({rows:[],rowCount:1}))};
  if(q.text.includes('WITH read_rows')&&q.text.includes('FROM erp_transaction_type'))return {rows:[]};
  if(q.text.startsWith('SELECT accounting_object_id,accounting_object_type_id'))return {rows:[{accounting_object_id:'default',accounting_object_type_id:'property'}]};
  if(q.text.startsWith('SELECT accounting_dimension_id,accounting_dimension_type_id'))return {rows:[{accounting_dimension_id:'water',accounting_dimension_type_id:'service'}]};
  const match=q.text.match(/^SELECT (\w+) FROM/);
  if(match&&Array.isArray(q.values[2]))return {rows:q.values[2].map(value=>({[match[1]]:value}))};
  return {rows:[{transaction_type_id:'invoice'}]};
 }};
 return {ctx,calls,run:()=>scope.module.exports(ctx)};
}
test('setup API saves alternatives separately from allocation-level settings and preserves dimension configuration',async()=>{
 const f=setupFixture();assert.equal((await f.run()).ok,true);
 const statements=f.calls.at(-1).statements;
 for(const statement of statements){if(!statement.values)continue;const params=[...statement.text.matchAll(/\$(\d+)/g)].map(m=>Number(m[1]));assert.equal(Math.max(...params),statement.values.length);}
 const objects=statements.filter(q=>q.text.startsWith('INSERT INTO erp_transaction_line_definition_object_type'));
 assert.equal(objects.length,2);assert.ok(objects.every(q=>q.values.length===5));
 const dimension=statements.find(q=>q.text.startsWith('INSERT INTO erp_transaction_line_definition_dimension_type'));
 assert.deepEqual(Array.from(dimension.values.slice(3,7)),['service','mandatory','fixed','water']);
});
test('setup API rejects mixed allocation and foreign default objects before writing',async()=>{
 for(const mutate of [l=>{l.subledger_requirement='mandatory';l.subledger_account_type_id='vendor';},l=>{l.default_accounting_object_id='default';l.object_value_behaviour='fixed';l.object_requirements=[{type_id:'cost_centre'}];}]){
  const f=setupFixture();mutate(f.ctx.body.lines[0]);assert.equal((await f.run()).status,400);assert.ok(!f.calls.some(q=>q.text?.startsWith('INSERT')||q.statements));
 }
});

test('schema updates existing definitions and enforces one captured object without changing dimensions',()=>{
 const sql=fs.readFileSync(require.resolve('../schema/erp-schema.sql'),'utf8');
 assert.match(sql,/ALTER TABLE erp_transaction_line_definition ADD COLUMN IF NOT EXISTS object_requirement/);
 assert.match(sql,/erp_line_allocation_exclusive/);
 assert.match(sql,/CREATE UNIQUE INDEX IF NOT EXISTS erp_journal_line_single_object_idx.*\(journal_line_id\)/);
 assert.match(sql,/UNIQUE\(journal_line_id,accounting_dimension_type_id\)/);
});

test('posting validates the same allocation alternatives, fixed value and optional sub-ledger rules',async()=>{
 const {validateJournal}=require('../api/_shared/erp/journals');
 const first={line_number:1,debit_amount:100,credit_amount:0,gl_account_id:'expense',definition_gl_account_id:'expense',object_requirement:'mandatory',object_value_behaviour:'captured',subledger_requirement:'not_used',object_allocations:[{type_id:'property',value_id:'property1'}],permitted_object_types:permitted};
 const second={line_number:2,debit_amount:0,credit_amount:100,gl_account_id:'payable',definition_gl_account_id:'payable',subledger_requirement:'optional',definition_subledger_type_id:'vendor',object_allocations:[],object_requirement:'not_used'};
 const run=(line=first)=>validateJournal({broker:async()=>({rows:[line,second]})},'tenant','journal');
 await run();
 for(const change of [{object_allocations:[]},{subledger_account_id:'vendor'},{object_value_behaviour:'fixed',default_accounting_object_id:'other'},{object_allocations:[{type_id:'other',value_id:'other'}]},{object_allocations:[{type_id:'property',value_id:'p'},{type_id:'cost_centre',value_id:'c'}]}]){
   await assert.rejects(run({...first,...change}),error=>error.status===400);
 }
});

test('definition seeding replaces only scoped permitted types and leaves journal and dimension data intact',async()=>{
 const {seedLineClassifications}=require('../api/_shared/erp/seed-line-classifications');
 const calls=[];
 await seedLineClassifications({broker:async(_p,_a,q)=>{calls.push(q);return {rows:[]};}}, {tenantId:'tenant'},'org',seeds);
 const removed=calls.find(q=>q.text.startsWith('DELETE'));
 assert.deepEqual(removed.values.slice(0,2),['tenant','org']);
 assert.equal(removed.values[2].length,seeds.lineDefinitionSeeds.length);
 assert.match(removed.text,/line\.line_code=ANY\(\$3::text\[\]\)/);
 assert.ok(!calls.some(q=>/erp_journal|DELETE FROM erp_transaction_line_definition_dimension_type/.test(q.text)));
 const invalid={lineDefinitionSeeds:seeds.lineDefinitionSeeds,objectAllocationSeeds:[{lineCode:'missing',permittedTypes:['property'],requirement:'mandatory',valueBehaviour:'captured'}]};
 let writes=0;
 await assert.rejects(seedLineClassifications({broker:async()=>{writes++;}}, {tenantId:'tenant'},'org',invalid),/Invalid object allocation seed/);
 assert.equal(writes,0);
});

test('reordering saves explicit values, swaps unique keys atomically and preserves journal references',async()=>{
 const f=setupFixture(),broker=f.ctx.broker;
 f.ctx.body.transaction_type_id='invoice';
 const existing=[{transaction_line_definition_id:'a',line_code:'expense',line_order:10},{transaction_line_definition_id:'b',line_code:'payable',line_order:20}];
 f.ctx.body.lines.forEach((line,index)=>Object.assign(line,{transaction_line_definition_id:existing[index].transaction_line_definition_id,line_code:existing[index].line_code,line_order:index===0?20:10}));
 f.ctx.broker=async(profile,action,q)=>{
  if(q.text?.startsWith('WITH read_rows')&&q.text.includes('FROM erp_transaction_type ')){f.calls.push(q);return {rows:[{transaction_type_id:'invoice',__erp_snapshot:'[{"transaction_type_id":"invoice"}]'}]};}
  if(q.text?.startsWith('WITH read_rows')&&q.text.includes('FROM erp_transaction_line_definition ')){f.calls.push(q);return {rows:existing.map(row=>({...row,__erp_snapshot:JSON.stringify(existing)}))};}
  return broker(profile,action,q);
 };
 assert.equal((await f.run()).ok,true);
 const statements=f.calls.at(-1).statements;
 assert.match(statements[0].text,/LOCK TABLE/);
 assert.ok(statements.some(q=>q.expectedRowCount===1&&q.text.includes('checked.snapshot=')));
 const inserted=statements.filter(q=>q.text.startsWith('INSERT INTO erp_transaction_line_definition('));
 assert.deepEqual(inserted.map(q=>[q.values[0],q.values[4]]),[['a',20],['b',10]]);
 const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(':memory:');
 try{
  db.exec(`PRAGMA foreign_keys=ON;
   CREATE TABLE erp_transaction_line_definition(transaction_line_definition_id PRIMARY KEY,tenant_id,organisation_id,transaction_type_id,line_order,line_code,debit_credit,gl_account_id,occurrence,subledger_requirement,subledger_account_type_id,amount_source,line_description,object_requirement,object_value_behaviour,default_accounting_object_id,UNIQUE(transaction_type_id,line_order),UNIQUE(transaction_type_id,line_code));
   CREATE TABLE erp_transaction_line_definition_object_type(tenant_id,organisation_id,transaction_line_definition_id REFERENCES erp_transaction_line_definition,accounting_object_type_id,sort_order);
   CREATE TABLE erp_transaction_line_definition_dimension_type(tenant_id,organisation_id,transaction_line_definition_id REFERENCES erp_transaction_line_definition,accounting_dimension_type_id,requirement,value_behaviour,accounting_dimension_id,sort_order);
   CREATE TABLE journal_reference(id,definition_id REFERENCES erp_transaction_line_definition);
   INSERT INTO erp_transaction_line_definition(transaction_line_definition_id,tenant_id,organisation_id,transaction_type_id,line_order,line_code) VALUES('a','tenant','org','invoice',10,'expense'),('b','tenant','org','invoice',20,'payable');
   INSERT INTO journal_reference VALUES('journal-debit','a'),('journal-credit','b');BEGIN;`);
  for(const q of statements.filter(q=>/^(UPDATE|DELETE FROM|INSERT INTO) erp_transaction_line_definition/.test(q.text))){
   const sql=q.text.replace(/(\w+)=ANY\(\$(\d+)::uuid\[\]\)/g,'$1 IN (SELECT value FROM json_each($$$2))');
   db.prepare(sql).run(Object.fromEntries(q.values.map((v,i)=>[String(i+1),Array.isArray(v)?JSON.stringify(v):v])));
  }
  db.exec('COMMIT');
  assert.deepEqual(db.prepare('SELECT definition_id FROM journal_reference ORDER BY id').all().map(row=>row.definition_id),['b','a']);
  assert.deepEqual(db.prepare('SELECT transaction_line_definition_id FROM erp_transaction_line_definition ORDER BY line_order').all().map(row=>row.transaction_line_definition_id),['b','a']);
 }finally{db.close();}
});

test('sort validation rejects invalid or duplicate values before writes and foreign definition IDs cannot be reused',async()=>{
 for(const value of ['',-1,1.5,2147483648,null,true,'NaN']){
  const f=setupFixture();f.ctx.body.lines[0].line_order=value;
  assert.equal((await f.run()).status,400);assert.ok(!f.calls.some(q=>q.statements));
 }
 const duplicate=setupFixture();duplicate.ctx.body.lines.forEach(line=>{line.line_order=10;});assert.equal((await duplicate.run()).status,400);
 const {prepareLineIdentities}=require('../api/_shared/erp/transaction-line-order');
 assert.throws(()=>prepareLineIdentities([{requestedId:'foreign',lineCode:'expense',lineOrder:10}],[]),/does not belong/);
 const copy=[{requestedId:'source',lineCode:'expense',lineOrder:10}];prepareLineIdentities(copy,[],true);assert.notEqual(copy[0].definitionId,'source');
});
