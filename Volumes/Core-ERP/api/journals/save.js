'use strict';
const {randomUUID}=require('crypto');
const {authTenant,clean,nullable,money,checkPeriodOpen,requireResourcePermission,requireModuleAccess}=require('../_shared/erp');

const allocations=(rows,typeField,valueField)=>(Array.isArray(rows)?rows:[]).map(row=>({type_id:nullable(row[typeField]||row.type_id),value_id:nullable(row[valueField]||row.value_id)})).filter(row=>row.type_id||row.value_id);

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const id=nullable(ctx.body.journal_id);
  const orgId=ctx.body.organisation_id;
  const transactionTypeId=nullable(ctx.body.transaction_type_id);
  const periodId=ctx.body.fiscal_period_id;
  const divisionId=ctx.body.source_division_id;
  const supplierId=nullable(ctx.body.supplier_subledger_account_id);
  const vatRecipientId=nullable(ctx.body.vat_recipient_legal_entity_id);
  const lines=Array.isArray(ctx.body.lines)?ctx.body.lines:[];
  const missing=[[orgId,'organisation'],[transactionTypeId,'transaction type'],[periodId,'fiscal period'],[divisionId,'source division']].filter(([value])=>!value).map(([,label])=>label);
  if(missing.length)return ctx.send(400,{error:`Missing required field${missing.length>1?'s':''}: ${missing.join(', ')}`});
  const moduleDenied=await requireModuleAccess(ctx,access,{organisationId:orgId,resourceKind:'transaction_type',resourceCode:transactionTypeId});
  if(moduleDenied)return ctx.send(moduleDenied.status,moduleDenied.body);
  if(lines.length<2)return ctx.send(400,{error:'At least two journal lines are required'});
  await checkPeriodOpen(ctx,access.tenantId,periodId);
  const existing=id?await ctx.broker('core_erp','query',{text:`SELECT workflow_status FROM erp_journal WHERE tenant_id=$1 AND journal_id=$2`,values:[access.tenantId,id]}):null;
  if(existing&&!existing.rowCount)return ctx.send(404,{error:'Journal not found'});
  if(existing&&!['draft','rejected'].includes(existing.rows[0].workflow_status))return ctx.send(400,{error:'Only draft or rejected journals can be edited'});
  const denied=await requireResourcePermission(ctx,access,{organisationId:orgId,divisionId,resourceKind:'transaction',resourceCode:transactionTypeId,workflowStatus:'draft'});
  if(denied)return ctx.send(denied.status,denied.body);

  const normalisedLines=lines.map((line,index)=>{
    const debit=money(line.debit_amount);
    const credit=money(line.credit_amount);
    if((debit>0&&credit>0)||(debit<=0&&credit<=0))throw Object.assign(new Error(`Line ${index+1} needs either debit or credit amount`),{status:400});
    const objectAllocations=allocations(line.accounting_objects,'accounting_object_type_id','accounting_object_id');
    const dimensionAllocations=allocations(line.accounting_dimensions,'accounting_dimension_type_id','accounting_dimension_id');
    if(objectAllocations.some(row=>!row.type_id||!row.value_id)||dimensionAllocations.some(row=>!row.type_id||!row.value_id))throw Object.assign(new Error(`Line ${index+1} has an incomplete classification`),{status:400});
    if(new Set(objectAllocations.map(row=>row.type_id)).size!==objectAllocations.length||new Set(dimensionAllocations.map(row=>row.type_id)).size!==dimensionAllocations.length)throw Object.assign(new Error(`Line ${index+1} repeats an accounting object or dimension type`),{status:400});
    return {journal_line_id:randomUUID(),line_number:index+1,transaction_line_definition_id:nullable(line.transaction_line_definition_id),division_id:nullable(line.division_id)||divisionId,gl_account_id:nullable(line.gl_account_id),subledger_account_id:nullable(line.subledger_account_id),description:clean(line.description),debit_amount:debit,credit_amount:credit,currency_code:clean(line.currency_code,ctx.body.currency_code||'ZAR').toUpperCase(),accounting_objects:objectAllocations,accounting_dimensions:dimensionAllocations};
  });
  const debitTotal=normalisedLines.reduce((sum,line)=>sum+line.debit_amount,0);
  const creditTotal=normalisedLines.reduce((sum,line)=>sum+line.credit_amount,0);
  if(Math.round(debitTotal*100)!==Math.round(creditTotal*100))return ctx.send(400,{error:'Journal debits and credits must balance'});

  const type=await ctx.broker('core_erp','query',{text:`SELECT type_code,allow_additional_lines FROM erp_transaction_type WHERE tenant_id=$1 AND organisation_id=$2 AND transaction_type_id=$3`,values:[access.tenantId,orgId,transactionTypeId]});
  if(!type.rows.length)return ctx.send(404,{error:'Transaction type was not found'});
  if(type.rows[0].type_code==='municipal_services_invoice'&&(!supplierId||!vatRecipientId||!clean(ctx.body.supplier_invoice_number)||!nullable(ctx.body.supplier_invoice_date)))return ctx.send(400,{error:'Municipal services invoices require supplier, VAT recipient, supplier invoice number, and supplier invoice date'});
  if(!type.rows[0].allow_additional_lines&&normalisedLines.some(line=>!line.transaction_line_definition_id))return ctx.send(400,{error:'This transaction type does not allow additional lines'});
  const definitions=await ctx.broker('core_erp','query',{text:`SELECT definition.*,subledger.type_code subledger_type_code FROM erp_transaction_line_definition definition LEFT JOIN erp_subledger_account_type subledger ON subledger.subledger_account_type_id=definition.subledger_account_type_id WHERE definition.tenant_id=$1 AND definition.organisation_id=$2 AND definition.transaction_type_id=$3 ORDER BY definition.line_order`,values:[access.tenantId,orgId,transactionTypeId]});
  const definitionById=new Map(definitions.rows.map(row=>[row.transaction_line_definition_id,row]));
  for(const definition of definitions.rows){
    const count=normalisedLines.filter(line=>line.transaction_line_definition_id===definition.transaction_line_definition_id).length;
    if(['required','generated'].includes(definition.occurrence)&&count!==1)return ctx.send(400,{error:`${definition.line_description||definition.line_code} must occur exactly once`});
    if(definition.occurrence==='optional'&&count>1)return ctx.send(400,{error:`${definition.line_description||definition.line_code} can occur at most once`});
  }
  const accountIds=[...new Set(normalisedLines.map(line=>line.gl_account_id).filter(Boolean))];
  const subledgerIds=[...new Set(normalisedLines.map(line=>line.subledger_account_id).filter(Boolean))];
  const objectIds=[...new Set(normalisedLines.flatMap(line=>line.accounting_objects.map(row=>row.value_id)))];
  const dimensionIds=[...new Set(normalisedLines.flatMap(line=>line.accounting_dimensions.map(row=>row.value_id)))];
  const [accounts,subledgers,objects,dimensions,objectRequirements,dimensionRequirements]=await Promise.all([
    ctx.broker('core_erp','query',{text:`SELECT gl_account_id,requires_subledger,required_subledger_account_type_id FROM erp_gl_account WHERE tenant_id=$1 AND organisation_id=$2 AND gl_account_id=ANY($3::uuid[]) AND workflow_status<>'deleted'`,values:[access.tenantId,orgId,accountIds]}),
    ctx.broker('core_erp','query',{text:`SELECT subledger_account_id,subledger_account_type_id FROM erp_subledger_account WHERE tenant_id=$1 AND organisation_id=$2 AND subledger_account_id=ANY($3::uuid[]) AND workflow_status<>'deleted'`,values:[access.tenantId,orgId,subledgerIds]}),
    ctx.broker('core_erp','query',{text:`SELECT accounting_object_id,accounting_object_type_id FROM erp_accounting_object WHERE tenant_id=$1 AND organisation_id=$2 AND accounting_object_id=ANY($3::uuid[]) AND workflow_status<>'deleted'`,values:[access.tenantId,orgId,objectIds]}),
    ctx.broker('core_erp','query',{text:`SELECT accounting_dimension_id,accounting_dimension_type_id FROM erp_accounting_dimension WHERE tenant_id=$1 AND organisation_id=$2 AND accounting_dimension_id=ANY($3::uuid[]) AND workflow_status<>'deleted'`,values:[access.tenantId,orgId,dimensionIds]}),
    ctx.broker('core_erp','query',{text:`SELECT * FROM erp_transaction_line_definition_object_type WHERE tenant_id=$1 AND organisation_id=$2`,values:[access.tenantId,orgId]}),
    ctx.broker('core_erp','query',{text:`SELECT * FROM erp_transaction_line_definition_dimension_type WHERE tenant_id=$1 AND organisation_id=$2`,values:[access.tenantId,orgId]})
  ]);
  const accountById=new Map(accounts.rows.map(row=>[row.gl_account_id,row]));
  const subledgerById=new Map(subledgers.rows.map(row=>[row.subledger_account_id,row]));
  const objectById=new Map(objects.rows.map(row=>[row.accounting_object_id,row]));
  const dimensionById=new Map(dimensions.rows.map(row=>[row.accounting_dimension_id,row]));
  for(const line of normalisedLines){
    const label=`Line ${line.line_number}`;
    const account=accountById.get(line.gl_account_id);
    if(!account)return ctx.send(400,{error:`${label} needs a valid GL account`});
    const definition=line.transaction_line_definition_id?definitionById.get(line.transaction_line_definition_id):null;
    if(line.transaction_line_definition_id&&!definition)return ctx.send(400,{error:`${label} uses a line definition from another transaction type`});
    if(definition){
      if(line.gl_account_id!==definition.gl_account_id)return ctx.send(400,{error:`${label} must use the GL configured by its line definition`});
      const side=line.debit_amount>0?'debit':'credit';
      if(side!==definition.debit_credit)return ctx.send(400,{error:`${label} must be a ${definition.debit_credit}`});
      if(definition.amount_source==='balancing'){
        const otherDebits=normalisedLines.filter(other=>other!==line).reduce((sum,other)=>sum+other.debit_amount,0);
        const otherCredits=normalisedLines.filter(other=>other!==line).reduce((sum,other)=>sum+other.credit_amount,0);
        const expected=definition.debit_credit==='debit'?otherCredits-otherDebits:otherDebits-otherCredits;
        const actual=definition.debit_credit==='debit'?line.debit_amount:line.credit_amount;
        if(expected<=0||Math.round(expected*100)!==Math.round(actual*100))return ctx.send(400,{error:`${label} must contain the calculated balancing amount`});
      }
      if(definition.subledger_requirement==='mandatory'&&!line.subledger_account_id)return ctx.send(400,{error:`${label} requires a sub-ledger`});
      if(definition.subledger_requirement==='not_used'&&line.subledger_account_id)return ctx.send(400,{error:`${label} does not use a sub-ledger`});
      const subledger=line.subledger_account_id?subledgerById.get(line.subledger_account_id):null;
      if(line.subledger_account_id&&!subledger)return ctx.send(400,{error:`${label} needs a valid sub-ledger`});
      if(subledger&&subledger.subledger_account_type_id!==definition.subledger_account_type_id)return ctx.send(400,{error:`${label} uses the wrong sub-ledger type`});
      for(const allocation of line.accounting_objects){
        const value=objectById.get(allocation.value_id);
        if(!value||value.accounting_object_type_id!==allocation.type_id)return ctx.send(400,{error:`${label} has an invalid accounting object`});
      }
      for(const allocation of line.accounting_dimensions){
        const value=dimensionById.get(allocation.value_id);
        if(!value||value.accounting_dimension_type_id!==allocation.type_id)return ctx.send(400,{error:`${label} has an invalid accounting dimension`});
      }
      const validateConfigured=(configured,captured,kind)=>{
        const applicable=configured.filter(row=>row.transaction_line_definition_id===definition.transaction_line_definition_id);
        const configuredTypes=new Set(applicable.map(row=>row.accounting_object_type_id||row.accounting_dimension_type_id));
        if(captured.some(row=>!configuredTypes.has(row.type_id)))return `${label} includes an unconfigured ${kind} type`;
        for(const requirement of applicable){
          const selected=captured.find(row=>row.type_id===(requirement.accounting_object_type_id||requirement.accounting_dimension_type_id));
          if(requirement.requirement==='mandatory'&&!selected)return `${label} requires ${kind} classification`;
          const configuredValue=requirement.accounting_object_id||requirement.accounting_dimension_id;
          if(selected&&requirement.value_behaviour==='fixed'&&selected.value_id!==configuredValue)return `${label} must use its fixed ${kind} value`;
        }
        return null;
      };
      const objectError=validateConfigured(objectRequirements.rows,line.accounting_objects,'accounting object');
      if(objectError)return ctx.send(400,{error:objectError});
      const dimensionError=validateConfigured(dimensionRequirements.rows,line.accounting_dimensions,'accounting dimension');
      if(dimensionError)return ctx.send(400,{error:dimensionError});
    }else{
      if(account.requires_subledger&&!line.subledger_account_id)return ctx.send(400,{error:`${label} requires a sub-ledger`});
      const subledger=line.subledger_account_id?subledgerById.get(line.subledger_account_id):null;
      if(line.subledger_account_id&&!subledger)return ctx.send(400,{error:`${label} needs a valid sub-ledger`});
      if(subledger&&account.required_subledger_account_type_id&&subledger.subledger_account_type_id!==account.required_subledger_account_type_id)return ctx.send(400,{error:`${label} uses the wrong sub-ledger type`});
    }
  }

  if(supplierId&&!subledgerById.has(supplierId)){
    const supplier=await ctx.broker('core_erp','query',{text:`SELECT 1 FROM erp_subledger_account WHERE tenant_id=$1 AND organisation_id=$2 AND subledger_account_id=$3 AND workflow_status<>'deleted'`,values:[access.tenantId,orgId,supplierId]});
    if(!supplier.rows.length)return ctx.send(400,{error:'Supplier must be a live sub-ledger account in this organisation'});
  }
  if(vatRecipientId){
    const recipient=await ctx.broker('core_erp','query',{text:`SELECT 1 FROM erp_legal_entity WHERE tenant_id=$1 AND organisation_id=$2 AND legal_entity_id=$3 AND workflow_status<>'deleted'`,values:[access.tenantId,orgId,vatRecipientId]});
    if(!recipient.rows.length)return ctx.send(400,{error:'VAT recipient must be a live legal entity in this organisation'});
  }
  for(const line of normalisedLines){
    const definition=definitionById.get(line.transaction_line_definition_id);
    if(definition?.subledger_type_code==='vendor'&&supplierId&&line.subledger_account_id!==supplierId)return ctx.send(400,{error:`Line ${line.line_number} must use the header supplier`});
  }
  const headerValues=[access.tenantId,orgId,transactionTypeId,periodId,divisionId,supplierId,vatRecipientId,clean(ctx.body.supplier_invoice_number),nullable(ctx.body.supplier_invoice_date),clean(ctx.body.journal_date,new Date().toISOString().slice(0,10)),clean(ctx.body.description),clean(ctx.body.currency_code,'ZAR').toUpperCase(),Number(ctx.body.exchange_rate)||1,access.auth.email];
  const lineValues=JSON.stringify(normalisedLines);
  const objectValues=JSON.stringify(normalisedLines.flatMap(line=>line.accounting_objects.map(row=>({journal_line_id:line.journal_line_id,...row}))));
  const dimensionValues=JSON.stringify(normalisedLines.flatMap(line=>line.accounting_dimensions.map(row=>({journal_line_id:line.journal_line_id,...row}))));
  const saveSql=`WITH saved AS (
      ${id?`UPDATE erp_journal SET transaction_type_id=$3,fiscal_period_id=$4,source_division_id=$5,supplier_subledger_account_id=$6,vat_recipient_legal_entity_id=$7,supplier_invoice_number=$8,supplier_invoice_date=$9,journal_date=$10,description=$11,currency_code=$12,exchange_rate=$13,updated_by_email=$14,updated_at=now() WHERE tenant_id=$1 AND organisation_id=$2 AND journal_id=$18 RETURNING *`:`INSERT INTO erp_journal(tenant_id,organisation_id,transaction_type_id,fiscal_period_id,source_division_id,supplier_subledger_account_id,vat_recipient_legal_entity_id,supplier_invoice_number,supplier_invoice_date,journal_date,description,currency_code,exchange_rate,workflow_status,created_by_email,updated_by_email) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft',$14,$14) RETURNING *`}
    ), deleted AS (DELETE FROM erp_journal_line USING saved WHERE erp_journal_line.tenant_id=$1 AND erp_journal_line.journal_id=saved.journal_id),
    line_payload AS (SELECT * FROM jsonb_to_recordset($15::jsonb) AS row(journal_line_id uuid,line_number integer,transaction_line_definition_id uuid,division_id uuid,gl_account_id uuid,subledger_account_id uuid,description text,debit_amount numeric,credit_amount numeric,currency_code text)),
    inserted_lines AS (INSERT INTO erp_journal_line(journal_line_id,tenant_id,organisation_id,journal_id,transaction_line_definition_id,line_number,division_id,gl_account_id,subledger_account_id,description,debit_amount,credit_amount,currency_code) SELECT p.journal_line_id,$1,$2,saved.journal_id,p.transaction_line_definition_id,p.line_number,p.division_id,p.gl_account_id,p.subledger_account_id,p.description,p.debit_amount,p.credit_amount,p.currency_code FROM saved CROSS JOIN line_payload p),
    object_payload AS (SELECT * FROM jsonb_to_recordset($16::jsonb) AS row(journal_line_id uuid,type_id uuid,value_id uuid)),
    inserted_objects AS (INSERT INTO erp_journal_line_accounting_object(tenant_id,organisation_id,journal_line_id,accounting_object_type_id,accounting_object_id) SELECT $1,$2,journal_line_id,type_id,value_id FROM object_payload),
    dimension_payload AS (SELECT * FROM jsonb_to_recordset($17::jsonb) AS row(journal_line_id uuid,type_id uuid,value_id uuid)),
    inserted_dimensions AS (INSERT INTO erp_journal_line_accounting_dimension(tenant_id,organisation_id,journal_line_id,accounting_dimension_type_id,accounting_dimension_id) SELECT $1,$2,journal_line_id,type_id,value_id FROM dimension_payload)
    SELECT * FROM saved`;
  const values=[...headerValues,lineValues,objectValues,dimensionValues];
  if(id)values.push(id);
  const header=await ctx.broker('core_erp','query',{text:saveSql,values});
  return {journal:header.rows[0]};
};
