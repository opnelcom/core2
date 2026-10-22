'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const defaults=require('../seeds/template-defaults.json');
const {resolveTransactionSchemas}=require('../api/_shared/erp/transaction-schema-defaults');
const {validateSchema}=require('../api/_shared/erp/utils');
const {seedOrganisationDefaults}=require('../api/_shared/erp/seeding');
const {catalogue,compileReport}=require('../api/_shared/erp/report-definitions');

test('all 110 seeded transaction types resolve to supported independent schemas across 18 groups',()=>{
 const before=JSON.stringify(defaults),schemas=resolveTransactionSchemas(defaults);
 assert.equal(defaults.transactionTypes.length,110);assert.equal(Object.keys(schemas).length,110);
 assert.equal(new Set(defaults.transactionTypes.map(t=>t[1])).size,18);
 assert.equal(Object.keys(defaults.transactionSchemaFamilies).length,46);
 for(const [code,schema] of Object.entries(schemas)){
  assert.ok(Object.keys(schema.properties).length,code);assert.ok(schema.tabs.length,code);
  assert.ok(schema.required.every(key=>Object.hasOwn(schema.properties,key)),code);
  assert.ok(validateSchema(schema,{}).length>=schema.required.length,code);
 }
 assert.deepEqual(schemas.bank_deposit,schemas.cash_deposit_to_bank);
 schemas.bank_deposit.properties.depositSlipReference.title='Changed';
 assert.notEqual(schemas.cash_deposit_to_bank.properties.depositSlipReference.title,'Changed');
 assert.equal(JSON.stringify(defaults),before);
});
test('resolver rejects incomplete/unknown mappings and invalid schemas before seeding',()=>{
 for(const change of [
  d=>delete d.transactionTypeSchemaFamilies.manual_journal,
  d=>d.transactionTypeSchemaFamilies.manual_journal='absent',
  d=>d.transactionTypeSchemaFamilies.not_a_type='journal',
  d=>d.transactionSchemaFamilies.journal.schema_json.required=['not_defined'],
 ]){
  const d=structuredClone(defaults);change(d);assert.throws(()=>resolveTransactionSchemas(d));
 }
});
test('invoice families require supplier identification while cash purchases permit receipt-only evidence',()=>{
 const schemas=resolveTransactionSchemas(defaults);
 for(const code of ['supplier_invoice','municipal_services_invoice','capex_purchase_account','ppe_purchase_bank','insurance_premium_invoice']){
  assert.ok(schemas[code].required.includes('supplierInvoiceNumber'),code);
  assert.ok(schemas[code].required.includes('supplierInvoiceDate'),code);
 }
 assert.ok(!schemas.ppe_purchase_cash.required.includes('supplierInvoiceNumber'));
 assert.equal(schemas.tour_customer_invoice.required.length,0);
 for(const schema of Object.values(schemas)){
  for(const key of ['approvedBy','approvedAt','customer','supplier','asset','policy','project'])assert.ok(!Object.hasOwn(schema.properties,key));
 }
});
test('template definition payload contains resolved schemas for every seeded type',async()=>{
 const writes=[];
 await seedOrganisationDefaults({planning:true,broker:async(_p,_a,q)=>{writes.push(...(q.statements||[q]));return {rows:[{is_template:true,tax_type_id:'tax'}]};}},{tenantId:'tenant',auth:{email:'owner@example.test'}},'template');
 const query=writes.find(q=>q.text.includes('INSERT INTO erp_transaction_type('));
 const payload=JSON.parse(query.values[2]);assert.equal(payload.length,110);
 const schemas=resolveTransactionSchemas(defaults);
 for(const type of payload)assert.deepEqual(type.schema_json,schemas[type.type_code]);
 assert.deepEqual(query.values.slice(0,2),['tenant','template']);
});
test('existing supplier invoice report field reads the configurable value using a bound JSON key',async()=>{
 const datasets=await catalogue({broker:async()=>({rows:[]})},{tenantId:'tenant'},'org');
 const compiled=compileReport({dataset:'transaction',columns:[{field:'supplier_invoice_number'}],filters:[{field:'supplier_invoice_number',operator:'eq',value:'INV1'}]},datasets,{tenantId:'tenant',organisationId:'org',divisionIds:['division']});
 assert.match(compiled.text,/r.additional_data->>/);assert.ok(compiled.values.includes('supplierInvoiceNumber'));
 assert.ok(!compiled.text.includes('r.supplier_invoice_number'));assert.ok(compiled.values.includes('INV1'));
});
