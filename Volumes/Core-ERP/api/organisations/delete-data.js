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
    ledgerFamilies:isEnabled(options,'ledger_families'),
    ledgerTypes:isEnabled(options,'ledger_types'),
    chart:isEnabled(options,'chart_of_accounts'),
    transactionGroups:isEnabled(options,'transaction_groups'),
    transactionTypes:isEnabled(options,'transaction_types'),
    postingRules:isEnabled(options,'posting_rules'),
    financialFormats:isEnabled(options,'financial_statement_formats'),
    taxTypes:isEnabled(options,'tax_types'),
    masterDataTypes:isEnabled(options,'master_data_types'),
    permissions:isEnabled(options,'permissions')
  };

  const needsChartDelete=wants.chart||wants.ledgerTypes||wants.ledgerFamilies;
  const needsJournalDelete=wants.transactions||wants.fiscal||wants.divisions||needsChartDelete;
  const needsFinancialFormatDelete=wants.financialFormats||needsChartDelete;
  const needsLineDelete=needsJournalDelete;
  const needsMasterRecordDelete=wants.masterDataTypes||needsChartDelete||wants.divisions;
  const needsPostingRuleDelete=wants.postingRules||needsChartDelete||wants.transactionTypes||wants.transactionGroups;
  const needsLedgerTypeDelete=wants.ledgerTypes||wants.ledgerFamilies;
  const needsTransactionTypeDelete=wants.transactionTypes||wants.transactionGroups;

  const statements=[];
  const add=(name,text)=>statements.push({name,text,values:[access.tenantId,orgId]});

  if(wants.permissions)add('user_roles',`DELETE FROM erp_user_role WHERE tenant_id=$1 AND organisation_id=$2`);
  if(wants.permissions||wants.divisions)add('role_permissions',`DELETE FROM erp_role_permission WHERE tenant_id=$1 AND organisation_id=$2`);
  if(wants.permissions)add('roles',`DELETE FROM erp_role WHERE tenant_id=$1 AND organisation_id=$2`);
  if(needsJournalDelete)add('journal_documents',`DELETE FROM erp_supporting_document WHERE tenant_id=$1 AND organisation_id=$2 AND entity_kind='journal'`);
  if(needsMasterRecordDelete)add('master_data_documents',`DELETE FROM erp_supporting_document WHERE tenant_id=$1 AND organisation_id=$2 AND entity_kind='master_data_record'`);
  if(needsChartDelete)add('account_documents',`DELETE FROM erp_supporting_document WHERE tenant_id=$1 AND organisation_id=$2 AND entity_kind='ledger_account'`);
  if(needsLineDelete)add('journal_lines',`DELETE FROM erp_journal_line WHERE tenant_id=$1 AND organisation_id=$2`);
  if(needsJournalDelete)add('journals',`DELETE FROM erp_journal WHERE tenant_id=$1 AND organisation_id=$2`);
  if(needsPostingRuleDelete)add('posting_rules',`DELETE FROM erp_posting_rule WHERE tenant_id=$1 AND organisation_id=$2`);
  if(needsFinancialFormatDelete)add('financial_statement_formats',`DELETE FROM erp_financial_statement_format WHERE tenant_id=$1 AND organisation_id=$2`);
  if(needsTransactionTypeDelete)add('journal_transaction_links',`UPDATE erp_journal SET transaction_type_id=NULL WHERE tenant_id=$1 AND organisation_id=$2 AND transaction_type_id IS NOT NULL`);
  if(needsMasterRecordDelete)add('master_data_records',`DELETE FROM erp_master_data_record WHERE tenant_id=$1 AND organisation_id=$2`);
  if(needsChartDelete)add('chart_of_accounts',`DELETE FROM erp_ledger_account WHERE tenant_id=$1 AND organisation_id=$2`);
  if(needsLedgerTypeDelete)add('ledger_types',`DELETE FROM erp_ledger_account_type WHERE tenant_id=$1 AND organisation_id=$2`);
  if(wants.masterDataTypes||wants.ledgerFamilies)add('master_data_types',`DELETE FROM erp_master_data_type WHERE tenant_id=$1 AND organisation_id=$2`);
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
  if(wants.ledgerFamilies)add('ledger_families',`DELETE FROM erp_ledger_family WHERE tenant_id=$1 AND organisation_id=$2`);

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
