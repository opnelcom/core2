'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {catalogue,compileReport,validateDefinition,reportScope,scalar}=require('../api/_shared/erp/report-definitions');
const {reportXlsx}=require('../api/_shared/erp/report-xlsx');
const {inflateRawSync}=require('node:zlib');
const seeds=require('../seeds/template-defaults.json');
test('every example report validates against the current template catalogue and has a unique code',async()=>{
 const groups=[['erp_subledger_account_type',seeds.ledgerFamilies,seeds.ledgerFamilySchemas],['erp_accounting_object_type',seeds.accountingObjectTypeSeeds,Object.fromEntries(Object.entries(seeds.accountingObjectTypeMetadata).map(([k,v])=>[k,v.schema_json]))],['erp_accounting_dimension_type',seeds.accountingDimensionTypeSeeds,Object.fromEntries(Object.entries(seeds.accountingDimensionTypeMetadata).map(([k,v])=>[k,v.schema_json]))]];
 const ctx={broker:async(p,a,q)=>{const g=groups.find(([table])=>q.text.includes(`FROM ${table} `));return {rows:g?g[1].map(([code,name])=>({type_code:code,type_name:name,schema_json:g[2][code]})):[]};}};
 const ds=await catalogue(ctx,{tenantId:'tenant'},'org');
 assert.equal(new Set(seeds.reportSeeds.map(s=>s.report_code)).size,seeds.reportSeeds.length);
 for(const seed of seeds.reportSeeds){assert.match(seed.report_code,/^[a-z][a-z0-9_]{0,59}$/);assert.ok(seed.description);assert.ok(seed.module_codes.length);for(const code of seed.module_codes)assert.ok(seeds.moduleSeeds.some(m=>m[0]===code),code);assert.doesNotThrow(()=>validateDefinition(seed.definition_json,ds),seed.report_code);}
});
const id=n=>`10000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const access={tenantId:id(1),auth:{email:'report@example.com'}};
async function datasets(){return catalogue({broker:async(profile,action,{text})=>({rows:text.includes('erp_accounting_object_type')?[{type_code:'property',type_name:'Property',schema_json:seeds.accountingObjectTypeMetadata.property.schema_json}]:[]})},access,id(2));}
test('catalogue keeps all parent attributes with one child collection and exposes organisation-wide masters',async()=>{
 const ds=await datasets(),d=ds.find(d=>d.key==='accounting_object:property:measurements');
 assert.ok(d.fields.some(f=>f.key==='data:physicalAddress'));assert.ok(d.fields.some(f=>f.key==='row:quantity'));assert.ok(!d.fields.some(f=>f.key==='row:valuationDate'));
 assert.equal(ds.find(d=>d.key==='gl_account').division,undefined);assert.equal(ds.find(d=>d.key==='resource').division,undefined);
 assert.equal(ds.find(d=>d.key==='transaction_line').division,'l.division_id');
});
test('SQL values, custom field keys and user parameters are bound; all division-owned rows are scoped',async()=>{
 const ds=await datasets(),def={dataset:'accounting_object:property:measurements',columns:[{field:'code'},{field:'row:quantity'}],parameters:[{key:'quantity',label:'Quantity',type:'decimal',required:true}],filters:[{field:'row:quantity',operator:'gte',parameter:'quantity'}],sort:[{field:'row:quantity',direction:'desc'}]};
 const q=compileReport(def,ds,{tenantId:id(1),organisationId:id(2),divisionIds:[id(3)],parameters:{quantity:'12.3456'}});
 assert.ok(q.text.includes('r.owner_division_id=ANY('));assert.equal((q.text.match(/jsonb_array_elements/g)||[]).length,1);assert.ok(q.values.includes('12.3456'));assert.ok(!q.text.includes('12.3456'));assert.ok(q.text.includes('r.tenant_id=$1'));assert.ok(q.text.includes('r.organisation_id=$2'));
 const inject={dataset:'resource',columns:[{field:'display_name'}],filters:[{field:'display_name',operator:'contains',value:"x' OR true --"}]};
 const sql=compileReport(inject,ds,{tenantId:id(1),organisationId:id(2),divisionIds:[id(3)]});assert.ok(!sql.text.includes("x' OR"));assert.ok(sql.values.includes("x' OR true --"));
});
test('unknown fields, relationships, parameters and bad types fail closed',async()=>{
 const ds=await datasets(),base={dataset:'resource',columns:[{field:'display_name'}]};
 for(const def of [{...base,joins:[]},{...base,columns:[null]},{...base,filters:[null]},{...base,parameters:[null]},{...base,sort:[null]},{...base,columns:[{field:'password'}]},{...base,columns:[{field:'display_name'},{field:'display_name'}]},{...base,filters:[{field:'display_name',operator:'execute',value:'x'}]},{...base,parameters:[{key:'division_id',label:'Scope',type:'text'}]}])assert.throws(()=>validateDefinition(def,ds),e=>e.status===400);
 assert.throws(()=>compileReport(base,ds,{tenantId:id(1),organisationId:id(2),parameters:{unknown:'x'}}),/Unknown report parameter/);
 assert.throws(()=>scalar('2026-02-30','date','Date'),/valid/);assert.equal(scalar(false,'boolean','Boolean'),'false');assert.throws(()=>scalar('1.2','integer','Integer'),/whole/);
});
test('report grants admit only authorized descendants and require selected division even for administrators',async()=>{
 const queries=[];const ctx={broker:async(profile,action,q)=>{queries.push(q);if(q.text.includes('WITH RECURSIVE scope'))return {rows:[{division_id:id(3)},{division_id:id(4)}]};return {rowCount:q.text.includes('access_division')?(q.values[3]===id(3)?1:0):(q.values[2]===id(3)?1:0)};}};
 const options={organisationId:id(2),divisionId:id(3),reportId:id(5),includeChildren:true};
 assert.deepEqual(await reportScope(ctx,access,options),[id(3)]);assert.equal(queries[2].values[3],'report');assert.equal(queries[2].values[4],id(5));
 const absent={broker:async()=>({rows:[]})};await assert.rejects(reportScope(absent,{...access,setupAdministrator:true},options),/unavailable/);
 const denied={broker:async(p,a,q)=>q.text.includes('WITH RECURSIVE scope')?{rows:[{division_id:id(3)}]}:{rowCount:0}};await assert.rejects(reportScope(denied,access,options),e=>e.status===403);
});
test('Excel exporter stores hostile text as inline strings and high-precision decimals as text',()=>{
 const bytes=reportXlsx([{key:'c0',label:'Text',type:'text'},{key:'c1',label:'Amount',type:'currency'},{key:'c2',label:'Precise',type:'decimal'}],[{c0:'=HYPERLINK("http://example.org")',c1:'12.34',c2:'1234567890123456.78'}]);
 const files={};let pos=0;while(bytes.readUInt32LE(pos)===0x04034b50){const size=bytes.readUInt32LE(pos+18),len=bytes.readUInt16LE(pos+26),extra=bytes.readUInt16LE(pos+28),name=bytes.subarray(pos+30,pos+30+len).toString(),start=pos+30+len+extra;files[name]=inflateRawSync(bytes.subarray(start,start+size)).toString();pos=start+size;}
 const xml=files['xl/worksheets/sheet1.xml'];assert.ok(!xml.includes('<f>'));assert.ok(xml.includes('t="inlineStr"'));assert.ok(xml.includes('<v>12.34</v>'));assert.ok(xml.includes('1234567890123456.78</t>'));assert.ok(files['[Content_Types].xml']);
});
