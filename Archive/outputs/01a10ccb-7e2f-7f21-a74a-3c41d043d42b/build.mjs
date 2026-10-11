import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';
const require = createRequire(import.meta.url);
const seeds = require('../../Volumes/Core-ERP/seeds/template-defaults.json');
const {exportTemplateSchemaTable} = require('../../Tools/ERP/export-template-schema-table.js');
const out = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const wb = Workbook.create();
const groups = [
 ['Subledger', seeds.ledgerFamilies, seeds.ledgerFamilySchemas],
 ['Accounting object', seeds.accountingObjectTypeSeeds, Object.fromEntries(Object.entries(seeds.accountingObjectTypeMetadata).map(([k,v])=>[k,v.schema_json]))],
 ['Accounting dimension', seeds.accountingDimensionTypeSeeds, Object.fromEntries(Object.entries(seeds.accountingDimensionTypeMetadata).map(([k,v])=>[k,v.schema_json]))]
];
const attrs = (props, required=[]) => Object.entries(props || {}).sort(([a,x],[b,y])=>(x.sortOrder??Infinity)-(y.sortOrder??Infinity)||a.localeCompare(b)).map(([k,v])=>`${k}${required.includes(k)?'*':''} (${v.type})`).join('\n') || '—';
const overview=[];
for(const [cls,types,schemas] of groups) for(const [code,name] of types){
 const schema=schemas[code], fields=Object.entries(schema.properties||{}), grids=fields.filter(([,v])=>v.type==='grid');
 overview.push([cls,code,name,attrs(Object.fromEntries(fields.filter(([,v])=>v.type!=='grid')),schema.required),grids.map(([k,v])=>`${k}\n${attrs(v.rowSchema.properties,v.rowSchema.required).split('\n').map(x=>'  '+x).join('\n')}`).join('\n\n')||'—']);
}
const detail=exportTemplateSchemaTable(seeds).split('\n').filter(x=>x.startsWith('| ')).map(x=>x.slice(2,-2).split(' | ').map(v=>v.replace(/&#124;/g,'|').replace(/<br>/g,'\n')));
detail.splice(1,1);
function sheet(name,title,headers,rows,widths,notes){
 const s=wb.worksheets.add(name);s.showGridLines=false;
 const last=String.fromCharCode(64+headers.length), end=rows.length+6;
 s.getRange(`A2`).values=[[title]];
 s.getRange('A2').format.font={name:'Arial',size:15,bold:true,color:'#203C58'};
 s.getRange('A3').values=[['Source: Volumes/Core-ERP/seeds/template-defaults.json (current working-tree seed)']];
 s.getRange('A4').values=[[notes]];
 s.getRange('A3:A4').format.font={name:'Arial',size:10,italic:true,color:'#5B6571'};
 s.getRange(`A6:${last}${end}`).values=[headers,...rows];
 const body=s.getRange(`A6:${last}${end}`);body.format.font={name:'Arial',size:10,color:'#263445'};body.format.wrapText=true;body.format.verticalAlignment='top';
 widths.forEach((w,i)=>s.getRange(`${String.fromCharCode(65+i)}6:${String.fromCharCode(65+i)}${end}`).format.columnWidth=w);
 s.tables.add(`A6:${last}${end}`,true,name.replace(/ /g,'')+'Table');
 const h=s.getRange(`A6:${last}6`);h.format.fill='#203C58';h.format.font={name:'Arial',size:10,bold:true,color:'#FFFFFF'};h.format.horizontalAlignment='center';h.format.verticalAlignment='center';h.format.rowHeight=30;
 for(let i=0;i<rows.length;i++){
  const lines=Math.max(...rows[i].map((v,c)=>String(v).split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/(widths[c]*0.95))),0)));
  s.getRange(`A${i+7}:${last}${i+7}`).format.rowHeight=Math.min(409,Math.max(28,lines*13+8));
 }
 s.freezePanes.freezeRows(6);s.freezePanes.freezeColumns(3);
 return s;
}
sheet('Object overview','Template object attributes and child collections',['Object class','Type code','Type name','Object attributes','Child collections and attributes'],overview,[24,26,30,43,53],'35 seeded types. * = required. Built-in fields and other setup classes excluded. Child collections are schema grids.');
sheet('Field inventory','Template field inventory',detail[0],detail.slice(1),[24,26,30,30,28,16,12,22,65,65,55],'Root fields and grid columns use exact storage keys. Grid-column required flags apply to each added row.');
wb.recalculate();
if(overview.length!==35)throw Error('Type inventory mismatch');
console.log((await wb.inspect({kind:'table',range:'Object overview!A6:E8',tableMaxRows:3,tableMaxCols:5,maxChars:1400})).ndjson);
for(const [name,range,file] of [['Object overview','A6:E9','overview.png'],['Field inventory','A6:H13','fields.png']]){
 const blob=await wb.render({sheetName:name,range,scale:1,format:'png'});await fs.writeFile(out+file,new Uint8Array(await blob.arrayBuffer()));
}
const xlsx=await SpreadsheetFile.exportXlsx(wb);await xlsx.save(out+'template-object-collections.xlsx');
console.log(JSON.stringify({types:overview.length,fieldRows:detail.length-1,file:out+'template-object-collections.xlsx'}));
