'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {remapSchemaReferences}=require('../api/_shared/erp/copy-schema-references');
test('recursive copy preserves formats, unrelated values and source data',()=>{
 const schema={properties:{owner:{type:'reference',target:{class:'legal_entity'}},items:{type:'grid',rowSchema:{properties:{item:{type:'reference',target:{anyOf:[{class:'accounting_object'}]}},details:{type:'grid',rowSchema:{properties:{unit:{type:'reference',target:{class:'accounting_dimension'}}}}}}}}}};
 const data={owner:'old-owner',items:[{item:'accounting_object:old-item',details:[{unit:'old-unit',amount:'999999999999999.99'}],memo:'Keep'}],other:{unconfigured:'old-owner'}};
 const original=JSON.stringify(data);
 const copied=remapSchemaReferences(data,schema,{'legal_entity:old-owner':'legal_entity:new-owner','accounting_object:old-item':'accounting_object:new-item','accounting_dimension:old-unit':'accounting_dimension:new-unit'});
 assert.equal(copied.owner,'new-owner');assert.equal(copied.items[0].item,'accounting_object:new-item');assert.equal(copied.items[0].details[0].unit,'new-unit');assert.equal(copied.items[0].details[0].amount,'999999999999999.99');assert.deepEqual(copied.other,data.other);assert.equal(JSON.stringify(data),original);
});
test('missing matches become null; absent and non-string values stay intact',()=>{
 const schema={properties:Object.fromEntries(['missing','blank','absent','invalid','empty'].map(key=>[key,{type:'reference',target:{class:'resource'}}]))};
 assert.deepEqual(remapSchemaReferences({missing:'source',blank:null,invalid:12,empty:''},schema,{}),{missing:null,blank:null,invalid:12,empty:null});
 assert.equal(remapSchemaReferences(null,schema,{}),null);assert.deepEqual(remapSchemaReferences([1],schema,{}),[1]);
});
