'use strict';
// An isolated PostgreSQL engine; never connects to any live database.
const {PGlite}=require('@electric-sql/pglite');
const assert=require('node:assert/strict');
const {generate,catalog,identifier}=require('../api/_shared/postgres');
const schemaName = `odd'"schema`, qualified = identifier(schemaName);
(async()=>{
 const db=new PGlite();
 try{
 await db.exec(`CREATE SCHEMA ${qualified};
 CREATE TYPE ${qualified}.mood AS ENUM ('happy','sad');
 CREATE TABLE ${qualified}."records" (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
   txt text, amount numeric(30,8), stamp timestamptz, local_stamp timestamp, date_value date,
   binary_value bytea, tags text[], json_value jsonb, flag boolean, status ${qualified}.mood,
   nullable text, calculated bigint GENERATED ALWAYS AS (id + 1) STORED);
 INSERT INTO ${qualified}."records" (txt,amount,stamp,local_stamp,date_value,binary_value,tags,json_value,flag,status)
 VALUES (E'quote '' and slash \\\\ and newline\\nend',1234567890123456789012.12345678,
   '2026-10-07 12:34:56.123456+02','2026-10-07 12:34:56.123456','2026-10-07',
   decode('00ff1234','hex'),ARRAY['a,b','quote''','back\\slash',NULL],'{"large":12345678901234567890,"string":"value"}',true,'happy');
 SET search_path=pg_catalog; SET standard_conforming_strings=on; SET DateStyle='ISO, YMD'; SET TimeZone='UTC'; SET bytea_output='hex'; SET extra_float_digits=3;`);
 const client={query:(sql,values)=>/^(DECLARE|CLOSE)/.test(sql)?db.exec(sql).then(()=>({rows:[]})):db.query(sql,values)};
 const schemas=await catalog(client), table=schemas.find(s=>s.name===`odd'"schema`).tables[0];
 assert.ok(table.columns.find(c=>c.name==='calculated').generated);
 assert.ok(table.columns.find(c=>c.name==='status').datatype.includes(`odd'""schema`));
 const query=`SELECT row_to_json(r)::text AS data FROM ${qualified}.records r`;
 const original=(await db.query(query)).rows;
 await db.exec('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const generated=await generate(client,{mode:'all',selections:[{schema:`odd'"schema`,table:'records',columns:table.columns.filter(c=>!c.generated).map(c=>c.name)}]},{});
 await db.exec('COMMIT');
 assert.equal(generated.statements.length,1);assert.ok(generated.statements[0].includes('OVERRIDING SYSTEM VALUE'));
 await db.exec(`TRUNCATE ${qualified}.records;`);await db.exec(generated.statements.join('\n'));
 assert.deepEqual((await db.query(query)).rows,original);
 await db.exec(`INSERT INTO ${qualified}.records (txt,nullable) VALUES ('second','not null');`);
 const before=(await db.query(query)).rows;
 const fixedText="Robert'); DROP TABLE records; -- \\ newline\nend";
 const replacementSelection={schema:schemaName,table:'records',columns:table.columns.filter(c=>!c.generated).map(c=>c.name),replacements:[{column:'txt',mode:'value',value:fixedText},{column:'amount',mode:'value',value:'9999999999999999999999.12345678'},{column:'nullable',mode:'null'},{column:'status',mode:'value',value:'sad'},{column:'json_value',mode:'value',value:'{"fixed":true}'},{column:'tags',mode:'value',value:'{fixed,values}'}]};
 for(const mode of ['preview','all']){
   await db.exec('BEGIN READ ONLY');const output=await generate(client,{mode,selections:[replacementSelection]},{});await db.exec('COMMIT');assert.equal(output.statements.length,2);
   assert.deepEqual((await db.query(query)).rows,before,'Source records must remain unchanged');
   await db.exec('BEGIN');await db.exec(`TRUNCATE ${qualified}.records;`);await db.exec(output.statements.join('\n'));
   const rows=(await db.query(`SELECT txt,amount::text,nullable,status::text,json_value,tags FROM ${qualified}.records`)).rows;
   assert.ok(rows.every(row=>row.txt===fixedText&&row.amount==='9999999999999999999999.12345678'&&row.nullable===null&&row.status==='sad'&&row.json_value.fixed&&row.tags.join(',')==='fixed,values'));
   await db.exec('ROLLBACK');
 }
 await db.exec('BEGIN READ ONLY');const empty=await generate(client,{mode:'all',selections:[{...replacementSelection,replacements:[{column:'txt',mode:'value',value:''}]}]},{});await db.exec('COMMIT');assert.ok(empty.statements.every(sql=>sql.includes("''::text")));
 for(const [column,value] of [['amount','invalid number'],['status','unknown'],['json_value','invalid json']]){
   await db.exec('BEGIN READ ONLY');await assert.rejects(generate(client,{mode:'all',selections:[{...replacementSelection,replacements:[{column,mode:'value',value}]}]},{}),error=>error.status===400&&error.message.includes(column));await db.exec('ROLLBACK');
 }
 console.log('PASS: PostgreSQL typed INSERT round-trip for quoted names, text escapes, NULL, bigint identities, exact numeric, timestamps, dates, bytea, arrays, JSON, boolean, custom enum and generated columns.');
 console.log('PASS: fixed typed values/NULL for every row in preview/full output, empty strings, injection-safe text, unchanged source data and invalid datatype rejection.');
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
