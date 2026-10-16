"use strict";
const {randomUUID}=require("node:crypto");
const {classes,lookupReferences,sourceReferenceValues}=require("./schema-references");
const {referenceFields}=require("./schema-grids");
const {objectSaveStatements}=require("./object-versions");
const {validateSchema}=require("./utils");


async function seedRecordExamples(ctx,access,organisationId,examples){
 const organisation=await ctx.broker("core_erp","query",{text:"SELECT 1 FROM erp_organisation WHERE tenant_id=$1 AND organisation_id=$2 AND is_template=true AND workflow_status<>'deleted'",values:[access.tenantId,organisationId]});
 if(!organisation.rows.length)throw new Error("Example data requires a live template organisation");
 const root=await ctx.broker("core_erp","query",{text:"SELECT division_id FROM erp_division WHERE tenant_id=$1 AND organisation_id=$2 AND parent_division_id IS NULL AND workflow_status<>'deleted' ORDER BY created_at LIMIT 1",values:[access.tenantId,organisationId]});
 if(!root.rows.length)throw new Error("Initialise Template Org before adding examples: no root division");
 const cache=new Map(),plans=[];
 const key=ref=>JSON.stringify(ref);
 const find=async([kind,type,code])=>{
  const c=classes[kind];if(!c)throw new Error("Invalid seeded reference class");
  const joined=c.typeTable?`JOIN ${c.typeTable} t ON t.${c.typeId}=r.${c.typeId}`:"";
  const filter=kind==="legal_entity"?"r.entity_type=$3 AND r.known_name=$4":`${c.typeTable?"t.type_code":"r."+c.type}=$3 AND r.${c.code}=$4`;
  const result=await ctx.broker("core_erp","query",{text:`SELECT r.${c.id} id FROM ${c.table} r ${joined} WHERE r.tenant_id=$1 AND r.organisation_id=$2 AND ${filter}`,values:[access.tenantId,organisationId,type,code]});
  return result.rows[0]?.id;
 };
 for(const example of examples){
  const reference=[example.class,example.type,example.code],existing=await find(reference),id=existing||randomUUID();
  cache.set(key(reference),id);if(!existing)plans.push({...example,id});
 }
 const resolve=async value=>{
  if(Array.isArray(value))return Promise.all(value.map(resolve));
  if(value&&typeof value==="object"){
   if(value.$ref){const k=key(value.$ref);let id=cache.get(k);if(!id){id=await find(value.$ref);if(!id)throw Object.assign(new Error(`Missing seed example reference ${k}`),{seedExample:true});cache.set(k,id);}return value.mixed?`${value.$ref[0]}:${id}`:id;}
   return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await resolve(v)])));
  }return value;
 };
 const pending=new Map(plans.map(p=>[p.id,p]));
 for(const p of plans)p.resolvedData=await resolve(p.data);
 const systemAccess={...access,setupAdministrator:true};
 const statements=[];
 for(const p of plans){
  const c=classes[p.class];
  if(!c.typeTable){
   const legal=p.class==='legal_entity';
   if(!legal && p.class!=='resource')throw new Error('Unsupported example class');
   statements.push({text:legal?`INSERT INTO erp_legal_entity(legal_entity_id,tenant_id,organisation_id,entity_type,known_name,legal_name,workflow_status,created_by_email,updated_by_email) VALUES($1,$2,$3,$4,$5,$6,'approved',$7,$7)`:`INSERT INTO erp_resource(resource_id,tenant_id,organisation_id,resource_type,resource_code,display_name) VALUES($1,$2,$3,$4,$5,$6)`,values:[p.id,access.tenantId,organisationId,p.type,p.code,p.name,...(legal?[access.auth.email]:[])]});
   continue;
  }
  const type=await ctx.broker("core_erp","query",{text:`SELECT ${c.typeId} id,schema_json,workflow_path_id FROM ${c.typeTable} WHERE tenant_id=$1 AND organisation_id=$2 AND type_code=$3`,values:[access.tenantId,organisationId,p.type]});
  if(!type.rows.length)throw Object.assign(new Error(`Missing seed example type ${p.type}`),{seedExample:true});
  const data=p.resolvedData||{},schema=type.rows[0].schema_json,errors=validateSchema(schema,data);
  const workflowStatus=p.workflowStatus??'active';
  if(p.workflowStatus!==undefined){
   const status=await ctx.broker("core_erp","query",{text:`SELECT 1 FROM erp_workflow_step WHERE tenant_id=$1 AND organisation_id=$2 AND workflow_path_id=$3 AND step_code=$4`,values:[access.tenantId,organisationId,type.rows[0].workflow_path_id,workflowStatus]});
   if(!status.rows.length)errors.push(`Invalid example workflow status ${workflowStatus} for ${p.type}`);
  }
  for(const {field,value,name} of referenceFields(schema,data)){
   const alternatives=field.target.anyOf||[field.target];
   const target=alternatives.find(t=>field.target.anyOf?value.startsWith(t.class+":"):true);
   const id=field.target.anyOf?value.slice(value.indexOf(":")+1):value,planned=pending.get(id);
   const valid=target&&(planned?planned.class===target.class&&(!target.types?.length||target.types.includes(planned.type)):(await lookupReferences(ctx,systemAccess,organisationId,target,{selectedId:id,exact:true})).length>0);
   if(!valid)errors.push(`${name}: missing or incompatible example reference`);
   if(field.referenceSource){
    const rule=field.referenceSource,sourceId=data[rule.field],plannedSource=pending.get(sourceId);
    const allowed=plannedSource?new Set((plannedSource.resolvedData[rule.grid]||[]).map(row=>row[rule.column])):await sourceReferenceValues(ctx,systemAccess,organisationId,{class:schema.properties[rule.field]?.target?.class,id:sourceId,grid:rule.grid,column:rule.column});
    if(!allowed.has(value))errors.push(`${name}: not listed on the example's saved source record`);
   }
  }
  // Add examples only when they fit the current definitions. Existing records are preserved.
  if(errors.length)throw Object.assign(new Error(errors.join("; ")),{seedExample:true});
  const insert={text:`INSERT INTO ${c.table}(${c.id},tenant_id,organisation_id,owner_division_id,${c.typeId},${c.code},${c.name},additional_data,workflow_status,created_by_email,updated_by_email)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$10,$9,$9)`,values:[p.id,access.tenantId,organisationId,root.rows[0].division_id,type.rows[0].id,p.code,p.name,JSON.stringify(data),access.auth.email,workflowStatus]};
  if(p.legalEntity){const legalId=await resolve(p.legalEntity); insert.text=insert.text.replace('additional_data,workflow_status','additional_data,legal_entity_id,workflow_status').replace('$8::jsonb,$10','$8::jsonb,$11,$10');insert.values.push(legalId);}
  statements.push(...objectSaveStatements({statements:[insert],access,organisationId,kind:p.class,id:p.id,schema,data}));
 }
 if(statements.length)await ctx.broker("core_erp","transaction",{statements});
 return {inserted:plans.length};
}
module.exports={seedRecordExamples};
