 'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/object-statement.js'),'utf8');
const outputCode=source.slice(source.indexOf(' // Export and print'),source.indexOf(" $('statement-print').onclick"));
function harness(pages){
 const snapshot={object:{organisation_name:'Org',object_code:'A',object_name:'Account'},currency_code:'ZAR',date_from:'2026-10-01',date_to:'2026-10-21',opening_balance:'0',period_debit:'30',period_credit:'0',closing_balance:'30',total_count:2,restricted:false,rows:[],offset:100};
 const calls=[],downloads=[];let org='org';
 const scope={result:snapshot,sequence:1,organisation:'org',runQuery:new URLSearchParams('organisation_id=org'),panel:{hidden:false},context:()=>({orgId:org}),api:async url=>{calls.push(url);return pages.shift();},downloadReportCsv:(...args)=>downloads.push(args),URLSearchParams};
 vm.createContext(scope);vm.runInContext(outputCode+';this.collect=completeStatement;this.exportCsv=exportStatement;',scope);
 return {scope,snapshot,calls,downloads,setOrg:value=>{org=value;}};
}
function page(offset,next,amount){return {opening_balance:'0',period_debit:'30',period_credit:'0',closing_balance:'30',total_count:2,restricted:false,offset,next_offset:next,rows:[{journal_line_id:String(offset),journal_date:'2026-10-21',debit_amount:amount,credit_amount:'0',running_balance:offset?'30':'10'}]};}
test('statement output loads all pages from zero regardless of the visible page',async()=>{
 const h=harness([page(0,1,'10'),page(1,null,'20')]);const r=await h.scope.collect();
 assert.equal(r.rows.length,2);assert.match(h.calls[0],/offset=0/);assert.match(h.calls[1],/offset=1/);assert.equal(h.snapshot.offset,100);assert.equal(h.snapshot.rows.length,0);
 h.scope.exportCsv(r);const [,columns,rows]=h.downloads[0];assert.equal(rows.length,4);assert.equal(rows[0].running_balance,'0');assert.equal(rows.at(-1).running_balance,'30');assert.equal(columns.find(([label])=>label==='Currency')[1]({}),'ZAR');
});
test('statement output rejects changed totals and organisation context',async()=>{
 const changed=page(0,null,'10');changed.closing_balance='99';const h=harness([changed]);await assert.rejects(h.scope.collect(),/Statement changed/);
 const other=harness([page(0,1,'10')]);other.setOrg('other');await assert.rejects(other.scope.collect(),/context changed/);
});
test('statement output rejects incomplete or duplicate pages',async()=>{
 const h=harness([page(0,null,'10')]);await assert.rejects(h.scope.collect(),/Incomplete statement/);
 const second=page(1,null,'20');second.rows[0].journal_line_id='0';const duplicate=harness([page(0,1,'10'),second]);await assert.rejects(duplicate.scope.collect(),/Statement changed/);
});
test('restricted output retains its warning in CSV and empty statements retain balances',async()=>{
 const h=harness([]);h.snapshot.restricted=true;h.scope.exportCsv(h.snapshot);const [,columns]=h.downloads[0];assert.match(columns.find(([label])=>label==='Access')[1]({}),/Partial statement/);
 const empty=harness([{...page(0,null,'0'),total_count:0,rows:[]}]);empty.snapshot.total_count=0;const r=await empty.scope.collect();assert.equal(r.rows.length,0);
});

test('CSV uses distinct transaction ID and saved heading columns without line-description fallback',()=>{
 const h=harness([]);h.snapshot.rows=[{journal_number:'J-001',journal_id:'journal-id',transaction_heading:'Land purchase',journal_description:'Optional journal description',description:'Capital project WIP'},{journal_id:'fallback-id',transaction_heading:'',journal_description:'Must not substitute for heading',description:'Line description only'}];
 h.scope.exportCsv(h.snapshot);const [,columns,rows]=h.downloads[0];
 const id=columns.find(([label])=>label==='Transaction ID')[1],heading=columns.find(([label])=>label==='Transaction heading')[1];
 assert.equal(id(rows[1]),'J-001');assert.equal(id(rows[2]),'fallback-id');
 assert.equal(heading(rows[1]),'Land purchase');assert.equal(heading(rows[2]),'');
 assert.equal(heading(rows[0]),'Opening balance');assert.equal(heading(rows.at(-1)),'Period totals / Closing balance');
 assert.ok(!columns.some(([label])=>label==='Description'));
});
