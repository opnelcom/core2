'use strict';
const {createTransactionPlan}=require('./transaction-plan');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=(status,message)=>Object.assign(new Error(message),{status});
// Request values never supply SQL identifiers. This catalogue is the deletion API.
const definitions={
 organisation:['erp_organisation','organisation_id','Organisation'],
 division:['erp_division','division_id','Division'],
 country:['erp_country','country_code','Country'],
 currency:['erp_currency','currency_code','Currency'],
 exchange_rate:['erp_exchange_rate','exchange_rate_id','Exchange rate'],
 fiscal_year:['erp_fiscal_year','fiscal_year_id','Fiscal year'],
 fiscal_period:['erp_fiscal_period','fiscal_period_id','Fiscal period'],
 tax_type:['erp_tax_type','tax_type_id','Tax type'],
 tax_rate:['erp_tax_rate','tax_rate_id','Tax rate'],
 resource_role:['erp_resource_role','resource_role_id','Resource role'],
 financial_format:['erp_financial_statement_format','financial_statement_format_id','Financial statement format'],
 report:['erp_report','report_id','Report definition'],
 module:['erp_module','module_id','Module'],
 gl_account_type:['erp_gl_account_type','gl_account_type_id','GL account type'],
 subledger_account_type:['erp_subledger_account_type','subledger_account_type_id','Subledger account type'],
 accounting_object_type:['erp_accounting_object_type','accounting_object_type_id','Accounting object type'],
 accounting_dimension_type:['erp_accounting_dimension_type','accounting_dimension_type_id','Accounting dimension type'],
 transaction_group:['erp_transaction_group','transaction_group_id','Transaction group'],
 transaction_type:['erp_transaction_type','transaction_type_id','Transaction type'],
 role:['erp_role','role_id','Permission role'],
 workflow:['erp_workflow_path','workflow_path_id','Workflow'],
 workflow_status:['erp_workflow_status','workflow_status_id','Workflow status'],
};
// Only intrinsically owned configuration is destroyed with its parent.
// Memberships in other definitions, user assignments and business records block deletion.
const owned={
 erp_organisation:[
   'erp_user_menu_favourite','erp_user_organisation_context','erp_user_tenant_context',
   'erp_organisation_openai_setting','erp_division','erp_currency','erp_country',
   'erp_exchange_rate','erp_fiscal_year','erp_tax_type','erp_resource_role',
   'erp_financial_statement_format','erp_report','erp_module','erp_gl_account_type',
   'erp_subledger_account_type','erp_accounting_object_type','erp_accounting_dimension_type',
   'erp_transaction_group','erp_transaction_type','erp_role','erp_user_role','erp_user_division','erp_organisation_user',
   'erp_workflow_path','erp_workflow_status','erp_object_type_resource_role',
 ],
 erp_fiscal_year:['erp_fiscal_period'],
 erp_tax_type:['erp_tax_rate'],
 erp_financial_statement_format:['erp_financial_statement_line'],
 erp_financial_statement_line:['erp_financial_statement_line_account'],
 erp_workflow_path:['erp_workflow_path_status'],
 erp_workflow_path_status:['erp_workflow_next'],
 erp_workflow_next:['erp_workflow_action_role'],
 erp_transaction_type:['erp_transaction_line_definition','erp_transaction_type_module'],
 erp_transaction_line_definition:['erp_transaction_line_definition_object_type','erp_transaction_line_definition_dimension_type'],
 erp_report:['erp_report_module'],
 erp_role:['erp_role_permission'],
 erp_resource_role:['erp_resource_role_module'],
 erp_subledger_account_type:['erp_subledger_account_type_module'],
 erp_accounting_object_type:['erp_accounting_object_type_module'],
 erp_accounting_dimension_type:['erp_accounting_dimension_type_module'],
 erp_exchange_rate:['erp_exchange_rate_change'],
};
const identifier=value=>{
 if(typeof value!=='string'||!/^[_a-z][_a-z0-9]*$/.test(value))throw fail(409,'Unsupported database reference definition');
 return '"'+value+'"';
};

async function prepareSetupDeletion(ctx,{tenantId,organisationId,kind,id}){
 const definition=Object.hasOwn(definitions,kind)&&definitions[kind];
 if(!definition)throw fail(400,'Unsupported Setup entry');
 const [table,key,label]=definition;
 if(!uuid.test(organisationId||'')||typeof id!=='string'||!id||
   (key.endsWith('_id')&&!uuid.test(id)) || (kind==='organisation'&&id!==organisationId))throw fail(400,'Valid organisation and entry identifiers are required');
 const values=[tenantId,organisationId,id];
 const plan=createTransactionPlan(ctx,[table]);
 const rootSql=`SELECT t.* FROM ${table} t WHERE t.tenant_id=$1::uuid AND t.organisation_id=$2::uuid AND t.${key}=$3::text${key.endsWith('_id')?'::uuid':''}`;
 const selected=await plan.client.query(rootSql,values);
 if(!selected.rows.length)throw fail(404,`${label} not found`);
 const record=selected.rows[0];
 const metadata=await ctx.broker('core_erp','query',{text:`SELECT cn.nspname child_schema,child.relname child_table,parent.relname parent_table,
   array_agg(ca.attname::text ORDER BY keys.ordinality) child_columns,
   array_agg(pa.attname::text ORDER BY keys.ordinality) parent_columns
   FROM pg_constraint fk JOIN pg_class child ON child.oid=fk.conrelid
   JOIN pg_namespace cn ON cn.oid=child.relnamespace
   JOIN pg_class parent ON parent.oid=fk.confrelid JOIN pg_namespace pn ON pn.oid=parent.relnamespace
   CROSS JOIN LATERAL unnest(fk.conkey,fk.confkey) WITH ORDINALITY keys(child_key,parent_key,ordinality)
   JOIN pg_attribute ca ON ca.attrelid=child.oid AND ca.attnum=keys.child_key
   JOIN pg_attribute pa ON pa.attrelid=parent.oid AND pa.attnum=keys.parent_key
   WHERE fk.contype='f' AND pn.nspname='public' AND parent.relname LIKE 'erp_%'
   GROUP BY fk.oid,cn.nspname,child.relname,parent.relname`});
 const edges=metadata.rows;
 const nodes=[{table,sql:rootSql}];
 const nodeFor=new Map([[table,nodes[0]]]);
 // Union selectors when two FK edges (e.g. current/target status) reach the same owned table.
 for(let i=0;i<nodes.length;i++){
   const parent=nodes[i];
   for(const childTable of owned[parent.table]||[]){
     const links=edges.filter(e=>e.child_schema==='public'&&e.parent_table===parent.table&&e.child_table===childTable);
     if(!links.length)throw fail(409,'Initialise Schema is required: expected Setup references are missing');
     if(nodeFor.has(childTable))continue;
     const sql=`SELECT t.* FROM ${identifier(childTable)} t WHERE EXISTS (SELECT 1 FROM (${parent.sql}) p WHERE ${links.map(e=>'('+e.child_columns.map((c,index)=>`t.${identifier(c)}=p.${identifier(e.parent_columns[index])}`).join(' AND ')+')').join(' OR ')})`;
     const node={table:childTable,sql};nodes.push(node);nodeFor.set(childTable,node);
   }
 }
 for(const node of nodes){
   // A saved snapshot protects both owned rows and empty dependency checks against concurrent writes.
   if(node!==nodes[0])await plan.client.query(node.sql,values);
   for(const edge of edges.filter(e=>e.parent_table===node.table)){
     if(edge.child_schema!=='public'||!/^erp_[a-z_]+$/.test(edge.child_table))throw fail(409,'Entry has references outside the ERP application');
     const matching=`EXISTS (SELECT 1 FROM (${node.sql}) p WHERE ${edge.child_columns.map((c,index)=>`t.${identifier(c)}=p.${identifier(edge.parent_columns[index])}`).join(' AND ')})`;
     const child=nodeFor.get(edge.child_table);
     const ownedEdge=(owned[node.table]||[]).includes(edge.child_table);
     if(ownedEdge)continue;
     // Another owned branch can reference this branch, but must not reference records outside the deletion set.
     const excluded=child?` AND NOT EXISTS (SELECT 1 FROM (${child.sql}) owned_row WHERE to_jsonb(t)=to_jsonb(owned_row))`:'';
     const dependency=await plan.client.query(`SELECT 1 FROM ${identifier(edge.child_table)} t WHERE ${matching}${excluded} LIMIT 1`,values);
     if(dependency.rows.length)throw fail(409,`${label} cannot be permanently deleted: it is referenced by ${edge.child_table.replace(/^erp_/,'').replaceAll('_',' ')}. Remove or reassign the reference first.`);
   }
 }
 // Some application references deliberately have no FK (status codes, permission scopes,
 // polymorphic type assignments, and currency/country codes). Protect these too.
 const columns=await ctx.broker('core_erp','query',{text:`SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name LIKE 'erp_%'`});
 const byTable=new Map();
 for(const column of columns.rows){
   if(!/^erp_[a-z_]+$/.test(column.table_name))continue;
   if(!byTable.has(column.table_name))byTable.set(column.table_name,[]);
   byTable.get(column.table_name).push(column);
 }
 const code=record.status_code||record.type_code;
 const scalarKeys=new Set([key]);
 if(kind==='currency')for(const c of ['base_currency_code','default_currency_code','from_currency_code','to_currency_code'])scalarKeys.add(c);
 if(kind==='workflow_status')for(const c of ['workflow_status','previous_step_code','new_step_code','step_code','current_step_code','next_step_code'])scalarKeys.add(c);
 const referenceValue=kind==='workflow_status'?record.status_code:id;
 for(const [otherTable,cols]of byTable){
   const names=new Set(cols.map(c=>c.column_name));
   if(!names.has('tenant_id')||!names.has('organisation_id'))continue;
   const conditions=[];
   for(const c of scalarKeys)if(names.has(c))conditions.push(`t.${identifier(c)}::text=$4`);
   const typeKind=kind.replace(/_type$/,'');
   if(kind.endsWith('_type')&&names.has('object_type_id')&&names.has('object_kind'))conditions.push(`(t.object_type_id::text=$3::text AND t.object_kind=$5::text)`);
   if(names.has('resource_code')&&names.has('resource_kind'))conditions.push(`(t.resource_code=$3::text AND t.resource_kind=$5::text)`);
   // UUID references in configurable schemas, reports, or JSON-bound defaults must not dangle.
   if(uuid.test(id)||['currency','country'].includes(kind))for(const col of cols.filter(c=>c.data_type==='jsonb'))conditions.push(`jsonb_path_exists(t.${identifier(col.column_name)},'$.** ? (@ == $value)',jsonb_build_object('value',$3::text))`);
   if(!conditions.length)continue;
   const same=nodeFor.get(otherTable);
   const excluded=same?` AND NOT EXISTS (SELECT 1 FROM (${same.sql}) owned_row WHERE to_jsonb(owned_row)=to_jsonb(t))`:'';
   const refs=await plan.client.query(`SELECT 1 FROM ${identifier(otherTable)} t WHERE t.tenant_id=$1 AND t.organisation_id=$2 AND $4::text IS NOT NULL AND $5::text IS NOT NULL AND (${conditions.join(' OR ')})${excluded} LIMIT 1`,[...values,referenceValue,typeKind]);
   if(refs.rows.length)throw fail(409,`${label} cannot be permanently deleted: it is used by ${otherTable.replace(/^erp_/,'').replaceAll('_',' ')}.`);
   if(code&&kind.endsWith('_type')&&names.has('schema_json')){
     const schemas=await plan.client.query(`SELECT schema_json FROM ${identifier(otherTable)} t WHERE t.tenant_id=$1 AND t.organisation_id=$2 AND $3::text IS NOT NULL${excluded}`,values);
     const references=value=>value&&typeof value==='object'&&(value.target?.class===typeKind&&Array.isArray(value.target.types)&&value.target.types.includes(code)||Object.values(value).some(references));
     if(schemas.rows.some(row=>references(row.schema_json)))throw fail(409,`${label} cannot be permanently deleted: another type schema references it.`);
   }
 }
 for(const node of [...nodes].reverse()){
   plan.write({text:`DELETE FROM ${identifier(node.table)} t WHERE EXISTS (SELECT 1 FROM (${node.sql}) selected_row WHERE to_jsonb(t)=to_jsonb(selected_row))`,values});
 }
 return plan;
}
module.exports={definitions,owned,prepareSetupDeletion};
