'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {identifier,connectionOptions,validateSelection,insertQuery,generate,withSource} = require('../api/_shared/postgres');
const source = {host:'db.example.com',database:'source',username:'reader',password:'secret'};
const schemas = [{name:'odd"schema',tables:[{name:'table',columns:[{name:'id',datatype:'bigint',identity:'a'},{name:"O'Brien",datatype:'text'},{name:'computed',datatype:'text',generated:true}]}]}];
test('connection validates port/host/TLS and verifies certificates by default',()=>{
  assert.equal(connectionOptions(source).ssl.rejectUnauthorized,true);
  assert.equal(connectionOptions({...source,sslMode:'disable'}).ssl,false);
  for(const patch of [{port:0},{port:1.5},{host:'/tmp'},{host:'postgres://source'},{database:''},{sslMode:'require'}]) assert.throws(()=>connectionOptions({...source,...patch}));
});
test('catalog selection rejects invented identifiers, duplicate and generated columns',()=>{
  const selection={schema:'odd"schema',table:'table',columns:['id']};
  assert.equal(validateSelection(schemas,[selection])[0].columns[0].name,'id');
  for(const selections of [[],[selection,selection],[{...selection,columns:['id','id']}],[{...selection,columns:['computed']}],[{...selection,columns:['absent']}],[{...selection,table:'absent'}]]) assert.throws(()=>validateSelection(schemas,selections));
});
test('INSERT SQL safely quotes identifiers, preserves NULL/types and overrides identity',()=>{
  const selection=validateSelection(schemas,[{schema:'odd"schema',table:'table',columns:['id',"O'Brien"]}])[0];
  const sql=insertQuery(selection,100);
  assert.equal(identifier('a"; DROP TABLE x;--'),'"a""; DROP TABLE x;--"');
  assert.ok(sql.includes('"odd""schema"."table"'));
  assert.ok(sql.includes('OVERRIDING SYSTEM VALUE'));
  assert.ok(sql.includes("O''Brien"));
  assert.ok(sql.includes("THEN 'NULL' ELSE quote_literal"));
  assert.ok(sql.includes("'::bigint'"));
  assert.ok(sql.endsWith('LIMIT 101'));
  assert.ok(!insertQuery(selection,0).includes('LIMIT'));
});
test('replacements accept empty text and NULL but reject unselected/duplicate/invalid values',()=>{
  const selection={schema:'odd"schema',table:'table',columns:['id',"O'Brien"]};
  const replacements=[{column:"O'Brien",mode:'value',value:''},{column:'id',mode:'null'}];
  assert.deepEqual(validateSelection(schemas,[{...selection,replacements}])[0].replacements,replacements);
  for(const replacements of [[{column:'computed',mode:'null'}],[{column:'id',mode:'expression',value:'now()'}],[{column:'id',mode:'value',value:42}],[{column:'id',mode:'value',value:'\0'}],[{column:'id',mode:'null'},{column:'id',mode:'null'}]])assert.throws(()=>validateSelection(schemas,[{...selection,replacements}]));
});
function fakeClient(rows){let batch=0;const calls=[];return {calls,query:async sql=>{calls.push(sql);if(sql.startsWith('SELECT n.nspname'))return {rows:[{schema:'public',table:'data',name:'id',datatype:'bigint',generated:false,identity:'',required:true}]};if(sql.startsWith('FETCH'))return {rows:batch++ ? [] : rows.map(statement=>({statement}))};return {rows:[]};}};}
test('preview detects extra rows and closes its cursor',async()=>{
  const client=fakeClient(['INSERT 1;','INSERT 2;','INSERT 3;']);
  const result=await generate(client,{mode:'preview',selections:[{schema:'public',table:'data',columns:['id']}]},{previewRows:2});
  assert.deepEqual(result.statements,['INSERT 1;','INSERT 2;']);assert.equal(result.tables[0].truncated,true);assert.ok(client.calls.includes('CLOSE migration_rows'));
});
test('full generation exports all batches and output limit rejects partial scripts',async()=>{
  const body={mode:'all',selections:[{schema:'public',table:'data',columns:['id']}]};
  const result=await generate(fakeClient(['one','two','three']),body,{});assert.equal(result.statements.length,3);assert.equal(result.tables[0].truncated,false);
  const client=fakeClient(['oversized']);await assert.rejects(generate(client,body,{maxExportBytes:2}),error=>error.status===413);assert.ok(client.calls.includes('CLOSE migration_rows'));
});
test('read-only snapshot always closes connection and sanitises driver failures',async()=>{
  let instance;
  class Client {constructor(){instance=this;this.calls=[];}on(){} async connect(){} async query(sql){this.calls.push(sql);}async end(){this.ended=true;}}
  assert.equal(await withSource(source,{},async()=>42,Client),42);
  assert.ok(instance.calls[0].includes('READ ONLY'));assert.ok(instance.calls[1].includes('search_path = pg_catalog'));assert.equal(instance.calls.at(-1),'COMMIT');assert.equal(instance.ended,true);
  await assert.rejects(withSource(source,{},()=>{throw new Error('secret remote data');},Client),error=>error.status===502&&!error.message.includes('secret'));assert.equal(instance.ended,true);
});
