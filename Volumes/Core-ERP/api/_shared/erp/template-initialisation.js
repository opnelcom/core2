"use strict";
const {loadTemplateDefaults, seedOrganisationDefaults} = require("./seeding");
const {seedRecordExamples} = require("./seed-record-examples");
const {seedLineClassifications} = require("./seed-line-classifications");
const {randomUUID}=require('node:crypto');
const {createTransactionPlan}=require('./transaction-plan');
const {resetTemplateData,templateResetTables}=require('./template-reset');

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
  if (existing.rows.length) await resetTemplateData(client,access.tenantId,existing.rows[0].organisation_id);
  const result = await client.query(`INSERT INTO erp_organisation(tenant_id,organisation_code,organisation_name,is_template,base_currency_code,workflow_status,created_by_email,updated_by_email,approved_by_email,approved_at)
    VALUES($1,$2,$3,true,$4,'approved',$5,$5,$5,now())
    ON CONFLICT(tenant_id,organisation_code) WHERE workflow_status<>'deleted' DO UPDATE SET organisation_name=excluded.organisation_name,is_template=true,base_currency_code=excluded.base_currency_code,workflow_status='approved',organisation_icon_svg=NULL,organisation_icon_colour=NULL,effective_from=CURRENT_DATE,effective_to=NULL,additional_data='{}'::jsonb,archived_at=NULL,deleted_at=NULL,approved_by_email=$5,approved_at=now(),updated_by_email=$5,updated_at=now() RETURNING *`,
    [access.tenantId,organisation.code,organisation.name,organisation.baseCurrencyCode,access.auth.email]);
  const row=result.rows[0], id=row.organisation_id, values=[access.tenantId,id];
  await client.query(`INSERT INTO erp_division(tenant_id,organisation_id,division_code,division_name,workflow_status,created_by_email,updated_by_email)
    VALUES($1,$2,$3,$4,'approved',$5,$5) ON CONFLICT(tenant_id,organisation_id,division_code) WHERE workflow_status<>'deleted' DO UPDATE SET division_name=excluded.division_name,workflow_status='approved'`,
    [...values,organisation.rootDivision.code,organisation.rootDivision.name,access.auth.email]);
  await client.query(`INSERT INTO erp_organisation_user(tenant_id,organisation_id,email) VALUES($1,$2,lower($3)) ON CONFLICT(tenant_id,organisation_id,email) DO NOTHING`,[...values,access.auth.email]);
  await seedOrganisationDefaults(ctx, access, id);
  await client.query(`INSERT INTO erp_user_role(tenant_id,organisation_id,role_id,email,valid_from,valid_to)
    SELECT $1,$2,role_id,lower($3),CURRENT_DATE,NULL FROM erp_role WHERE tenant_id=$1 AND organisation_id=$2 AND role_code='security_administrator' AND is_admin=true
    ON CONFLICT(tenant_id,organisation_id,role_id,email) DO UPDATE SET valid_to=NULL,valid_from=LEAST(erp_user_role.valid_from,CURRENT_DATE)`,[...values,access.auth.email]);
  return [{rows:[{organisation:row}],rowCount:1}];
}
async function initialiseTemplate(ctx,options){
  const plan=createTransactionPlan(ctx,['erp_organisation','erp_user_role','erp_role']);
  let plannedOrganisation=null;
  let resetOrganisationId=null;
  const seededCatalogues=new Map();
  const client={planning:true,query:async(text,values=[])=>{
    if(plannedOrganisation && values[0]===options.access.tenantId && values[1]===plannedOrganisation.organisation_id && /^\s*SELECT is_template FROM erp_organisation/i.test(text))
      return {rows:[{is_template:true}],rowCount:1};
    const modifying=/\b(?:INSERT INTO|UPDATE\s+erp_[a-z_]+|DELETE FROM)\b/i.test(text);
    if(!modifying){
      if(plannedOrganisation && values[0]===options.access.tenantId && values[1]===plannedOrganisation.organisation_id){
        if(/^SELECT organisation_id FROM erp_organisation WHERE/.test(text))
          return {rows:[plannedOrganisation],rowCount:1};
        const catalogue=text.match(/^SELECT (?:type_code,type_name,schema_json|module_code) FROM (erp_[a-z_]+)/);
        if(catalogue && seededCatalogues.has(catalogue[1])){
          const rows=seededCatalogues.get(catalogue[1]);
          return {rows,rowCount:rows.length};
        }
      }
      // Planning reads precede the final transaction. Once reset is queued,
      // old template rows must not be reused as identities for new seed rows.
      if(resetOrganisationId && values[0]===options.access.tenantId && values[1]===resetOrganisationId &&
        templateResetTables.some(table=>new RegExp(`\\b${table}\\b`).test(text)))
        return {rows:[],rowCount:0};
      return plan.client.query(text,values);
    }
    const resetTable=text.match(/^DELETE FROM (erp_[a-z_]+) WHERE tenant_id=\$1 AND organisation_id=\$2$/);
    if(resetTable && templateResetTables.includes(resetTable[1])) resetOrganisationId=values[1];
    const seededTable=text.match(/^\s*(?:WITH[\s\S]*?)?INSERT INTO (erp_module|erp_subledger_account_type|erp_accounting_object_type|erp_accounting_dimension_type)\(/);
    if(seededTable && /jsonb_to_recordset\(\$3::jsonb\)/.test(text)){
      seededCatalogues.set(seededTable[1],JSON.parse(values[2]).map(row=>({
        ...row,type_code:row.type_code||row.ledger_family_code,type_name:row.type_name||row.family_name
      })));
    }
    if(!/\bRETURNING\b/i.test(text))return plan.write({text,values});
    // Keep the organisation identity; allocate fresh definition identities after
    // reset so subsequent statements need no Broker callback.
    const match=text.match(/^\s*INSERT INTO (erp_organisation|erp_tax_type|erp_financial_statement_format|erp_financial_statement_line)\(/i);
    if(!match)return plan.write({text,values},{rows:[],rowCount:0});
    const table=match[1],identity={erp_organisation:'organisation_id',erp_tax_type:'tax_type_id',erp_financial_statement_format:'financial_statement_format_id',erp_financial_statement_line:'financial_statement_line_id'}[table];
    let previous=null;
    if(table==='erp_organisation'){
      previous=(await plan.client.query("SELECT * FROM erp_organisation WHERE tenant_id=$1 AND organisation_code=$2 AND workflow_status<>'deleted'",values.slice(0,2))).rows[0];
    }else if(table!=='erp_financial_statement_line' && !resetOrganisationId){
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
