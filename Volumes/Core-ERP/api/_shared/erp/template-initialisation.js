"use strict";
const {loadTemplateDefaults, seedOrganisationDefaults} = require("./seeding");
const {seedRecordExamples} = require("./seed-record-examples");
const {seedLineClassifications} = require("./seed-line-classifications");
const {randomUUID}=require('node:crypto');
const {createTransactionPlan}=require('./transaction-plan');

// Reusable ERP workflow. Its planning adapter submits ordinary SQL to Broker.
async function executeTemplateInitialisation(client, options) {
  const {access, mode, confirmed} = options || {};
  if (!access?.tenantId || !access.auth?.email || confirmed !== true || !["definitions", "examples"].includes(mode))
    throw Object.assign(new Error("Confirmed template initialisation required"), {status:400});
  const defaults = loadTemplateDefaults(), organisation = defaults.templateOrganisation;
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [access.tenantId]);
  const query = async statement => {
    const result = await client.query(statement.text, statement.values || []);
    return {...result, rowCount:result.rowCount ?? result.affectedRows ?? result.rows.length};
  };
  const ctx = {planning:client.planning===true,auth:()=>access.auth, broker:async(profile, action, args)=>{
    if (profile !== "core_erp") throw new Error("Template initialisation uses the ERP transaction connection only");
    if (action === "query") return query(args);
    if (action === "transaction") {const results=[]; for (const s of args.statements) results.push(await query(s)); return {results};}
    throw new Error("Unsupported template broker action");
  }};
  if (!await require('./access').canInitialiseTemplateOrganisation(ctx,{tenantId:access.tenantId,email:access.auth.email})) throw Object.assign(new Error('ERP Setup Administrator access required'),{status:403});
  let existing = await client.query("SELECT * FROM erp_organisation WHERE tenant_id=$1 AND organisation_code=$2 AND workflow_status<>'deleted' FOR UPDATE", [access.tenantId,organisation.code]);
  if (existing.rows.length && !existing.rows[0].is_template) throw new Error("TEMPLATE code belongs to a non-template organisation");
  if (mode === "examples") {
    if (!existing.rows.length || existing.rows[0].workflow_status === "deleted") throw Object.assign(new Error("Initialise Template Org before adding example data"), {status:400});
    const id=existing.rows[0].organisation_id;
    const examples=await seedRecordExamples(ctx, access, id, defaults.exampleData || []);
    // Bind optional definition defaults now that the example records exist.
    await seedLineClassifications(ctx, access, id, {lineClassificationSeeds:defaults.exampleDataBindings || []});
    return [{rows:[{organisation:existing.rows[0], examples}],rowCount:1}];
  }
  const result = await client.query(`INSERT INTO erp_organisation(tenant_id,organisation_code,organisation_name,is_template,base_currency_code,workflow_status,created_by_email,updated_by_email,approved_by_email,approved_at)
    VALUES($1,$2,$3,true,$4,'approved',$5,$5,$5,now())
    ON CONFLICT(tenant_id,organisation_code) WHERE workflow_status<>'deleted' DO UPDATE SET organisation_name=excluded.organisation_name,is_template=true,base_currency_code=excluded.base_currency_code,workflow_status='approved',updated_by_email=$5,updated_at=now() RETURNING *`,
    [access.tenantId,organisation.code,organisation.name,organisation.baseCurrencyCode,access.auth.email]);
  const row=result.rows[0], id=row.organisation_id, values=[access.tenantId,id];
  await client.query(`INSERT INTO erp_division(tenant_id,organisation_id,division_code,division_name,workflow_status,created_by_email,updated_by_email)
    VALUES($1,$2,$3,$4,'approved',$5,$5) ON CONFLICT(tenant_id,organisation_id,division_code) WHERE workflow_status<>'deleted' DO UPDATE SET division_name=excluded.division_name,workflow_status='approved'`,
    [...values,organisation.rootDivision.code,organisation.rootDivision.name,access.auth.email]);
  // Reset links for JSON-defined entries while keeping IDs and business records.
  for (const [kind, seeds] of [["accounting_object",defaults.accountingObjectTypeSeeds],["accounting_dimension",defaults.accountingDimensionTypeSeeds],["subledger_account",defaults.ledgerFamilies]]) {
    await client.query(`DELETE FROM erp_${kind}_type_module m USING erp_${kind}_type t WHERE m.${kind}_type_id=t.${kind}_type_id AND t.tenant_id=$1 AND t.organisation_id=$2 AND t.type_code=ANY($3::text[])`,[...values,seeds.map(r=>r[0])]);
  }
  for (const [link, table, key, code, codes] of [
    ["erp_transaction_type_module","erp_transaction_type","transaction_type_id","type_code",defaults.transactionTypes.map(r=>r[0])],
    ["erp_role_module","erp_role","role_id","role_code",defaults.roleSeeds.map(r=>r[0])],
    ["erp_resource_role_module","erp_resource_role","resource_role_id","role_code",defaults.resourceRoleSeeds.map(r=>r[0])],
    ["erp_role_permission","erp_role","role_id","role_code",defaults.roleSeeds.map(r=>r[0])],
  ]) await client.query(`DELETE FROM ${link} m USING ${table} t WHERE m.${key}=t.${key} AND t.tenant_id=$1 AND t.organisation_id=$2 AND t.${code}=ANY($3::text[])`,[...values,codes]);
  for (const kind of ["object","dimension"]) await client.query(`DELETE FROM erp_transaction_line_definition_${kind}_type c USING erp_transaction_line_definition l,erp_transaction_type t WHERE c.transaction_line_definition_id=l.transaction_line_definition_id AND l.transaction_type_id=t.transaction_type_id AND t.tenant_id=$1 AND t.organisation_id=$2 AND t.type_code=ANY($3::text[])`,[...values,defaults.transactionTypes.map(r=>r[0])]);
  await client.query("DELETE FROM erp_workflow_next WHERE tenant_id=$1 AND organisation_id=$2 AND workflow_path_id IN (SELECT workflow_path_id FROM erp_workflow_path WHERE tenant_id=$1 AND organisation_id=$2 AND path_name=$3)",[...values,defaults.workflowDefaults.name]);
  for(const [kind,seeds]of [['gl_account',defaults.glAccountTypeSeeds],['subledger_account',defaults.ledgerFamilies],['accounting_object',defaults.accountingObjectTypeSeeds],['accounting_dimension',defaults.accountingDimensionTypeSeeds]]){
    const codes=seeds.map(row=>row[0]);
    await client.query(`DELETE FROM erp_object_type_resource_role m USING erp_${kind}_type t WHERE m.object_kind=$3 AND m.object_type_id=t.${kind}_type_id AND t.tenant_id=$1 AND t.organisation_id=$2 AND t.type_code=ANY($4::text[])`,[...values,kind,codes]);
    await client.query(`UPDATE erp_${kind}_type SET code_numbering=$4::jsonb,code_number_next=NULL WHERE tenant_id=$1 AND organisation_id=$2 AND type_code=ANY($3::text[])`,[...values,codes,JSON.stringify(defaults.codeNumberingDefaults)]);
  }
  await seedOrganisationDefaults(ctx, access, id);
  await client.query(`INSERT INTO erp_user_role(tenant_id,organisation_id,role_id,email,valid_from,valid_to)
    SELECT $1,$2,role_id,lower($3),CURRENT_DATE,NULL FROM erp_role WHERE tenant_id=$1 AND organisation_id=$2 AND role_code='security_administrator' AND is_admin=true
    ON CONFLICT(tenant_id,organisation_id,role_id,email) DO UPDATE SET valid_to=NULL,valid_from=LEAST(erp_user_role.valid_from,CURRENT_DATE)`,[...values,access.auth.email]);
  return [{rows:[{organisation:row}],rowCount:1}];
}
async function initialiseTemplate(ctx,options){
  const plan=createTransactionPlan(ctx,['erp_organisation','erp_user_role','erp_role']);
  let plannedOrganisation=null;
  const client={planning:true,query:async(text,values=[])=>{
    if(plannedOrganisation && /^\s*SELECT is_template FROM erp_organisation/i.test(text))
      return {rows:[{is_template:true}],rowCount:1};
    const modifying=/\b(?:INSERT INTO|UPDATE\s+erp_[a-z_]+|DELETE FROM)\b/i.test(text);
    if(!modifying)return plan.client.query(text,values);
    if(!/\bRETURNING\b/i.test(text))return plan.write({text,values});
    // Identity allocation is ERP logic. Existing IDs are preserved; new IDs are
    // allocated before submission so subsequent statements need no Broker callback.
    const match=text.match(/^\s*INSERT INTO (erp_organisation|erp_tax_type|erp_financial_statement_format|erp_financial_statement_line)\(/i);
    if(!match)return plan.write({text,values},{rows:[],rowCount:0});
    const table=match[1],identity={erp_organisation:'organisation_id',erp_tax_type:'tax_type_id',erp_financial_statement_format:'financial_statement_format_id',erp_financial_statement_line:'financial_statement_line_id'}[table];
    let previous=null;
    if(table==='erp_organisation'){
      previous=(await plan.client.query("SELECT * FROM erp_organisation WHERE tenant_id=$1 AND organisation_code=$2 AND workflow_status<>'deleted'",values.slice(0,2))).rows[0];
    }else if(table!=='erp_financial_statement_line'){
      const code=table==='erp_tax_type'?'tax_type_code':'format_code';
      previous=(await plan.client.query(`SELECT ${identity} FROM ${table} WHERE tenant_id=$1 AND organisation_id=$2 AND ${code}=$3`,values.slice(0,3))).rows[0];
    }
    const id=previous?.[identity]||randomUUID(),preparedValues=[...values,id];
    const preparedText=text.replace(`INSERT INTO ${table}(`,`INSERT INTO ${table}(${identity},`).replace(/\bVALUES\(/i,`VALUES($${preparedValues.length},`);
    const row={...(previous||{}),[identity]:id};
    if(table==='erp_organisation')plannedOrganisation=row;
    return plan.write({text:preparedText,values:preparedValues,expectedRowCount:1},{rows:[row],rowCount:1});
  }};
  const prepared=await executeTemplateInitialisation(client,options);
  const organisation=prepared[0].rows[0].organisation;
  plan.write({text:'SELECT * FROM erp_organisation WHERE tenant_id=$1 AND organisation_id=$2',values:[options.access.tenantId,organisation.organisation_id],expectedRowCount:1});
  const committed=await plan.commit();
  return {...prepared[0].rows[0],organisation:committed.results.at(-1).rows[0]};
}
module.exports={executeTemplateInitialisation,initialiseTemplate};
