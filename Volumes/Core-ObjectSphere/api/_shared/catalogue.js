'use strict';
const crypto=require('crypto');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text=(v)=>typeof v==='string'?v.trim():'';
const schema=`CREATE TABLE IF NOT EXISTS objectsphere_catalogue_import(
 tenant_id uuid NOT NULL,parent_item_id uuid NOT NULL REFERENCES objectsphere_item(item_id),
 source text NOT NULL,source_key text NOT NULL,payload_hash text NOT NULL,
 item_id uuid NOT NULL REFERENCES objectsphere_item(item_id) DEFERRABLE INITIALLY DEFERRED,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,parent_item_id,source,source_key))`;

function validateFile(file,types,attributes){
 if(file?.format!=='objectsphere-catalogue'||file.version!==1)throw new Error('Expected objectsphere-catalogue version 1');
 const source=text(file.source);
 if(!source||source.length>200)throw new Error('A stable source name of at most 200 characters is required');
 if(!Array.isArray(file.objects)||!file.objects.length||file.objects.length>500)throw new Error('Provide 1 to 500 objects per file');
 const keys=new Set();
 return {source,objects:file.objects.map((row,index)=>{
  const key=text(row.source_key),name=text(row.name),typeName=text(row.type);
  if(!key||key.length>200||keys.has(key))throw new Error(`Row ${index+1}: missing, duplicate or too long source_key`);
  keys.add(key);
  if(!name||name.length>1000)throw new Error(`Row ${index+1}: name is required (maximum 1000 characters)`);
  const matches=types.filter(t=>t.type_name===typeName&&t.status==='active'&&!t.deleted);
  if(matches.length!==1)throw new Error(`Row ${index+1}: type "${typeName}" must match exactly one active type`);
  const quantity=row.quantity===undefined?1:row.quantity;
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>2147483647)throw new Error(`Row ${index+1}: quantity must be a positive integer`);
  if(row.description!==undefined&&typeof row.description!=='string')throw new Error(`Row ${index+1}: description must be text`);
  if((row.description||'').length>50000)throw new Error(`Row ${index+1}: description is too long`);
  if(row.attributes!==undefined&&(!row.attributes||Array.isArray(row.attributes)||typeof row.attributes!=='object'))throw new Error(`Row ${index+1}: attributes must be an object`);
  const type=matches[0],values=[];
  for(const [attributeName,value] of Object.entries(row.attributes||{})){
   const found=attributes.filter(a=>a.object_type_id===type.object_type_id&&a.attribute_name===attributeName&&a.status==='active'&&!a.deleted);
   if(found.length!==1)throw new Error(`Row ${index+1}: unknown or ambiguous attribute "${attributeName}"`);
   if(typeof value!=='string'||value.length>50000)throw new Error(`Row ${index+1}: ${attributeName} must be text (maximum 50000 characters)`);
   const a=found[0];
   if(value&&a.attribute_type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))throw new Error(`Row ${index+1}: ${attributeName} requires a real YYYY-MM-DD date`);
   if(value&&a.attribute_type==='number'&&(!/^-?\d+$/.test(value)||!Number.isSafeInteger(Number(value))))throw new Error(`Row ${index+1}: ${attributeName} requires an integer`);
   if(value&&['float','currency'].includes(a.attribute_type)&&(!/^-?\d+(\.\d+)?$/.test(value)||!Number.isFinite(Number(value))))throw new Error(`Row ${index+1}: ${attributeName} requires a decimal number`);
   if(value)values.push({attribute_id:a.attribute_id,attribute_name:attributeName,value_text:value});
  }
  values.sort((a,b)=>a.attribute_id.localeCompare(b.attribute_id));
  const result={source_key:key,name,description:row.description||'',quantity,type_id:type.object_type_id,type_name:type.type_name,values};
  result.hash=crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex');
  return result;
 })};
}

async function prepare(ctx,access){
 const parent=ctx.body.parent_item_id;
 if(typeof parent!=='string'||!uuid.test(parent))throw new Error('Select a valid destination object');
 const result=await ctx.broker('core_objectsphere','transaction',{statements:[
  {text:'SELECT item_id,item_name FROM objectsphere_item WHERE tenant_id=$1 AND item_id=$2 AND status=\'active\'',values:[access.tenantId,parent]},
  {text:'SELECT object_type_id,type_name,status,deleted FROM objectsphere_object_type WHERE tenant_id=$1',values:[access.tenantId]},
  {text:'SELECT attribute_id,object_type_id,attribute_name,attribute_type,status,deleted FROM objectsphere_attribute WHERE tenant_id=$1',values:[access.tenantId]}
 ]});
 const destination=result.results[0].rows[0];
 if(!destination)throw new Error('Destination is not active in this tenant');
 const plan=validateFile(ctx.body.catalogue,result.results[1].rows,result.results[2].rows);
 await ctx.broker('core_objectsphere','query',{text:schema,values:[]});
 const previous=await ctx.broker('core_objectsphere','query',{text:'SELECT source_key,payload_hash,item_id FROM objectsphere_catalogue_import WHERE tenant_id=$1 AND parent_item_id=$2 AND source=$3',values:[access.tenantId,parent,plan.source]});
 const prior=new Map(previous.rows.map(row=>[row.source_key,row]));
 const existing=await ctx.broker('core_objectsphere','query',{text:'SELECT item_name FROM objectsphere_item WHERE tenant_id=$1 AND parent_item_id=$2 AND status=\'active\'',values:[access.tenantId,parent]});
 const names=new Set(existing.rows.map(row=>row.item_name.toLowerCase()));
 return {...plan,parent,destination,objects:plan.objects.map(o=>({...o,action:prior.has(o.source_key)?(prior.get(o.source_key).payload_hash===o.hash?'skip':'conflict'):'create',warning:!prior.has(o.source_key)&&names.has(o.name.toLowerCase())?'An existing sibling has the same name; confirm this is a separate copy.':''}))};
}

function insertStatement(access,plan,o){
 const id=crypto.randomUUID();
 return {text:`WITH claim AS (
 INSERT INTO objectsphere_catalogue_import(tenant_id,parent_item_id,source,source_key,payload_hash,item_id)
 VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING item_id
 ), created AS (
 INSERT INTO objectsphere_item(item_id,tenant_id,parent_item_id,item_name,item_description,quantity,sort_order,created_by_email,updated_by_email)
 SELECT claim.item_id,$1,$2,$7,$8,$9,COALESCE((SELECT max(sort_order)+1 FROM objectsphere_item WHERE tenant_id=$1 AND parent_item_id=$2),1),$10,$10 FROM claim RETURNING item_id,item_name
 ), typed AS (
 INSERT INTO objectsphere_item_type(tenant_id,item_id,object_type_id) SELECT $1,item_id,$11 FROM created
 ), vals AS (
 INSERT INTO objectsphere_attribute_value(tenant_id,item_id,attribute_id,value_text)
 SELECT $1,c.item_id,a.attribute_id,a.value_text FROM created c CROSS JOIN jsonb_to_recordset($12::jsonb) AS a(attribute_id uuid,attribute_name text,value_text text)
 ), history AS (
 INSERT INTO objectsphere_attribute_value_history(tenant_id,item_id,attribute_id,object_type_id,item_name,object_type_name,attribute_name,new_value_text,changed_by_email)
 SELECT $1,c.item_id,a.attribute_id,$11,c.item_name,$13,a.attribute_name,a.value_text,$10 FROM created c CROSS JOIN jsonb_to_recordset($12::jsonb) AS a(attribute_id uuid,attribute_name text,value_text text)
 ) SELECT item_id,item_name FROM created`,values:[access.tenantId,plan.parent,plan.source,o.source_key,o.hash,id,o.name,o.description,o.quantity,access.auth.email,o.type_id,JSON.stringify(o.values),o.type_name]};
}

async function commit(ctx,access,plan){
 const selected=ctx.body.source_keys;
 if(!Array.isArray(selected)||!selected.length||selected.some(k=>typeof k!=='string')||new Set(selected).size!==selected.length)throw new Error('Select source keys to import');
 const known=new Map(plan.objects.map(o=>[o.source_key,o]));
 if(selected.some(k=>!known.has(k)))throw new Error('Selection contains an unknown source key');
 const objects=selected.map(k=>known.get(k));
 if(objects.some(o=>o.action==='conflict'))throw new Error('Previously imported data differs. Resolve conflicts before importing; records will not be overwritten.');
 const statements=[
  {text:'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',values:[`catalogue:${access.tenantId}:${plan.parent}`]},
  {text:'SELECT item_id FROM objectsphere_item WHERE tenant_id=$1 AND item_id=$2 AND status=\'active\' FOR SHARE',values:[access.tenantId,plan.parent],expectedRowCount:1},
 ];
 // Hold type/attribute rows against deletion or disabling until all writes commit.
 const typeIds=[...new Set(objects.map(o=>o.type_id))],attrIds=[...new Set(objects.flatMap(o=>o.values.map(v=>v.attribute_id)))];
 statements.push({text:'SELECT object_type_id FROM objectsphere_object_type WHERE tenant_id=$1 AND object_type_id=ANY($2::uuid[]) AND status=\'active\' AND deleted=false FOR SHARE',values:[access.tenantId,typeIds],expectedRowCount:typeIds.length});
 statements.push({text:'SELECT attribute_id FROM objectsphere_attribute WHERE tenant_id=$1 AND attribute_id=ANY($2::uuid[]) AND status=\'active\' AND deleted=false FOR SHARE',values:[access.tenantId,attrIds],expectedRowCount:attrIds.length});
 statements.push(...objects.map(o=>insertStatement(access,plan,o)));
 const result=await ctx.broker('core_objectsphere','transaction',{statements});
 const created=result.results.slice(4).flatMap(r=>r.rows);
 return {created,skipped:objects.length-created.length};
}
module.exports={validateFile,prepare,commit,schema,insertStatement};
