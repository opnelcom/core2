'use strict';
const {authTenant}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  if(!orgId)return ctx.send(400,{error:'organisation_id is required'});
  const [groups,types,definitions,objects,dimensions]=await Promise.all([
    ctx.broker('core_erp','query',{text:`SELECT * FROM erp_transaction_group WHERE tenant_id=$1 AND organisation_id=$2 ORDER BY sort_order,group_name`,values:[access.tenantId,orgId]}),
    ctx.broker('core_erp','query',{text:`SELECT tt.*,tg.group_code,tg.group_name,COALESCE((SELECT array_agg(tm.module_id) FROM erp_transaction_type_module tm WHERE tm.transaction_type_id=tt.transaction_type_id),'{}'::uuid[]) module_ids FROM erp_transaction_type tt JOIN erp_transaction_group tg ON tg.transaction_group_id=tt.transaction_group_id WHERE tt.tenant_id=$1 AND tt.organisation_id=$2 ORDER BY tg.sort_order,tt.sort_order,tt.type_name`,values:[access.tenantId,orgId]}),
    ctx.broker('core_erp','query',{text:`SELECT definition.*,type.type_code,account.account_code,account.account_name,subledger.type_code subledger_type_code,subledger.type_name subledger_type_name FROM erp_transaction_line_definition definition JOIN erp_transaction_type type ON type.transaction_type_id=definition.transaction_type_id JOIN erp_gl_account account ON account.gl_account_id=definition.gl_account_id LEFT JOIN erp_subledger_account_type subledger ON subledger.subledger_account_type_id=definition.subledger_account_type_id WHERE definition.tenant_id=$1 AND definition.organisation_id=$2 ORDER BY type.type_code,definition.line_order`,values:[access.tenantId,orgId]}),
    ctx.broker('core_erp','query',{text:`SELECT requirement.*,type.type_code,type.type_name,object.object_code,object.object_name FROM erp_transaction_line_definition_object_type requirement JOIN erp_accounting_object_type type ON type.accounting_object_type_id=requirement.accounting_object_type_id LEFT JOIN erp_accounting_object object ON object.accounting_object_id=requirement.accounting_object_id WHERE requirement.tenant_id=$1 AND requirement.organisation_id=$2 ORDER BY requirement.sort_order,type.type_name`,values:[access.tenantId,orgId]}),
    ctx.broker('core_erp','query',{text:`SELECT requirement.*,type.type_code,type.type_name,dimension.dimension_code,dimension.dimension_name FROM erp_transaction_line_definition_dimension_type requirement JOIN erp_accounting_dimension_type type ON type.accounting_dimension_type_id=requirement.accounting_dimension_type_id LEFT JOIN erp_accounting_dimension dimension ON dimension.accounting_dimension_id=requirement.accounting_dimension_id WHERE requirement.tenant_id=$1 AND requirement.organisation_id=$2 ORDER BY requirement.sort_order,type.type_name`,values:[access.tenantId,orgId]})
  ]);
  const objectByDefinition=Object.groupBy?Object.groupBy(objects.rows,row=>row.transaction_line_definition_id):objects.rows.reduce((all,row)=>((all[row.transaction_line_definition_id]||=[]).push(row),all),{});
  const dimensionByDefinition=Object.groupBy?Object.groupBy(dimensions.rows,row=>row.transaction_line_definition_id):dimensions.rows.reduce((all,row)=>((all[row.transaction_line_definition_id]||=[]).push(row),all),{});
  const lines=definitions.rows.map(line=>({...line,object_requirements:objectByDefinition[line.transaction_line_definition_id]||[],dimension_requirements:dimensionByDefinition[line.transaction_line_definition_id]||[]}));
  return {transaction_groups:groups.rows,transaction_types:types.rows,line_definitions:lines};
};
