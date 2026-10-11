"use strict";
const {PGlite}=require("@electric-sql/pglite");
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const root=path.resolve(__dirname,"../../.."),erp=path.join(root,"Volumes/Core-ERP");
const defaults=require(path.join(erp,"seeds/template-defaults.json"));
const {seedOrganisationDefaults}=require(path.join(erp,"api/_shared/erp/seeding"));
const {seedRecordExamples}=require(path.join(erp,"api/_shared/erp/seed-record-examples"));
const {executeTemplateInitialisation}=require(path.join(erp,"api/_shared/erp/template-initialisation"));
const scenario={moduleCode:'insurance_management',objectTypes:defaults.accountingObjectTypeSeeds.filter(r=>r[0].startsWith('insurance_')).map(r=>r[0]),dimensionTypes:defaults.accountingDimensionTypeSeeds.filter(r=>r[0].startsWith('insurance_')).map(r=>r[0]),transactionTypes:defaults.transactionTypes.filter(r=>r[1]==='insurance').map(r=>r[0]),glCodes:['1250','1260','2060','4120','5760','5770'],lineClassifications:defaults.lineClassificationSeeds.filter(r=>r.lineCode.startsWith('insurance_')).map(r=>({line_code:r.lineCode,object_types:[r.type]}))};
const {lookupReferences,validateSchemaReferences}=require(path.join(erp,"api/_shared/erp/schema-references"));
const {validateSchema,validateSchemaDefinition}=require(path.join(erp,"api/_shared/erp/utils"));
const {prepareSchemaReferenceCopy}=require(path.join(erp,"api/_shared/erp/copy-schema-references"));
const tenant="10000000-0000-0000-0000-000000000001",org="10000000-0000-0000-0000-000000000002",other="10000000-0000-0000-0000-000000000003";
(async()=>{
 const db=new PGlite();try{
  await db.exec('CREATE FUNCTION erp_remap_schema_references(jsonb,jsonb,jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT $1 $$;');
  await db.exec(fs.readFileSync(path.join(erp,"schema/erp-schema.sql"),"utf8").replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;",""));
  await db.query("INSERT INTO erp_organisation(organisation_id,tenant_id,organisation_code,organisation_name,is_template) VALUES($1,$2,'TEMPLATE','Template',true),($3,$2,'OTHER','Other',false)",[org,tenant,other]);
  await db.query("INSERT INTO erp_division(tenant_id,organisation_id,division_code,division_name) VALUES($1,$2,'ROOT','Root'),($1,$3,'ROOT','Root')",[tenant,org,other]);
  await db.query("INSERT INTO erp_workflow_path(tenant_id,organisation_id,path_name,initial_step_code) VALUES($1,$2,'Default workflow','draft')",[tenant,org]);
  const ctx={tenantSession:async()=>({tenantId:tenant,auth:{email:"tester@example.com"}}),auth:()=>({email:"tester@example.com"}),broker:async(profile,action,args)=>{
   if(profile==="core_saas"||args.text?.includes("role.is_admin=true"))return {rows:[{}],rowCount:1};
   if(action==="transaction")return db.transaction(async tx=>{const results=[];for(const s of args.statements){const r=await tx.query(s.text,s.values);const rowCount=r.affectedRows||r.rows.length;if(s.expectedRowCount!==undefined&&rowCount!==s.expectedRowCount)throw Object.assign(new Error('Transaction precondition failed'),{code:'TRANSACTION_PRECONDITION'});results.push({...r,rowCount});}return {results};});
   const r=await db.query(args.text,args.values);return {...r,rowCount:r.affectedRows||r.rows.length};
  }},access={tenantId:tenant,auth:ctx.auth(),setupAdministrator:true};
  await seedOrganisationDefaults(ctx,access,org);
  await seedRecordExamples(ctx,access,org,defaults.exampleData);
  const policySchema=defaults.accountingObjectTypeMetadata.insurance_policy.schema_json,claimSchema=defaults.accountingObjectTypeMetadata.insurance_claim.schema_json;
  assert.deepEqual(validateSchemaDefinition(policySchema),[]);assert.deepEqual(validateSchemaDefinition(claimSchema),[]);
  const records=(await db.query("SELECT r.*,t.type_code FROM erp_accounting_object r JOIN erp_accounting_object_type t USING(accounting_object_type_id) WHERE r.organisation_id=$1 AND t.type_code LIKE 'insurance_%'",[org])).rows;
  assert.equal(records.length,3);
  for(const r of records){assert.deepEqual(validateSchema(r.type_code==="insurance_policy"?policySchema:claimSchema,r.additional_data),[]);assert.deepEqual(await validateSchemaReferences(ctx,access,org,r.type_code==="insurance_policy"?policySchema:claimSchema,r.additional_data),[]);}
  const claim=records.find(r=>r.type_code==="insurance_claim"),policy=records.find(r=>r.object_code==="INS-ASSETS-2026");
  assert.equal(claim.additional_data.policy,policy.accounting_object_id);
  const target=claimSchema.properties.affectedItems.rowSchema.properties.item.target;
  const all=await lookupReferences(ctx,access,org,target);assert.ok(all.length>=3);assert.ok(all.some(r=>r.object_class==="accounting_object"));assert.ok(all.some(r=>r.object_class==="subledger_account"));
  const filtered=await lookupReferences(ctx,access,org,target,{source:{class:"accounting_object",id:policy.accounting_object_id,grid:"insuredItems",column:"item"}});assert.equal(filtered.length,2);
  const bad=structuredClone(claim.additional_data);bad.affectedItems[0].item=all.find(r=>r.object_class==="accounting_object").id;
  assert.ok((await validateSchemaReferences(ctx,access,org,claimSchema,bad)).some(e=>e.includes("Insured item")));
  const count=(await db.query("SELECT count(*) n FROM erp_object_data_version WHERE organisation_id=$1",[org])).rows[0].n;
  await db.query("UPDATE erp_accounting_object SET object_name='Custom name' WHERE accounting_object_id=$1",[claim.accounting_object_id]);
  // Simulate the prior installation: insurance mappings in existing modules,
  // with the new module absent. Initialise must move only insurance types.
  await db.query("DELETE FROM erp_module WHERE organisation_id=$1 AND module_code='insurance_management'",[org]);
  for(const [kind,codes] of [["accounting_object",scenario.objectTypes],["accounting_dimension",scenario.dimensionTypes],["transaction",scenario.transactionTypes]]){
   await db.query(`INSERT INTO erp_${kind}_type_module(${kind}_type_id,module_id) SELECT t.${kind}_type_id,m.module_id FROM erp_${kind}_type t JOIN erp_module m ON m.organisation_id=t.organisation_id AND m.module_code='finance' WHERE t.organisation_id=$1 AND t.type_code=ANY($2::text[]) ON CONFLICT DO NOTHING`,[org,codes]);
  }
  await db.transaction(tx=>executeTemplateInitialisation(tx,{access,mode:"definitions",confirmed:true}));
  for(const [kind,codes] of [["accounting_object",scenario.objectTypes],["accounting_dimension",scenario.dimensionTypes],["transaction",scenario.transactionTypes]]){
   const links=(await db.query(`SELECT t.type_code,m.module_code FROM erp_${kind}_type_module link JOIN erp_${kind}_type t USING(${kind}_type_id) JOIN erp_module m USING(module_id) WHERE t.organisation_id=$1 AND t.type_code=ANY($2::text[])`,[org,codes])).rows;
   assert.equal(links.length,codes.length);assert.ok(links.every(row=>row.module_code==='insurance_management'));
  }
  assert.equal((await db.query("SELECT object_name FROM erp_accounting_object WHERE accounting_object_id=$1",[claim.accounting_object_id])).rows[0].object_name,"Custom name");
  assert.equal((await db.query("SELECT count(*) n FROM erp_object_data_version WHERE organisation_id=$1",[org])).rows[0].n,count);
  await seedOrganisationDefaults(ctx,access,other);
  assert.equal((await db.query("SELECT count(*) n FROM erp_accounting_object_type WHERE organisation_id=$1",[other])).rows[0].n,0);
  const types=(await db.query("SELECT count(*) n FROM erp_transaction_type WHERE organisation_id=$1 AND type_code=ANY($2::text[])",[org,scenario.transactionTypes])).rows[0].n;assert.equal(types,9);
  const requirements=(await db.query("SELECT count(*) n FROM erp_transaction_line_definition_object_type r JOIN erp_transaction_line_definition l USING(transaction_line_definition_id) JOIN erp_transaction_type t USING(transaction_type_id) WHERE t.organisation_id=$1 AND t.type_code=ANY($2::text[])",[org,scenario.transactionTypes])).rows[0].n;assert.equal(requirements,scenario.lineClassifications.reduce((n,row)=>n+row.object_types.length,0));
  // Exercise every configured financial type through the real Save and posting validator.
  const saveJournal=require(path.join(erp,"api/journals/save"));
  const {validateJournal}=require(path.join(erp,"api/_shared/erp/journals"));
  const year=(await db.query("INSERT INTO erp_fiscal_year(tenant_id,organisation_id,fiscal_year_code,start_date,end_date) VALUES($1,$2,'2026','2026-01-01','2026-12-31') ON CONFLICT(tenant_id,organisation_id,fiscal_year_code) DO UPDATE SET fiscal_year_code=excluded.fiscal_year_code RETURNING fiscal_year_id",[tenant,org])).rows[0].fiscal_year_id;
  const period=(await db.query("INSERT INTO erp_fiscal_period(tenant_id,organisation_id,fiscal_year_id,period_number,period_code,start_date,end_date) VALUES($1,$2,$3,1,'2026-01','2026-01-01','2026-01-31') ON CONFLICT(tenant_id,organisation_id,fiscal_year_id,period_number) DO UPDATE SET period_number=excluded.period_number RETURNING fiscal_period_id",[tenant,org,year])).rows[0].fiscal_period_id;
  const division=(await db.query("SELECT division_id FROM erp_division WHERE organisation_id=$1",[org])).rows[0].division_id;
  const bankType=(await db.query("SELECT subledger_account_type_id FROM erp_subledger_account_type WHERE organisation_id=$1 AND type_code='bank'",[org])).rows[0].subledger_account_type_id;
  const bank=(await db.query("INSERT INTO erp_subledger_account(tenant_id,organisation_id,owner_division_id,subledger_account_type_id,account_code,account_name,workflow_status) VALUES($1,$2,$3,$4,'TEST-BANK','Test Bank','approved') RETURNING subledger_account_id",[tenant,org,division,bankType])).rows[0].subledger_account_id;
  const vendor=(await db.query("SELECT subledger_account_id FROM erp_subledger_account WHERE organisation_id=$1 AND account_code='DEMO-INSURER'",[org])).rows[0].subledger_account_id;
  ctx.cookies={current_tenant:tenant};ctx.req={method:"POST"};ctx.query={};ctx.send=(status,body)=>({status,body});
  let recoveryBody,recoveryJournal;
  for(const code of scenario.transactionTypes){
   const type=(await db.query("SELECT transaction_type_id FROM erp_transaction_type WHERE organisation_id=$1 AND type_code=$2",[org,code])).rows[0].transaction_type_id;
   const definitions=(await db.query("SELECT l.*,st.type_code subledger_type_code FROM erp_transaction_line_definition l LEFT JOIN erp_subledger_account_type st USING(subledger_account_type_id) WHERE l.transaction_type_id=$1 AND occurrence='required' ORDER BY line_order",[type])).rows;
   const hasClaim=code.includes("recovery")||code.includes("settlement");
   ctx.body={organisation_id:org,transaction_type_id:type,fiscal_period_id:period,source_division_id:division,journal_date:"2026-01-15",currency_code:"ZAR",lines:definitions.map(l=>({transaction_line_definition_id:l.transaction_line_definition_id,gl_account_id:l.gl_account_id,subledger_account_id:l.subledger_type_code==="bank"?bank:l.subledger_type_code==="vendor"?vendor:null,debit_amount:l.debit_credit==="debit"?100:0,credit_amount:l.debit_credit==="credit"?100:0,accounting_objects:[{accounting_object_type_id:policy.accounting_object_type_id,accounting_object_id:policy.accounting_object_id},...(hasClaim?[{accounting_object_type_id:claim.accounting_object_type_id,accounting_object_id:claim.accounting_object_id}]:[])]}))};
   const saved=await saveJournal(ctx);assert.ok(saved.journal,JSON.stringify(saved));await validateJournal(ctx,tenant,saved.journal.journal_id);
   if(code==="insurance_recovery_recognition"){recoveryBody=structuredClone(ctx.body);recoveryJournal=saved.journal.journal_id;}
  }
  const wrongPolicy=records.find(r=>r.object_code==="INS-PROPERTY-2026").accounting_object_id;
  recoveryBody.lines[0].accounting_objects[0].accounting_object_id=wrongPolicy;ctx.body=recoveryBody;
  const denied=await saveJournal(ctx);assert.equal(denied.status,400);assert.ok(denied.body.error.includes("does not match"));
  await db.query("UPDATE erp_journal_line_accounting_object a SET accounting_object_id=$1 FROM erp_journal_line l WHERE l.journal_line_id=a.journal_line_id AND l.journal_id=$2 AND a.accounting_object_type_id=$3",[wrongPolicy,recoveryJournal,policy.accounting_object_type_id]);
  await assert.rejects(()=>validateJournal(ctx,tenant,recoveryJournal),/inconsistent related accounting objects/);
  // Existing destination IDs are retained while ERP remaps the copied payloads.
  for(const kind of ["subledger_account","accounting_object","accounting_dimension"]){
   const c=require(path.join(erp,"api/_shared/erp/schema-references")).classes[kind];
   await db.query(`INSERT INTO ${c.typeTable}(tenant_id,organisation_id,type_code,type_name,schema_json) SELECT tenant_id,$2,type_code,type_name,schema_json FROM ${c.typeTable} WHERE organisation_id=$1`,[org,other]);
   await db.query(`INSERT INTO ${c.table}(tenant_id,organisation_id,owner_division_id,${c.typeId},${c.code},${c.name},additional_data) SELECT s.tenant_id,$2,d.division_id,t.${c.typeId},s.${c.code},s.${c.name},s.additional_data FROM ${c.table} s JOIN ${c.typeTable} st ON st.${c.typeId}=s.${c.typeId} JOIN ${c.typeTable} t ON t.organisation_id=$2 AND t.type_code=st.type_code JOIN erp_division d ON d.organisation_id=$2 WHERE s.organisation_id=$1`,[org,other]);
  }
  await db.query("INSERT INTO erp_legal_entity(tenant_id,organisation_id,entity_type,known_name,legal_name) SELECT tenant_id,$2,entity_type,known_name,legal_name FROM erp_legal_entity WHERE organisation_id=$1",[org,other]);
  await (await prepareSchemaReferenceCopy(ctx,tenant,org,other,[],["accounting_object","accounting_dimension","subledger_account"])).commit();
  const copied=(await db.query("SELECT additional_data FROM erp_accounting_object WHERE organisation_id=$1 AND object_code='INS-CLAIM-001'",[other])).rows[0].additional_data;
  assert.notEqual(copied.policy,claim.additional_data.policy);assert.notEqual(copied.affectedItems[0].item,claim.additional_data.affectedItems[0].item);
  assert.deepEqual(await validateSchemaReferences(ctx,access,other,claimSchema,copied),[]);
  assert.ok((await db.query("SELECT count(*) n FROM erp_schema_grid_report WHERE organisation_id=$1",[other])).rows[0].n>0);
  const fresh='10000000-0000-0000-0000-000000000004';
  await db.query("INSERT INTO erp_organisation(organisation_id,tenant_id,organisation_code,organisation_name) VALUES($1,$2,'FRESH','Fresh')",[fresh,tenant]);
  const copyEndpoint=require(path.join(erp,'api/organisations/copy-organisation-setup'));
  ctx.req={method:'POST'};ctx.query={};ctx.cookies={current_tenant:tenant};ctx.body={source_organisation_id:org,target_organisation_id:fresh,options:{accounting_types:true,chart_of_accounts:true,divisions:true}};
  ctx.send=(status,body)=>{throw Error(`${status}: ${JSON.stringify(body)}`);};
  assert.equal((await copyEndpoint(ctx)).ok,true);
  const freshClaim=(await db.query("SELECT additional_data FROM erp_accounting_object WHERE organisation_id=$1 AND object_code='INS-CLAIM-001'",[fresh])).rows[0].additional_data;
  assert.notEqual(freshClaim.policy,claim.additional_data.policy);
  assert.notEqual(freshClaim.affectedItems[0].item,claim.additional_data.affectedItems[0].item);
  assert.deepEqual(await validateSchemaReferences(ctx,access,fresh,claimSchema,freshClaim),[]);
  assert.equal((await db.query("SELECT count(*)::int n FROM pg_proc WHERE proname='erp_remap_schema_references'")).rows[0].n,0);
  const stalePlan=await prepareSchemaReferenceCopy(ctx,tenant,org,fresh,[],['accounting_object']);
  await db.query("UPDATE erp_accounting_object SET additional_data=additional_data||'{\"concurrentEdit\":true}'::jsonb WHERE organisation_id=$1 AND object_code='INS-CLAIM-001'",[org]);
  await assert.rejects(stalePlan.commit(),e=>e.status===409);
  assert.deepEqual((await db.query("SELECT additional_data FROM erp_accounting_object WHERE organisation_id=$1 AND object_code='INS-CLAIM-001'",[fresh])).rows[0].additional_data,freshClaim);
  const failedPlan=await prepareSchemaReferenceCopy(ctx,tenant,org,fresh,[],['accounting_object']);
  failedPlan.write({text:'SELECT 1/0',values:[]});
  await assert.rejects(failedPlan.commit(),/division by zero/);
  assert.deepEqual((await db.query("SELECT additional_data FROM erp_accounting_object WHERE organisation_id=$1 AND object_code='INS-CLAIM-001'",[fresh])).rows[0].additional_data,freshClaim);
  console.log("Insurance PostgreSQL checks passed: full template seed, example links, mixed references, policy filtering, required posting classifications, nine real journal saves/posting validations, policy/claim mismatch rejection, versions/projections, additive idempotence, non-template preservation and copy remapping.");
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
