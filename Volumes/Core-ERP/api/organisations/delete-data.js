'use strict';
const {authTenant,requireAdmin}=require('../_shared/erp');

function isEnabled(options,name){
  if(!options)return true;
  return options[name]===true||options[name]==='true';
}

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);
  const orgId=ctx.body.organisation_id;
  const options=ctx.body.options||null;
  if(!orgId)return ctx.send(400,{error:'organisation_id is required'});

  const org=await ctx.broker('core_erp','query',{
    text:`SELECT organisation_id FROM erp_organisation
          WHERE tenant_id=$1 AND organisation_id=$2 AND workflow_status <> 'deleted'`,
    values:[access.tenantId,orgId]
  });
  if(!org.rows.length)return ctx.send(404,{error:'Organisation was not found'});

  const wants={
    divisions:isEnabled(options,'divisions'),
    countries:isEnabled(options,'countries'),
    currencies:isEnabled(options,'currencies'),
    fiscal:isEnabled(options,'fiscal_years'),
    transactions:isEnabled(options,'transactions')||isEnabled(options,'journals'),
    subledgerAccountTypes:isEnabled(options,'subledger_account_types'),
    glAccountTypes:isEnabled(options,'gl_account_types'),
    chart:isEnabled(options,'chart_of_accounts'),
    transactionGroups:isEnabled(options,'transaction_groups'),
    transactionTypes:isEnabled(options,'transaction_types'),
    lineDefinitions:isEnabled(options,'line_definitions'),
    financialFormats:isEnabled(options,'financial_statement_formats'),
    taxTypes:isEnabled(options,'tax_types'),
    accountingTypes:isEnabled(options,'accounting_types'),
    permissions:isEnabled(options,'permissions'),
    modules:isEnabled(options,'modules')
  };

  const needsChartDelete=wants.chart||wants.glAccountTypes||wants.subledgerAccountTypes;
  const needsJournalDelete=wants.transactions||wants.fiscal||wants.divisions||needsChartDelete||wants.accountingTypes;
  const needsFinancialFormatDelete=wants.financialFormats||needsChartDelete;
  const needsLineDelete=needsJournalDelete;
  const needsAccountingTypeDelete=wants.accountingTypes;
  const needsLineDefinitionDelete=wants.lineDefinitions||needsChartDelete||wants.accountingTypes||wants.transactionTypes||wants.transactionGroups;
  const needsAccountTypeDelete=wants.glAccountTypes||wants.subledgerAccountTypes;
  const needsTransactionTypeDelete=wants.transactionTypes||wants.transactionGroups;

  const statements=[];
  const add=(name,text)=>statements.push({name,text,values:[access.tenantId,orgId]});

  if(wants.permissions)add('user_roles',`DELETE FROM erp_user_role WHERE tenant_id=$1 AND organisation_id=$2`);
  if(wants.permissions||wants.divisions)add('role_permissions',`DELETE FROM erp_role_permission WHERE tenant_id=$1 AND organisation_id=$2`);
  if(wants.permissions)add('roles',`DELETE FROM erp_role WHERE tenant_id=$1 AND organisation_id=$2`);
  if(needsJournalDelete)add('journal_documents',`DELETE FROM erp_supporting_document WHERE tenant_id=$1 AND organisation_id=$2 AND entity_kind='journal'`);
  if(needsChartDelete)add('account_documents',`DELETE FROM erp_supporting_document WHERE tenant_id=$1 AND organisation_id=$2 AND entity_kind IN('gl_account','subledger_account')`);
  if(needsLineDelete)add('journal_lines',`DELETE FROM erp_journal_line WHERE tenant_id=$1 AND organisation_id=$2`);
  if(needsJournalDelete)add('journals',`DELETE FROM erp_journal WHERE tenant_id=$1 AND organisation_id=$2`);
  if(needsLineDefinitionDelete)add('line_definitions',`DELETE FROM erp_transaction_line_definition WHERE tenant_id=$1 AND organisation_id=$2`);
  if(needsFinancialFormatDelete)add('financial_statement_formats',`DELETE FROM erp_financial_statement_format WHERE tenant_id=$1 AND organisation_id=$2`);
  if(needsTransactionTypeDelete)add('journal_transaction_links',`UPDATE erp_journal SET transaction_type_id=NULL WHERE tenant_id=$1 AND organisation_id=$2 AND transaction_type_id IS NOT NULL`);
  if(needsAccountingTypeDelete||needsChartDelete||wants.divisions)add('workflow_history',`DELETE FROM erp_workflow_history WHERE tenant_id=$1 AND organisation_id=$2`);
  if(needsAccountingTypeDelete||needsChartDelete||wants.divisions)add('accounting_dimensions',`DELETE FROM erp_accounting_dimension WHERE tenant_id=$1 AND organisation_id=$2`);
  if(needsAccountingTypeDelete||needsChartDelete||wants.divisions)add('accounting_objects',`DELETE FROM erp_accounting_object WHERE tenant_id=$1 AND organisation_id=$2`);
  if(needsChartDelete)add('subledger_accounts',`DELETE FROM erp_subledger_account WHERE tenant_id=$1 AND organisation_id=$2`);
  if(needsChartDelete)add('gl_accounts',`DELETE FROM erp_gl_account WHERE tenant_id=$1 AND organisation_id=$2`);
  if(wants.accountingTypes)add('accounting_dimension_types',`DELETE FROM erp_accounting_dimension_type WHERE tenant_id=$1 AND organisation_id=$2`);
  if(wants.accountingTypes)add('accounting_object_types',`DELETE FROM erp_accounting_object_type WHERE tenant_id=$1 AND organisation_id=$2`);
  if(needsAccountTypeDelete)add('subledger_account_types',`DELETE FROM erp_subledger_account_type WHERE tenant_id=$1 AND organisation_id=$2`);
  if(needsAccountTypeDelete)add('gl_account_types',`DELETE FROM erp_gl_account_type WHERE tenant_id=$1 AND organisation_id=$2`);
  if(wants.accountingTypes){
    add('workflow_next',`DELETE FROM erp_workflow_next WHERE tenant_id=$1 AND organisation_id=$2`);
    add('workflow_steps',`DELETE FROM erp_workflow_step WHERE tenant_id=$1 AND organisation_id=$2`);
    add('workflow_paths',`DELETE FROM erp_workflow_path WHERE tenant_id=$1 AND organisation_id=$2`);
  }
  if(wants.transactionTypes)add('transaction_types',`DELETE FROM erp_transaction_type WHERE tenant_id=$1 AND organisation_id=$2`);
  if(wants.transactionGroups)add('transaction_groups',`DELETE FROM erp_transaction_group WHERE tenant_id=$1 AND organisation_id=$2`);
  if(wants.fiscal){
    add('fiscal_periods',`DELETE FROM erp_fiscal_period WHERE tenant_id=$1 AND organisation_id=$2`);
    add('fiscal_years',`DELETE FROM erp_fiscal_year WHERE tenant_id=$1 AND organisation_id=$2`);
  }
  if(wants.divisions)add('divisions',`DELETE FROM erp_division WHERE tenant_id=$1 AND organisation_id=$2`);
  if(wants.countries)add('countries',`DELETE FROM erp_country WHERE tenant_id=$1 AND organisation_id=$2`);
  if(wants.currencies)add('currencies',`DELETE FROM erp_currency WHERE tenant_id=$1 AND organisation_id=$2`);
  if(wants.taxTypes){
    add('tax_rates',`DELETE FROM erp_tax_rate WHERE tenant_id=$1 AND organisation_id=$2`);
    add('tax_types',`DELETE FROM erp_tax_type WHERE tenant_id=$1 AND organisation_id=$2`);
  }
  if(wants.modules)add('modules',`DELETE FROM erp_module WHERE tenant_id=$1 AND organisation_id=$2`);

  if(!statements.length)return {ok:true,deleted:0,detail:{}};
  const r=await ctx.broker('core_erp','transaction',{statements:statements.map(({text,values})=>({text,values}))});
  const detail={};
  const deleted=r.results.reduce((total,result,index)=>{
    const count=result.rowCount||0;
    detail[statements[index].name]=count;
    return total+count;
  },0);
  return {ok:true,deleted,detail};
};
