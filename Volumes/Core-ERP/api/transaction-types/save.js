'use strict';
const {randomUUID}=require('crypto');
const {lineOrder,prepareLineIdentities}=require('../_shared/erp/transaction-line-order');
const {createTransactionPlan}=require('../_shared/erp/transaction-plan');
const {objectDefinitionError}=require('../_shared/erp/line-allocation');
const {validateDefaultGridView}=require('../_shared/erp/grid-views');
const {authTenant,requireAdmin,clean,nullable,parseJson,validateSchemaDefinition,validateWorkflowPath}=require('../_shared/erp');
const {moduleIds,validateModules,replaceLinks}=require('../_shared/erp/modules');

const occurrences=new Set(['required','optional','repeatable','generated']);
const requirements=new Set(['optional','mandatory']);
const behaviours=new Set(['captured','defaulted','fixed']);
const normaliseRequirement=(row,idField)=>({type_id:nullable(row.type_id),requirement:clean(row.requirement,'optional').toLowerCase(),value_behaviour:clean(row.value_behaviour,'captured').toLowerCase(),value_id:nullable(row[idField])});

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);
  let schema=null;
  if(ctx.body.schema_json!==undefined){
    try{schema=parseJson(ctx.body.schema_json,{});}catch{return ctx.send(400,{error:'Schema must be valid JSON'});}
    const errors=validateSchemaDefinition(schema);
    if(errors.length)return ctx.send(400,{error:'Schema attributes are invalid',errors});
  }
  const gridView=validateDefaultGridView(ctx.body.default_grid_view);
  if(gridView.error)return ctx.send(400,{error:gridView.error});
  const orgId=ctx.body.organisation_id;
  const id=nullable(ctx.body.transaction_type_id);
  const groupId=nullable(ctx.body.transaction_group_id);
  const code=clean(ctx.body.type_code).toLowerCase().replace(/\s+/g,'_');
  const name=clean(ctx.body.type_name);
  const description=clean(ctx.body.type_description);
  const isFinancial=ctx.body.is_financial!==false&&ctx.body.is_financial!=='false';
  const allowAdditional=ctx.body.allow_additional_lines!==false&&ctx.body.allow_additional_lines!=='false';
  const sortOrder=Number(ctx.body.sort_order)||0;
  const isActive=ctx.body.is_active!==false&&ctx.body.is_active!=='false';
  const workflowPathId=nullable(ctx.body.workflow_path_id);
  const lines=Array.isArray(ctx.body.lines)?ctx.body.lines:[];
  const selectedModules=moduleIds(ctx.body);
  if(!orgId||!groupId||!code||!name)return ctx.send(400,{error:'organisation_id, transaction_group_id, type_code, and type_name are required'});
  if(!workflowPathId)return ctx.send(400,{error:'A transaction workflow is required'});
  const invalidWorkflow=await validateWorkflowPath(ctx,access,{organisationId:orgId,workflowPathId});
  if(invalidWorkflow)return ctx.send(invalidWorkflow.status,invalidWorkflow.body);
  const invalidModules=await validateModules(ctx,access,orgId,selectedModules);
  if(invalidModules)return ctx.send(invalidModules.status,invalidModules.body);
  if(isFinancial&&lines.length<2)return ctx.send(400,{error:'Financial transaction types require at least two line definitions'});
  if(!isFinancial&&lines.length)return ctx.send(400,{error:'Non-financial transaction types cannot have line definitions'});
  const group=await ctx.broker('core_erp','query',{text:`SELECT 1 FROM erp_transaction_group WHERE tenant_id=$1 AND organisation_id=$2 AND transaction_group_id=$3`,values:[access.tenantId,orgId,groupId]});
  if(!group.rows.length)return ctx.send(404,{error:'Transaction group was not found'});

  const ids={account:new Set(),subledgerType:new Set(),objectType:new Set(),dimensionType:new Set(),object:new Set(),dimension:new Set()};
  const normalisedLines=[];
  for(const [index,line] of lines.entries()){
    const number=index+1;
    const order=lineOrder(line.line_order,number);
    if(order===null)return ctx.send(400,{error:`Line ${number} requires a non-negative whole-number sort order up to 2147483647`});
    const debitCredit=clean(line.debit_credit).toLowerCase();
    const glAccountId=nullable(line.gl_account_id||line.default_gl_account_id);
    const occurrence=clean(line.occurrence,'required').toLowerCase();
    const amountSource=clean(line.amount_source,occurrence==='generated'?'balancing':'manual').toLowerCase();
    const subledgerRequirement=clean(line.subledger_requirement,'not_used').toLowerCase();
    const subledgerTypeId=nullable(line.subledger_account_type_id);
    const lineCode=clean(line.line_code||`line_${number}`).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
    if(!['debit','credit'].includes(debitCredit))return ctx.send(400,{error:`Line ${number} requires DR/CR`});
    if(!glAccountId)return ctx.send(400,{error:`Line ${number} requires a GL account`});
    if(!occurrences.has(occurrence))return ctx.send(400,{error:`Line ${number} has an invalid occurrence`});
    if(!['manual','balancing'].includes(amountSource))return ctx.send(400,{error:`Line ${number} has an invalid amount source`});
    if(amountSource==='balancing'&&occurrence!=='generated')return ctx.send(400,{error:`Line ${number} must be generated to use a balancing amount`});
    if(!['not_used','optional','mandatory'].includes(subledgerRequirement))return ctx.send(400,{error:`Line ${number} has an invalid sub-ledger requirement`});
    if((subledgerRequirement==='not_used')!==!subledgerTypeId)return ctx.send(400,{error:`Line ${number} must pair its sub-ledger requirement with one sub-ledger type`});
    const objectRequirements=(line.object_requirements||[]).map(row=>({type_id:nullable(row.type_id||row.accounting_object_type_id)}));
    const objectRequirement=clean(line.object_requirement,'not_used').toLowerCase();
    const objectValueBehaviour=clean(line.object_value_behaviour,'captured').toLowerCase();
    const defaultObjectId=nullable(line.default_accounting_object_id);
    const allocationError=objectDefinitionError({object_requirement:objectRequirement,object_value_behaviour:objectValueBehaviour,default_accounting_object_id:defaultObjectId,object_requirements:objectRequirements,subledger_requirement:subledgerRequirement});
    if(allocationError)return ctx.send(400,{error:`Line ${number} ${allocationError}`});
    const dimensionRequirements=(line.dimension_requirements||[]).map(row=>normaliseRequirement(row,'accounting_dimension_id'));
    if(new Set(objectRequirements.map(row=>row.type_id)).size!==objectRequirements.length||new Set(dimensionRequirements.map(row=>row.type_id)).size!==dimensionRequirements.length)return ctx.send(400,{error:`Line ${number} cannot repeat an accounting object or dimension type`});
    for(const requirement of dimensionRequirements){
      if(!requirement.type_id||!requirements.has(requirement.requirement)||!behaviours.has(requirement.value_behaviour))return ctx.send(400,{error:`Line ${number} has an invalid classification requirement`});
      if((requirement.value_behaviour==='captured')!==!requirement.value_id)return ctx.send(400,{error:`Line ${number} must provide a value for defaulted or fixed classifications only`});
    }
    ids.account.add(glAccountId);
    if(subledgerTypeId)ids.subledgerType.add(subledgerTypeId);
    objectRequirements.forEach(row=>ids.objectType.add(row.type_id));
    if(defaultObjectId)ids.object.add(defaultObjectId);
    dimensionRequirements.forEach(row=>{ids.dimensionType.add(row.type_id);if(row.value_id)ids.dimension.add(row.value_id);});
    normalisedLines.push({lineOrder:order,requestedId:nullable(line.transaction_line_definition_id),lineCode,debitCredit,glAccountId,occurrence,amountSource,subledgerRequirement,subledgerTypeId,lineDescription:clean(line.line_description),objectRequirement,objectValueBehaviour,defaultObjectId,objectRequirements,dimensionRequirements});
  }
  if(new Set(normalisedLines.map(line=>line.lineCode)).size!==normalisedLines.length)return ctx.send(400,{error:'Line definition codes must be unique'});
  if(new Set(normalisedLines.map(line=>line.lineOrder)).size!==normalisedLines.length)return ctx.send(400,{error:'Line sort orders must be unique'});
  const checks=[['GL account','erp_gl_account','gl_account_id',ids.account],['sub-ledger type','erp_subledger_account_type','subledger_account_type_id',ids.subledgerType],['accounting object type','erp_accounting_object_type','accounting_object_type_id',ids.objectType],['accounting dimension type','erp_accounting_dimension_type','accounting_dimension_type_id',ids.dimensionType],['accounting object','erp_accounting_object','accounting_object_id',ids.object],['accounting dimension','erp_accounting_dimension','accounting_dimension_id',ids.dimension]];
  for(const [label,table,column,set] of checks){
    const values=[...set];
    if(!values.length)continue;
    const found=await ctx.broker('core_erp','query',{text:`SELECT ${column} FROM ${table} WHERE tenant_id=$1 AND organisation_id=$2 AND ${column}=ANY($3::uuid[])`,values:[access.tenantId,orgId,values]});
    if(found.rows.length!==values.length)return ctx.send(400,{error:`Every ${label} must belong to this organisation`});
  }
  if(ids.object.size){
    const values=await ctx.broker('core_erp','query',{text:`SELECT accounting_object_id,accounting_object_type_id FROM erp_accounting_object WHERE tenant_id=$1 AND organisation_id=$2 AND accounting_object_id=ANY($3::uuid[])`,values:[access.tenantId,orgId,[...ids.object]]});
    const typeByValue=new Map(values.rows.map(row=>[row.accounting_object_id,row.accounting_object_type_id]));
    if(normalisedLines.some(line=>line.defaultObjectId&&!line.objectRequirements.some(requirement=>typeByValue.get(line.defaultObjectId)===requirement.type_id)))return ctx.send(400,{error:'Each configured accounting object value must belong to its selected type'});
  }
  if(ids.dimension.size){
    const values=await ctx.broker('core_erp','query',{text:`SELECT accounting_dimension_id,accounting_dimension_type_id FROM erp_accounting_dimension WHERE tenant_id=$1 AND organisation_id=$2 AND accounting_dimension_id=ANY($3::uuid[])`,values:[access.tenantId,orgId,[...ids.dimension]]});
    const typeByValue=new Map(values.rows.map(row=>[row.accounting_dimension_id,row.accounting_dimension_type_id]));
    if(normalisedLines.some(line=>line.dimensionRequirements.some(requirement=>requirement.value_id&&typeByValue.get(requirement.value_id)!==requirement.type_id)))return ctx.send(400,{error:'Each configured accounting dimension value must belong to its selected type'});
  }

  const plan=createTransactionPlan(ctx,['erp_transaction_type','erp_transaction_line_definition','erp_transaction_line_definition_object_type','erp_transaction_line_definition_dimension_type','erp_transaction_type_module']);
  const current=await plan.client.query(id
    ? 'SELECT * FROM erp_transaction_type WHERE tenant_id=$1 AND organisation_id=$2 AND transaction_type_id=$3'
    : 'SELECT * FROM erp_transaction_type WHERE tenant_id=$1 AND organisation_id=$2 AND type_code=$3',[access.tenantId,orgId,id||code]);
  if(id&&!current.rows.length)return ctx.send(404,{error:'Transaction type was not found'});
  if(!id&&current.rows.length)return ctx.send(409,{error:'A transaction type with this code already exists. Choose a different code.'});
  const typeId=id||randomUUID();
  const existing=id?(await plan.client.query('SELECT * FROM erp_transaction_line_definition WHERE tenant_id=$1 AND organisation_id=$2 AND transaction_type_id=$3',[access.tenantId,orgId,typeId])).rows:[];
  let staged;
  try{staged=prepareLineIdentities(normalisedLines,existing,!id);}catch(error){if(error.status)return ctx.send(error.status,{error:error.message});throw error;}
  const typeValues=[access.tenantId,orgId,groupId,code,name,description,isFinancial,allowAdditional,sortOrder,isActive,workflowPathId,gridView.value];
  plan.write(id
    ? {text:'UPDATE erp_transaction_type SET transaction_group_id=$3,type_code=$4,type_name=$5,type_description=$6,is_financial=$7,allow_additional_lines=$8,sort_order=$9,is_active=$10,workflow_path_id=$11,default_grid_view=COALESCE($12,default_grid_view) WHERE tenant_id=$1 AND organisation_id=$2 AND transaction_type_id=$13',values:[...typeValues,typeId],expectedRowCount:1}
    : {text:"INSERT INTO erp_transaction_type(tenant_id,organisation_id,transaction_group_id,type_code,type_name,type_description,is_financial,allow_additional_lines,sort_order,is_active,workflow_path_id,default_grid_view,transaction_type_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12,'columnar'),$13)",values:[...typeValues,typeId],expectedRowCount:1});
  plan.write({text:'UPDATE erp_transaction_type SET schema_json=COALESCE($4::jsonb,schema_json) WHERE tenant_id=$1 AND organisation_id=$2 AND transaction_type_id=$3',values:[access.tenantId,orgId,typeId,schema===null?null:JSON.stringify(schema)],expectedRowCount:1});
  const statements=[];
  for(const stage of staged)statements.push({text:'UPDATE erp_transaction_line_definition SET line_order=$5,line_code=$6 WHERE tenant_id=$1 AND organisation_id=$2 AND transaction_type_id=$3 AND transaction_line_definition_id=$4',values:[access.tenantId,orgId,typeId,stage.id,stage.order,stage.code],expectedRowCount:1});
  const kept=normalisedLines.map(line=>line.definitionId);
  statements.push({text:'DELETE FROM erp_transaction_line_definition WHERE tenant_id=$1 AND organisation_id=$2 AND transaction_type_id=$3 AND NOT (transaction_line_definition_id=ANY($4::uuid[]))',values:[access.tenantId,orgId,typeId,kept]});
  for(const table of ['erp_transaction_line_definition_object_type','erp_transaction_line_definition_dimension_type'])statements.push({text:`DELETE FROM ${table} WHERE tenant_id=$1 AND organisation_id=$2 AND transaction_line_definition_id=ANY($3::uuid[])`,values:[access.tenantId,orgId,kept]});
  normalisedLines.forEach(line=>{
    const definitionId=line.definitionId;
    statements.push({text:`INSERT INTO erp_transaction_line_definition(transaction_line_definition_id,tenant_id,organisation_id,transaction_type_id,line_order,line_code,debit_credit,gl_account_id,occurrence,subledger_requirement,subledger_account_type_id,amount_source,line_description,object_requirement,object_value_behaviour,default_accounting_object_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT(transaction_line_definition_id) DO UPDATE SET line_order=excluded.line_order,line_code=excluded.line_code,debit_credit=excluded.debit_credit,gl_account_id=excluded.gl_account_id,occurrence=excluded.occurrence,subledger_requirement=excluded.subledger_requirement,subledger_account_type_id=excluded.subledger_account_type_id,amount_source=excluded.amount_source,line_description=excluded.line_description,object_requirement=excluded.object_requirement,object_value_behaviour=excluded.object_value_behaviour,default_accounting_object_id=excluded.default_accounting_object_id WHERE erp_transaction_line_definition.tenant_id=excluded.tenant_id AND erp_transaction_line_definition.organisation_id=excluded.organisation_id AND erp_transaction_line_definition.transaction_type_id=excluded.transaction_type_id`,values:[definitionId,access.tenantId,orgId,typeId,line.lineOrder,line.lineCode,line.debitCredit,line.glAccountId,line.occurrence,line.subledgerRequirement,line.subledgerTypeId,line.amountSource,line.lineDescription,line.objectRequirement,line.objectValueBehaviour,line.defaultObjectId]});
    line.objectRequirements.forEach((requirement,sortIndex)=>statements.push({text:`INSERT INTO erp_transaction_line_definition_object_type(tenant_id,organisation_id,transaction_line_definition_id,accounting_object_type_id,sort_order) VALUES($1,$2,$3,$4,$5)`,values:[access.tenantId,orgId,definitionId,requirement.type_id,(sortIndex+1)*10]}));
    line.dimensionRequirements.forEach((requirement,sortIndex)=>statements.push({text:`INSERT INTO erp_transaction_line_definition_dimension_type(tenant_id,organisation_id,transaction_line_definition_id,accounting_dimension_type_id,requirement,value_behaviour,accounting_dimension_id,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,values:[access.tenantId,orgId,definitionId,requirement.type_id,requirement.requirement,requirement.value_behaviour,requirement.value_id,(sortIndex+1)*10]}));
  });
  statements.forEach(statement=>plan.write(statement));
  await replaceLinks({...ctx,broker:async(_profile,operation,request)=>{if(operation!=='transaction')throw new Error('Unexpected module-link operation');request.statements.forEach(statement=>plan.write(statement));}},access,orgId,{table:'erp_transaction_type_module',idColumn:'transaction_type_id',idValue:typeId,moduleIds:selectedModules});
  await plan.commit();
  return {ok:true,transaction_type:{...current.rows[0],schema_json:schema||current.rows[0]?.schema_json||{},transaction_type_id:typeId,tenant_id:access.tenantId,organisation_id:orgId,transaction_group_id:groupId,type_code:code,type_name:name,type_description:description,is_financial:isFinancial,allow_additional_lines:allowAdditional,sort_order:sortOrder,is_active:isActive,workflow_path_id:workflowPathId,default_grid_view:gridView.value||current.rows[0]?.default_grid_view||'columnar'}};
};

module.exports=require("../_shared/context").withContext(module.exports);
