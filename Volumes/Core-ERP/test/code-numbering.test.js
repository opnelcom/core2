"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { validateCodeNumbering, numberedRecordStatement, saveNumberedTransaction } = require("../api/_shared/erp/code-numbering");

test("numbering settings validate bounds and optional formatting; old clients preserve settings", () => {
  assert.deepEqual(validateCodeNumbering(undefined), { value: null });
  assert.deepEqual(validateCodeNumbering({ mode: "manual" }).value, { mode: "manual" });
  assert.deepEqual(validateCodeNumbering({ mode: "automatic", start: 0, end: 0 }).value,
    { mode: "automatic", start: 0, end: 0, padding: 0, prefix: "" });
  for (const patch of [{ start: -1 }, { start: 1.5 }, { end: 9 }, { end: Number.MAX_SAFE_INTEGER },
    { padding: 33 }, { padding: 0.5 }, { prefix: "x".repeat(33) }, { prefix: " x " }, { mode: "other" }])
    assert.ok(validateCodeNumbering({ mode: "automatic", start: 10, end: 20, ...patch }).error);
});

test("numbering metadata preserves SQL and parameter positions",()=>{
 const original={text:"VALUES($1,$2,$3,$30,$5,$10)",values:[]};
 const statement=numberedRecordStatement(original,{kind:"gl_account",codeParameter:3,typeParameter:5,idParameter:10,submittedId:null});
 assert.equal(statement.text,original.text);assert.equal(statement.numbering.codeParameter,3);
});
test("unrelated broker failures retain their status",async()=>{
 const error=Object.assign(new Error("Database unavailable"),{status:503});
 const statement=numberedRecordStatement({text:'INSERT INTO erp_gl_account VALUES($1)',values:['tenant','org','type','code']},
  {kind:'gl_account',typeParameter:3,codeParameter:4,idParameter:5,submittedId:null});
 await assert.rejects(saveNumberedTransaction({broker:async()=>{throw error;}},[statement]),e=>e.status===503);
});
