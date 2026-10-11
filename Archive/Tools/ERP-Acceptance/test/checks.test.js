'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {cents,subset,comparePostings,ledgerComparison}=require('../lib/checks');
test('money uses exact minor units and rejects excess precision',()=>{
  assert.equal(cents('0.29'),29);assert.equal(cents('-100.01'),-10001);assert.throws(()=>cents('1.001'));assert.throws(()=>cents('NaN'));
});
test('same GL total with wrong asset or meter fails verification',()=>{
  const expected=[{gl:'1290',debit:'100',credit:'0',subledger:'PROJECT',objects:['PROPERTY','WATER']}];
  assert.equal(comparePostings(expected,expected).length,0);
  assert.ok(comparePostings([{...expected[0],subledger:'WRONG'}],expected).length);
  assert.ok(comparePostings([{...expected[0],objects:['PROPERTY','ELECTRICITY']}],expected).length);
});
test('reconciliation catches unexpected accounts and equal-balance turnover errors',()=>{
  const expected=[{gl:'1000',debit:'100',credit:'100'}];
  const rows=ledgerComparison([{account_code:'1000',debit_total:'200',credit_total:'200',balance:'0'},{account_code:'2999',debit_total:'5',credit_total:'0',balance:'5'}],expected);
  assert.equal(rows[0].difference,0);assert.equal(rows[0].passed,false);assert.equal(rows[1].passed,false);
});
test('configuration verifies every required field and line occurrence',()=>{assert.equal(subset({a:1,b:2},{a:1}).length,0);assert.ok(subset({lines:[]},{lines:[{occurrence:'repeatable'}]}).length);});
