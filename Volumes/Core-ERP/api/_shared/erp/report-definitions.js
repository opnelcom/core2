'use strict';
// SQL identifiers and expressions are internal metadata. Definition/request values
// never become SQL identifiers. Keep every report consumer on this catalogue.
const {hasResourcePermission}=require('./access');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const numericTypes=new Set(['integer','number','decimal','currency']);
function fail(message,status=400){throw Object.assign(new Error(message),{status});}
function object(value,label){if(!value||typeof value!=='object'||Array.isArray(value))fail(`${label} must be an object`);}
function uuid(value,label){if(!UUID.test(String(value||'')))fail(`${label} is required and must be a UUID`);return value;}
const field=(key,label,type,sql)=>({key,label,type,sql});
const sharedRecord=[['workflow_status','Status','text'],['valid_from','Valid from','date'],['valid_to','Valid to','date'],['created_at','Created at','date_time'],['updated_at','Updated at','date_time']];
const classes={
 subledger_account:{table:'erp_subledger_account',id:'subledger_account_id',type:'subledger_account_type_id',types:'erp_subledger_account_type',label:'Subledger',code:'account_code',name:'account_name'},
 accounting_object:{table:'erp_accounting_object',id:'accounting_object_id',type:'accounting_object_type_id',types:'erp_accounting_object_type',label:'Accounting object',code:'object_code',name:'object_name'},
 accounting_dimension:{table:'erp_accounting_dimension',id:'accounting_dimension_id',type:'accounting_dimension_type_id',types:'erp_accounting_dimension_type',label:'Accounting dimension',code:'dimension_code',name:'dimension_name'}
};
// Keep custom parent fields and one-grid datasets identical across records and transactions.
function schemaReportFields(schema,prefix,source){
 return Object.entries(schema.properties||{}).filter(([,v])=>v.type!=='grid').map(([key,v])=>({...field(`${prefix}${key}`,v.title||key,v.type,'json'),jsonKey:key,source}));
}
function addSchemaDatasets(datasets,common,key,label,schema,base){
 const root=schemaReportFields(schema,'data:','r.additional_data');
 datasets.push({...common,key,label,fields:[...base,...root]});
 for(const [gridKey,grid] of Object.entries(schema.properties||{}).filter(([,v])=>v.type==='grid')){
  datasets.push({...common,key:`${key}:${gridKey}`,label:`${label} / ${grid.title||gridKey}`,gridKey,
   fields:[...base,...root,field('row_number','Collection row','integer','g.ordinality'),...schemaReportFields(grid.rowSchema||{},'row:','g.value')]});
 }
}
async function catalogue(ctx,access,org){
 const scope=[access.tenantId,org];
 const datasets=[];
 for(const [kind,meta] of Object.entries(classes)){
  const result=await ctx.broker('core_erp','query',{text:`SELECT type_code,type_name,schema_json FROM ${meta.types} WHERE tenant_id=$1 AND organisation_id=$2 AND is_active=true ORDER BY type_name`,values:scope});
  for(const type of result.rows){
   const schema=typeof type.schema_json==='string'?JSON.parse(type.schema_json):type.schema_json||{};
   const base=[field('id','Record ID','text',`r.${meta.id}`),field('code','Code','text',`r.${meta.code}`),field('name','Name','text',`r.${meta.name}`),field('division_code','Division code','text','d.division_code'),field('division_name','Division','text','d.division_name'),...sharedRecord.map(([k,l,t])=>field(k,l,t,`r.${k}`))];
   const common={kind,typeCode:type.type_code,table:meta.table,id:`r.${meta.id}`,division:'r.owner_division_id',joins:`JOIN ${meta.types} t ON t.${meta.type}=r.${meta.type} AND t.tenant_id=r.tenant_id AND t.organisation_id=r.organisation_id JOIN erp_division d ON d.division_id=r.owner_division_id AND d.tenant_id=r.tenant_id AND d.organisation_id=r.organisation_id`,where:`t.type_code`,fields:base};
   const root=schemaReportFields(schema,'data:','r.additional_data');
   addSchemaDatasets(datasets,common,`${kind}:${type.type_code}`,`${meta.label}: ${type.type_name}`,schema,base);
   datasets.push({...common,key:`assignment:${kind}:${type.type_code}`,label:`${meta.label}: ${type.type_name} / Resource assignments`,id:'ra.resource_assignment_id',assignmentKind:kind,
    joins:`${common.joins} JOIN erp_resource_assignment ra ON ra.object_id=r.${meta.id} AND ra.tenant_id=r.tenant_id AND ra.organisation_id=r.organisation_id AND ra.object_kind='${kind}' JOIN erp_resource res ON res.resource_id=ra.resource_id AND res.tenant_id=r.tenant_id AND res.organisation_id=r.organisation_id JOIN erp_resource_role rr ON rr.resource_role_id=ra.resource_role_id AND rr.tenant_id=r.tenant_id AND rr.organisation_id=r.organisation_id`,
    fields:[...base,...root,field('assignment_id','Assignment ID','text','ra.resource_assignment_id'),field('resource_code','Resource code','text','res.resource_code'),field('resource_name','Resource name','text','res.display_name'),field('resource_type','Resource type','text','res.resource_type'),field('resource_role_code','Resource role code','text','rr.role_code'),field('resource_role_name','Resource role','text','rr.role_name'),field('assignment_from','Assignment from','date','ra.valid_from'),field('assignment_to','Assignment to','date','ra.valid_to')]});

  }
 }
 const header=[field('id','Transaction ID','text','r.journal_id'),field('journal_number','Transaction number','text','r.journal_number'),field('journal_date','Transaction date','date','r.journal_date'),field('description','Transaction description','text','r.description'),field('workflow_status','Status','text','r.workflow_status'),field('type_code','Transaction type code','text','t.type_code'),field('type_name','Transaction type','text','t.type_name'),field('currency_code','Currency','text','r.currency_code'),field('source_division_id','Source division ID','text','r.source_division_id'),{...field('supplier_invoice_number','Supplier invoice number','text','json'),jsonKey:'supplierInvoiceNumber',source:'r.additional_data'}];
 const txJoins='LEFT JOIN erp_transaction_type t ON t.transaction_type_id=r.transaction_type_id AND t.tenant_id=r.tenant_id AND t.organisation_id=r.organisation_id';
 datasets.push({key:'transaction',kind:'transaction',label:'Transaction / journal headers',table:'erp_journal',id:'r.journal_id',division:'r.source_division_id',joins:txJoins,fields:header});
 const transactionTypes=await ctx.broker('core_erp','query',{text:'SELECT type_code,type_name,schema_json FROM erp_transaction_type WHERE tenant_id=$1 AND organisation_id=$2 AND is_active=true ORDER BY type_name',values:scope});
 for(const type of transactionTypes.rows){
  const schema=typeof type.schema_json==='string'?JSON.parse(type.schema_json):type.schema_json||{};
  const common={kind:'transaction',typeCode:type.type_code,table:'erp_journal',id:'r.journal_id',division:'r.source_division_id',joins:txJoins};
  addSchemaDatasets(datasets,common,`transaction:${type.type_code}`,`Transaction: ${type.type_name}`,schema,header);
 }
 datasets.push({key:'transaction_line',kind:'transaction_line',label:'Transaction / journal lines',table:'erp_journal',id:'l.journal_line_id',division:'l.division_id',joins:`${txJoins} JOIN erp_journal_line l ON l.journal_id=r.journal_id AND l.tenant_id=r.tenant_id AND l.organisation_id=r.organisation_id JOIN erp_gl_account a ON a.gl_account_id=l.gl_account_id AND a.tenant_id=r.tenant_id AND a.organisation_id=r.organisation_id JOIN erp_division d ON d.division_id=l.division_id AND d.tenant_id=r.tenant_id AND d.organisation_id=r.organisation_id`,fields:[...header,field('line_number','Line number','integer','l.line_number'),field('line_description','Line description','text','l.description'),field('division_code','Line division code','text','d.division_code'),field('division_name','Line division','text','d.division_name'),field('gl_account_code','GL account code','text','a.account_code'),field('gl_account_name','GL account name','text','a.account_name'),field('debit_amount','Debit','currency','l.debit_amount'),field('credit_amount','Credit','currency','l.credit_amount'),field('line_currency_code','Line currency','text','l.currency_code'),field('subledger_account_id','Subledger ID','text','l.subledger_account_id')]});
 datasets.push({key:'gl_account',kind:'gl_account',label:'GL accounts (organisation-wide)',table:'erp_gl_account',id:'r.gl_account_id',joins:'LEFT JOIN erp_gl_account_type t ON t.gl_account_type_id=r.gl_account_type_id AND t.tenant_id=r.tenant_id AND t.organisation_id=r.organisation_id',fields:[field('id','GL account ID','text','r.gl_account_id'),field('account_code','Code','text','r.account_code'),field('account_name','Name','text','r.account_name'),field('type_code','Type code','text','t.type_code'),field('type_name','Type name','text','t.type_name'),field('requires_subledger','Requires subledger','boolean','r.requires_subledger'),...sharedRecord.map(([k,l,t])=>field(k,l,t,`r.${k}`))]});
 datasets.push({key:'resource',kind:'resource',label:'Resources (organisation-wide)',table:'erp_resource',id:'r.resource_id',joins:'',fields:[field('id','Resource ID','text','r.resource_id'),field('resource_code','Code','text','r.resource_code'),field('display_name','Name','text','r.display_name'),field('resource_type','Type','text','r.resource_type'),field('linked_email','Linked email','email','r.linked_email'),field('resource_description','Description','long_text','r.resource_description'),field('is_active','Active','boolean','r.is_active'),field('created_at','Created at','date_time','r.created_at'),field('updated_at','Updated at','date_time','r.updated_at')]});
 return datasets;
}
const operators=new Set(['eq','ne','gt','gte','lt','lte','contains','is_blank','not_blank']);
function scalar(value,type,label){
 if(value===null||value===undefined||value==='')fail(`${label} needs a value`);
 if(numericTypes.has(type)){if(!/^-?\d+(?:\.\d+)?$/.test(String(value)))fail(`${label} must be numeric`);if(type==='integer'&&!/^-?\d+$/.test(String(value)))fail(`${label} must be a whole number`);return String(value);}
 if(type==='boolean'){if(![true,false,'true','false'].includes(value))fail(`${label} must be true or false`);return String(value);}
 if(type==='date'){const s=String(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||Number.isNaN(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)fail(`${label} must be a valid YYYY-MM-DD date`);return s;}
 if(type==='date_time'){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)||Number.isNaN(Date.parse(value)))fail(`${label} must be a valid date/time`);return value;}
 if(typeof value!=='string'||value.length>4000)fail(`${label} must be text of at most 4000 characters`);return value;
}
function validateDefinition(def,datasets){
 object(def,'Report definition');
 const allowed=['dataset','columns','filters','parameters','sort'];
 if(Object.keys(def).some(k=>!allowed.includes(k)))fail('Unsupported report definition setting');
 const dataset=datasets.find(d=>d.key===def.dataset);if(!dataset)fail('Report dataset is unavailable; repair the definition');
 const fields=new Map(dataset.fields.map(f=>[f.key,f]));
 const get=key=>{const f=fields.get(key);if(!f)fail(`Field ${key} is unavailable; repair the definition`);return f;};
 if(!Array.isArray(def.columns)||!def.columns.length||def.columns.length>50)fail('Choose between 1 and 50 report columns');
 const keys=new Set();
 for(const c of def.columns){object(c,'Column');get(c.field);if(Object.keys(c).some(k=>!['field','label'].includes(k)))fail('Unsupported column setting');if(keys.has(c.field))fail('Report columns cannot repeat');keys.add(c.field);if(c.label!==undefined&&(typeof c.label!=='string'||!c.label.trim()||c.label.length>120))fail('Column headings must be 1–120 characters');}
 const parameters=def.parameters||[];if(!Array.isArray(parameters)||parameters.length>20)fail('At most 20 parameters are supported');
 const names=new Set();
 for(const p of parameters){object(p,'Parameter');if(!/^[a-z][a-zA-Z0-9_]{0,39}$/.test(p.key)||['organisation_id','division_id','report_id','include_child_divisions'].includes(p.key)||names.has(p.key))fail('Parameter keys must be unique and cannot replace scope');names.add(p.key);if(!['text','date','date_time','decimal','integer','boolean'].includes(p.type))fail('Unsupported parameter type');if(typeof p.label!=='string'||!p.label.trim()||p.label.length>120)fail('Parameter label is required (maximum 120 characters)');if(p.required!==undefined&&typeof p.required!=='boolean')fail('Parameter required must be boolean');if(Object.keys(p).some(k=>!['key','label','type','required'].includes(k)))fail('Unsupported parameter setting');}
 const filters=def.filters||[];if(!Array.isArray(filters)||filters.length>30)fail('At most 30 filters are supported');
 for(const f of filters){object(f,'Filter');const meta=get(f.field);if(!operators.has(f.operator))fail('Unsupported filter operator');if(Object.keys(f).some(k=>!['field','operator','value','parameter'].includes(k)))fail('Unsupported filter setting');if(['object','array','grid'].includes(meta.type))fail('Raw JSON fields cannot be filtered');if(f.operator==='contains'&&(numericTypes.has(meta.type)||['date','date_time','boolean'].includes(meta.type)))fail('Contains requires a text field');if(['is_blank','not_blank'].includes(f.operator)){if(f.parameter||f.value!==undefined)fail('Blank filters take no value');continue;}if(f.parameter){const p=parameters.find(p=>p.key===f.parameter);if(!p||f.value!==undefined)fail('Filter must use one declared parameter or one fixed value');const compatible=numericTypes.has(meta.type)?numericTypes.has(p.type):meta.type==='date'||meta.type==='date_time'||meta.type==='boolean'?p.type===meta.type:p.type==='text';if(!compatible)fail('Parameter type must match its filter field');}else scalar(f.value,meta.type,meta.label);}
 for(const p of parameters)if(!filters.some(f=>f.parameter===p.key))fail(`Parameter ${p.key} is not used by a filter`);
 const sort=def.sort||[];if(!Array.isArray(sort)||sort.length>5)fail('At most 5 sort columns are supported');for(const s of sort){object(s,'Sort column');get(s.field);if(!['asc','desc'].includes(s.direction)||Object.keys(s).some(k=>!['field','direction'].includes(k)))fail('Sort direction must be asc or desc');}
 return dataset;
}
function compileReport(def,datasets,{tenantId,organisationId,divisionIds,parameters={},offset=0,limit=100}){
 const dataset=validateDefinition(def,datasets);
 if(!parameters||typeof parameters!=='object'||Array.isArray(parameters))fail('Parameters must be an object');
 const declared=def.parameters||[];
 if(Object.keys(parameters).some(k=>!declared.some(p=>p.key===k)))fail('Unknown report parameter');
 for(const p of declared){const v=parameters[p.key];if(v===undefined||v===null||v===''){if(p.required)fail(`${p.label} is required`);}else scalar(v,p.type,p.label);}
 const values=[tenantId,organisationId];const bind=v=>{values.push(v);return `$${values.length}`;};
 function expression(f){if(f.sql!=='json')return numericTypes.has(f.type)||['date','date_time','boolean'].includes(f.type)?f.sql:`(${f.sql})::text`;const raw=`${f.source}->>${bind(f.jsonKey)}`;if(numericTypes.has(f.type))return `(CASE WHEN ${raw} ~ '^-?[0-9]+([.][0-9]+)?$' THEN (${raw})::numeric ELSE NULL END)`;if(f.type==='boolean')return `(CASE WHEN ${raw} IN ('true','false') THEN (${raw})::boolean ELSE NULL END)`;return raw;}
 const fields=new Map(dataset.fields.map(f=>[f.key,f]));
 const cols=def.columns.map((c,i)=>({key:`c${i}`,label:c.label||fields.get(c.field).label,type:fields.get(c.field).type}));
 const select=def.columns.map((c,i)=>{const f=fields.get(c.field),expr=expression(f);return `${numericTypes.has(f.type)?`(${expr})::text`:expr} AS c${i}`;});
 let joins=dataset.joins;
 const where=['r.tenant_id=$1','r.organisation_id=$2'];
 if(dataset.kind!=='resource')where.push("r.workflow_status<>'deleted'");
 if(dataset.division){if(!divisionIds?.length)fail('No permitted report divisions',403);where.push(`${dataset.division}=ANY(${bind(divisionIds)}::uuid[])`);}
 if(dataset.typeCode)where.push(`t.type_code=${bind(dataset.typeCode)}`);
 if(dataset.gridKey){const key=bind(dataset.gridKey);joins+=` CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(r.additional_data->${key})='array' THEN r.additional_data->${key} ELSE '[]'::jsonb END) WITH ORDINALITY g(value,ordinality)`;}
 const op={eq:'=',ne:'<>',gt:'>',gte:'>=',lt:'<',lte:'<='};
 for(const f of def.filters||[]){const meta=fields.get(f.field),expr=expression(meta);if(['is_blank','not_blank'].includes(f.operator)){where.push(`(${expr} IS ${f.operator==='not_blank'?'NOT ':''}NULL ${f.operator==='not_blank'?'AND':'OR'} (${expr})::text ${f.operator==='not_blank'?'<>':'='} '')`);continue;}let v=f.parameter?parameters[f.parameter]:f.value;if(f.parameter&&(v===undefined||v===null||v===''))continue;v=scalar(v,meta.type,meta.label);const b=bind(v);if(f.operator==='contains')where.push(`strpos(lower((${expr})::text),lower(${b}::text))>0`);else {const cast=numericTypes.has(meta.type)?'numeric':meta.type==='boolean'?'boolean':meta.sql==='json'?'text':meta.type==='date'?'date':meta.type==='date_time'?'timestamptz':'text';where.push(`${expr} ${op[f.operator]} ${b}::${cast}`);}}
 const order=(def.sort||[]).map(s=>`${expression(fields.get(s.field))} ${s.direction.toUpperCase()} NULLS LAST`);order.push(dataset.id);if(dataset.gridKey)order.push('g.ordinality');
 if(!Number.isSafeInteger(offset)||offset<0||offset>1000000||!Number.isSafeInteger(limit)||limit<1||limit>10001)fail('Invalid report pagination');
 const text=`SELECT ${select.join(',')} FROM ${dataset.table} r ${joins} WHERE ${where.join(' AND ')} ORDER BY ${order.join(',')} LIMIT ${bind(limit)} OFFSET ${bind(offset)}`;
 return {text,values,columns:cols,dataset};
}
async function reportScope(ctx,access,{organisationId,divisionId,reportId,includeChildren=false}){
 uuid(organisationId,'Organisation');uuid(divisionId,'Division');uuid(reportId,'Report');
 const divisions=await ctx.broker('core_erp','query',{text:`WITH RECURSIVE scope AS (SELECT division_id FROM erp_division WHERE tenant_id=$1 AND organisation_id=$2 AND division_id=$3 AND workflow_status<>'deleted' UNION SELECT d.division_id FROM erp_division d JOIN scope s ON d.parent_division_id=s.division_id WHERE d.tenant_id=$1 AND d.organisation_id=$2 AND d.workflow_status<>'deleted' AND $4::boolean) SELECT division_id FROM scope`,values:[access.tenantId,organisationId,divisionId,includeChildren]});
 if(!divisions.rows.some(d=>d.division_id===divisionId))fail('Division is unavailable in this organisation',404);
 const permitted=[];
 for(const d of divisions.rows)if(await hasResourcePermission(ctx,access,{organisationId,divisionId:d.division_id,resourceKind:'report',resourceCode:reportId,workflowStatus:'view'}))permitted.push(d.division_id);
 if(!permitted.includes(divisionId))fail('You do not have permission to run this report in the selected division',403);
 return permitted;
}
async function reportTableReady(ctx){const r=await ctx.broker('core_erp','query',{text:"SELECT to_regclass('public.erp_report') AS report_table"});return !!r.rows[0]?.report_table;}
async function loadReport(ctx,access,org,id,{active=true}={}){uuid(org,'Organisation');uuid(id,'Report');const r=await ctx.broker('core_erp','query',{text:`SELECT * FROM erp_report WHERE tenant_id=$1 AND organisation_id=$2 AND report_id=$3 ${active?'AND is_active=true':''}`,values:[access.tenantId,org,id]});if(!r.rows.length)fail('Report is unavailable',404);return r.rows[0];}
function publicCatalogue(datasets){return datasets.map(({key,label,kind,fields})=>({key,label,kind,fields:fields.map(({key,label,type})=>({key,label,type}))}));}
module.exports={catalogue,publicCatalogue,validateDefinition,compileReport,reportScope,loadReport,reportTableReady,uuid,fail,scalar};
