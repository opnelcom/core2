'use strict';

const {authTenant,requireAdmin}=require('../_shared/erp');
const copySeedingData=require('../organisations/copy-seeding-data');

const EXAMPLE_CODE='EXAMPLE';
const EXAMPLE_NAME='Example (PTY) LTD';

const sampleAmounts={
  manual_journal:120,
  cash_sale:2500,
  customer_invoice:4200,
  customer_payment:1800,
  supplier_invoice:1300,
  supplier_payment:900,
  bank_charge:75,
  bank_deposit:500,
  bank_withdrawal:250,
  tax_accrual:310,
  tax_payment:310,
  payroll_accrual:2200,
  payroll_payment:2200,
  asset_purchase_cash:1600,
  asset_purchase_account:1900,
  depreciation:220,
  loan_received:5000,
  loan_repayment_principal:700,
  loan_interest_payment:85
};

const subledgerTemplates={
  bank:{code:'MAIN_BANK',name:'Main Bank Account',type:'current_account',legal:'Example Bank'},
  cash_location:{code:'SHOP_1_TILL_1',name:'Shop 1, Till 1',type:'point_of_sale'},
  customer:{code:'CUST_DEMO',name:'Demo Customer',type:'trade_customer',legal:'Demo Customer (PTY) LTD'},
  vendor:{code:'VEND_DEMO',name:'Demo Vendor',type:'trade_vendor',legal:'Demo Vendor (PTY) LTD'},
  employee:{code:'EMP_DEMO',name:'Demo Employee',type:'permanent_employee'},
  loan:{code:'LOAN_DEMO',name:'Demo Loan',type:'loan_account',legal:'Demo Lender (PTY) LTD'}
};

const exampleFiscalYears=[
  {code:'FY2026',start:'2026-01-01',end:'2026-12-31'},
  {code:'FY2027',start:'2027-01-01',end:'2027-12-31'}
];

function fallbackTemplate(family,row){
  const label=row.family_name||family.replaceAll('_',' ');
  return {
    code:`DEMO_${family.toUpperCase().replace(/[^A-Z0-9]+/g,'_').slice(0,48)}`,
    name:`Demo ${label}`,
    type:null,
    legal:`Demo ${label} Counterparty`
  };
}

async function query(ctx,text,values){
  return ctx.broker('core_erp','query',{text,values});
}

async function deleteExistingExample(ctx,access){
  const existing=await query(ctx,`SELECT organisation_id
    FROM erp_organisation
    WHERE tenant_id=$1 AND organisation_code=$2 AND workflow_status <> 'deleted'`,[access.tenantId,EXAMPLE_CODE]);
  if(!existing.rowCount)return 0;
  const orgIds=existing.rows.map(row=>row.organisation_id);
  const statements=[
    `DELETE FROM erp_supporting_document WHERE tenant_id=$1 AND organisation_id=ANY($2::uuid[])`,
    `DELETE FROM erp_journal_line WHERE tenant_id=$1 AND organisation_id=ANY($2::uuid[])`,
    `DELETE FROM erp_journal WHERE tenant_id=$1 AND organisation_id=ANY($2::uuid[])`,
    `DELETE FROM erp_posting_rule WHERE tenant_id=$1 AND organisation_id=ANY($2::uuid[])`,
    `DELETE FROM erp_user_role WHERE tenant_id=$1 AND organisation_id=ANY($2::uuid[])`,
    `DELETE FROM erp_role_permission WHERE tenant_id=$1 AND organisation_id=ANY($2::uuid[])`,
    `DELETE FROM erp_role WHERE tenant_id=$1 AND organisation_id=ANY($2::uuid[])`,
    `DELETE FROM erp_master_data_record WHERE tenant_id=$1 AND organisation_id=ANY($2::uuid[])`,
    `DELETE FROM erp_master_data_type WHERE tenant_id=$1 AND organisation_id=ANY($2::uuid[])`,
    `DELETE FROM erp_ledger_account WHERE tenant_id=$1 AND organisation_id=ANY($2::uuid[])`,
    `DELETE FROM erp_legal_entity_relationship WHERE tenant_id=$1 AND organisation_id=ANY($2::uuid[])`,
    `DELETE FROM erp_legal_entity_address WHERE tenant_id=$1 AND organisation_id=ANY($2::uuid[])`,
    `DELETE FROM erp_legal_entity_identification WHERE tenant_id=$1 AND organisation_id=ANY($2::uuid[])`,
    `DELETE FROM erp_legal_entity WHERE tenant_id=$1 AND organisation_id=ANY($2::uuid[])`,
    `DELETE FROM erp_ledger_account_type WHERE tenant_id=$1 AND organisation_id=ANY($2::uuid[])`,
    `DELETE FROM erp_transaction_type WHERE tenant_id=$1 AND organisation_id=ANY($2::uuid[])`,
    `DELETE FROM erp_transaction_group WHERE tenant_id=$1 AND organisation_id=ANY($2::uuid[])`,
    `DELETE FROM erp_fiscal_period WHERE tenant_id=$1 AND organisation_id=ANY($2::uuid[])`,
    `DELETE FROM erp_fiscal_year WHERE tenant_id=$1 AND organisation_id=ANY($2::uuid[])`,
    `DELETE FROM erp_division WHERE tenant_id=$1 AND organisation_id=ANY($2::uuid[])`,
    `DELETE FROM erp_organisation WHERE tenant_id=$1 AND organisation_id=ANY($2::uuid[])`
  ];
  const deleted=await ctx.broker('core_erp','transaction',{
    statements:statements.map(text=>({text,values:[access.tenantId,orgIds]}))
  });
  return deleted.results.reduce((total,result)=>total+(result.rowCount||0),0);
}

async function createExampleOrganisation(ctx,access){
  const org=await query(ctx,`INSERT INTO erp_organisation(
      tenant_id,organisation_code,organisation_name,is_template,base_currency_code,workflow_status,
      created_by_email,updated_by_email,approved_by_email,approved_at
    )
    VALUES($1,$2,$3,false,'ZAR','approved',$4,$4,$4,now())
    RETURNING *`,[access.tenantId,EXAMPLE_CODE,EXAMPLE_NAME,access.auth.email]);
  await query(ctx,`INSERT INTO erp_division(
      tenant_id,organisation_id,parent_division_id,division_code,division_name,workflow_status,created_by_email,updated_by_email
    )
    VALUES($1,$2,NULL,'ROOT',$3,'approved',$4,$4)`,[
      access.tenantId,org.rows[0].organisation_id,EXAMPLE_NAME,access.auth.email
    ]);
  return org.rows[0];
}

async function ensureExampleRootDivision(ctx,access,orgId){
  const existing=await query(ctx,`SELECT division_id
    FROM erp_division
    WHERE tenant_id=$1
      AND organisation_id=$2
      AND division_code='ROOT'
      AND parent_division_id IS NULL
      AND workflow_status <> 'deleted'
    ORDER BY created_at
    LIMIT 1`,[access.tenantId,orgId]);
  if(existing.rowCount){
    await query(ctx,`UPDATE erp_division
      SET division_name=$3,updated_by_email=$4,updated_at=now()
      WHERE tenant_id=$1 AND organisation_id=$2 AND division_id=$5`,[
        access.tenantId,orgId,EXAMPLE_NAME,access.auth.email,existing.rows[0].division_id
      ]);
    return existing.rows[0].division_id;
  }
  const inserted=await query(ctx,`INSERT INTO erp_division(
      tenant_id,organisation_id,parent_division_id,division_code,division_name,workflow_status,created_by_email,updated_by_email
    )
    VALUES($1,$2,NULL,'ROOT',$3,'approved',$4,$4)
    RETURNING division_id`,[access.tenantId,orgId,EXAMPLE_NAME,access.auth.email]);
  return inserted.rows[0].division_id;
}

async function ensureExampleFiscalYears(ctx,access,orgId){
  const fiscalYears=[];
  for(const fiscal of exampleFiscalYears){
    const year=await query(ctx,`INSERT INTO erp_fiscal_year(
        tenant_id,organisation_id,fiscal_year_code,start_date,end_date,status
      )
      VALUES($1,$2,$3,$4,$5,'open')
      ON CONFLICT(tenant_id,organisation_id,fiscal_year_code) DO UPDATE
      SET start_date=excluded.start_date,end_date=excluded.end_date,status='open',updated_at=now()
      RETURNING fiscal_year_id,fiscal_year_code,start_date,end_date,status`,[
        access.tenantId,orgId,fiscal.code,fiscal.start,fiscal.end
      ]);
    await query(ctx,`INSERT INTO erp_fiscal_period(
        tenant_id,organisation_id,fiscal_year_id,period_number,period_code,start_date,end_date,status
      )
      SELECT $1,$2,$3,n,concat($4::text,'-',lpad(n::text,2,'0')),
        ($5::date + ((n-1)||' months')::interval)::date,
        (($5::date + (n||' months')::interval)::date - 1),
        'open'
      FROM generate_series(1,12) n
      ON CONFLICT(tenant_id,organisation_id,fiscal_year_id,period_number) DO UPDATE
      SET period_code=excluded.period_code,
        start_date=excluded.start_date,
        end_date=excluded.end_date,
        status='open',
        updated_at=now()`,[
        access.tenantId,orgId,year.rows[0].fiscal_year_id,fiscal.code,fiscal.start
      ]);
    fiscalYears.push(year.rows[0]);
  }
  return fiscalYears;
}

async function copyTemplateSetup(ctx,access,templateId,exampleId){
  const copyCtx={
    ...ctx,
    req:{...ctx.req,method:'POST'},
    body:{
      source_organisation_id:templateId,
      target_organisation_id:exampleId,
      options:null
    },
    send:(status,body)=>({__sent:true,status,body})
  };
  const copied=await copySeedingData(copyCtx);
  if(copied&&copied.__sent)throw Object.assign(new Error(copied.body?.error||'Could not copy template setup'),{status:copied.status});
  return copied;
}

async function validateTemplateSetup(ctx,access,templateId){
  const counts=await query(ctx,`SELECT
      (SELECT count(*)::int FROM erp_ledger_family WHERE tenant_id=$1 AND organisation_id=$2) AS ledger_families,
      (SELECT count(*)::int FROM erp_ledger_account_type WHERE tenant_id=$1 AND organisation_id=$2) AS ledger_types,
      (SELECT count(*)::int FROM erp_ledger_account WHERE tenant_id=$1 AND organisation_id=$2 AND ledger_family_code='gl' AND workflow_status <> 'deleted') AS gl_accounts,
      (SELECT count(*)::int FROM erp_transaction_group WHERE tenant_id=$1 AND organisation_id=$2) AS transaction_groups,
      (SELECT count(*)::int FROM erp_transaction_type WHERE tenant_id=$1 AND organisation_id=$2) AS transaction_types,
      (SELECT count(*)::int FROM erp_posting_rule WHERE tenant_id=$1 AND organisation_id=$2) AS posting_rules,
      (SELECT count(*)::int FROM erp_tax_type WHERE tenant_id=$1 AND organisation_id=$2) AS tax_types,
      (SELECT count(*)::int FROM erp_tax_rate WHERE tenant_id=$1 AND organisation_id=$2) AS tax_rates`,[
      access.tenantId,templateId
    ]);
  const row=counts.rows[0]||{};
  const missing=Object.entries(row)
    .filter(([,count])=>Number(count)<=0)
    .map(([key])=>key.replaceAll('_',' '));
  if(missing.length){
    throw Object.assign(new Error(`Initialise the Template Organisation before creating example data. Missing: ${missing.join(', ')}.`),{
      status:400,
      counts:row
    });
  }
  return row;
}

async function createLegalEntity(ctx,access,orgId,name){
  const existing=await query(ctx,`SELECT legal_entity_id
    FROM erp_legal_entity
    WHERE tenant_id=$1 AND organisation_id=$2 AND lower(known_name)=lower($3) AND workflow_status <> 'deleted'
    LIMIT 1`,[access.tenantId,orgId,name]);
  if(existing.rowCount)return existing.rows[0].legal_entity_id;
  const inserted=await query(ctx,`INSERT INTO erp_legal_entity(
      tenant_id,organisation_id,entity_type,legal_name,known_name,workflow_status,
      created_by_email,updated_by_email,approved_by_email,approved_at
    )
    VALUES($1,$2,'company',$3,$3,'approved',$4,$4,$4,now())
    RETURNING legal_entity_id`,[access.tenantId,orgId,name,access.auth.email]);
  return inserted.rows[0].legal_entity_id;
}

async function ensureSubledgers(ctx,access,orgId,rootDivisionId){
  const [families,types]=await Promise.all([
    query(ctx,`SELECT ledger_family_code,family_name,requires_legal_entity
      FROM erp_ledger_family
      WHERE tenant_id=$1 AND organisation_id=$2 AND is_active=true`,[access.tenantId,orgId]),
    query(ctx,`SELECT account_type_id,ledger_family_code,account_type_code,is_required
      FROM erp_ledger_account_type
      WHERE tenant_id=$1 AND organisation_id=$2 AND is_active=true
      ORDER BY is_required DESC,account_type_code`,[access.tenantId,orgId])
  ]);
  const familyRows=new Map(families.rows.map(row=>[row.ledger_family_code,row]));
  const typeRows=new Map();
  types.rows.forEach(row=>{
    const key=`${row.ledger_family_code}:${row.account_type_code}`;
    typeRows.set(key,row.account_type_id);
    if(!typeRows.has(row.ledger_family_code))typeRows.set(row.ledger_family_code,row.account_type_id);
  });

  const subledgers={};
  for(const [family,row] of familyRows.entries()){
    if(family==='gl')continue;
    const template=subledgerTemplates[family]||fallbackTemplate(family,row);
    let accountTypeId=(template.type&&typeRows.get(`${family}:${template.type}`))||typeRows.get(family);
    if(!accountTypeId){
      const insertedType=await query(ctx,`INSERT INTO erp_ledger_account_type(
          tenant_id,organisation_id,ledger_family_code,account_type_code,account_type_name,is_required,is_seeded,is_active
        )
        VALUES($1,$2,$3,'standard','Standard',false,true,true)
        RETURNING account_type_id`,[access.tenantId,orgId,family]);
      accountTypeId=insertedType.rows[0].account_type_id;
      typeRows.set(family,accountTypeId);
    }
    const legalEntityId=familyRows.get(family).requires_legal_entity
      ? await createLegalEntity(ctx,access,orgId,template.legal||template.name)
      : null;
    const existing=await query(ctx,`SELECT ledger_account_id
      FROM erp_ledger_account
      WHERE tenant_id=$1 AND organisation_id=$2 AND ledger_family_code=$3 AND account_code=$4 AND workflow_status <> 'deleted'
      LIMIT 1`,[access.tenantId,orgId,family,template.code]);
    if(existing.rowCount){
      subledgers[family]=existing.rows[0].ledger_account_id;
      continue;
    }
    const inserted=await query(ctx,`INSERT INTO erp_ledger_account(
        tenant_id,organisation_id,owner_division_id,ledger_family_code,account_code,account_name,account_type_id,legal_entity_id,
        requires_subledger,required_subledger_family_code,workflow_status,additional_data,
        created_by_email,updated_by_email,approved_by_email,approved_at
      )
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,false,NULL,'approved',$9::jsonb,$10,$10,$10,now())
      RETURNING ledger_account_id`,[
        access.tenantId,orgId,rootDivisionId,family,template.code,template.name,accountTypeId,legalEntityId,
        JSON.stringify({example:true}),access.auth.email
      ]);
    subledgers[family]=inserted.rows[0].ledger_account_id;
  }
  return subledgers;
}

function sampleAmount(typeCode,index){
  return sampleAmounts[typeCode]||((index+1)*100);
}

async function createSampleJournals(ctx,access,orgId,rootDivisionId,periods,subledgers){
  const [types,rules,accounts]=await Promise.all([
    query(ctx,`SELECT transaction_type_id,type_code,type_name
      FROM erp_transaction_type
      WHERE tenant_id=$1 AND organisation_id=$2 AND is_active=true
      ORDER BY sort_order,type_code`,[access.tenantId,orgId]),
    query(ctx,`SELECT pr.*,tt.type_code,a.account_code,a.requires_subledger,a.required_subledger_family_code
      FROM erp_posting_rule pr
      JOIN erp_transaction_type tt ON tt.transaction_type_id=pr.transaction_type_id
      LEFT JOIN erp_ledger_account a ON a.ledger_account_id=pr.default_gl_account_id
      WHERE pr.tenant_id=$1 AND pr.organisation_id=$2
      ORDER BY tt.sort_order,tt.type_code,pr.line_order`,[access.tenantId,orgId]),
    query(ctx,`SELECT ledger_account_id,account_code,requires_subledger,required_subledger_family_code
      FROM erp_ledger_account
      WHERE tenant_id=$1 AND organisation_id=$2 AND ledger_family_code='gl' AND workflow_status <> 'deleted'`,[access.tenantId,orgId])
  ]);
  const glById=new Map(accounts.rows.map(row=>[row.ledger_account_id,row]));
  const rulesByType=new Map();
  rules.rows.forEach(rule=>{
    if(!rulesByType.has(rule.transaction_type_id))rulesByType.set(rule.transaction_type_id,[]);
    rulesByType.get(rule.transaction_type_id).push(rule);
  });

  let journalCount=0;
  let lineCount=0;
  for(const [index,type] of types.rows.entries()){
    const typeRules=rulesByType.get(type.transaction_type_id)||[];
    if(typeRules.length<2)continue;
    const amount=sampleAmount(type.type_code,index);
    const period=periods[journalCount%periods.length];
    const journal=await query(ctx,`INSERT INTO erp_journal(
        tenant_id,organisation_id,transaction_type_id,fiscal_period_id,source_division_id,journal_number,
        journal_date,description,workflow_status,currency_code,exchange_rate,
        created_by_email,updated_by_email,submitted_by_email,approved_by_email,approved_at
      )
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'approved',$9,1,$10,$10,$10,$10,now())
      RETURNING journal_id`,[
        access.tenantId,orgId,type.transaction_type_id,period.fiscal_period_id,rootDivisionId,
        `EX-${String(index+1).padStart(3,'0')}`,period.start_date,
        `Example: ${type.type_name}`,'ZAR',access.auth.email
      ]);
    journalCount+=1;
    for(const [lineIndex,rule] of typeRules.entries()){
      const glAccount=glById.get(rule.default_gl_account_id)||rule;
      const family=rule.subledger_family_code||glAccount.required_subledger_family_code;
      const subledgerId=(rule.requires_subledger||glAccount.requires_subledger)&&family?subledgers[family]:null;
      await query(ctx,`INSERT INTO erp_journal_line(
          tenant_id,organisation_id,journal_id,line_number,division_id,gl_account_id,subledger_account_id,
          description,debit_amount,credit_amount,currency_code
        )
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ZAR')`,[
          access.tenantId,orgId,journal.rows[0].journal_id,lineIndex+1,rootDivisionId,rule.default_gl_account_id,subledgerId,
          rule.line_description||type.type_name,
          rule.debit_credit==='debit'?amount:0,
          rule.debit_credit==='credit'?amount:0
        ]);
      lineCount+=1;
    }
  }
  return {journals:journalCount,lines:lineCount};
}

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);

  const template=await query(ctx,`SELECT organisation_id
    FROM erp_organisation
    WHERE tenant_id=$1 AND workflow_status <> 'deleted' AND is_template=true
    ORDER BY CASE WHEN organisation_code='TEMPLATE' THEN 0 ELSE 1 END,organisation_name
    LIMIT 1`,[access.tenantId]);
  if(!template.rowCount)return ctx.send(404,{error:'Create the Template Organisation before creating example data'});
  const templateId=template.rows[0].organisation_id;
  let templateCounts;
  try{
    templateCounts=await validateTemplateSetup(ctx,access,templateId);
  }catch(error){
    return ctx.send(error.status||400,{error:error.message,counts:error.counts});
  }

  const deleted=await deleteExistingExample(ctx,access);
  const organisation=await createExampleOrganisation(ctx,access);
  const copied=await copyTemplateSetup(ctx,access,templateId,organisation.organisation_id);
  const rootDivisionId=await ensureExampleRootDivision(ctx,access,organisation.organisation_id);
  const fiscalYears=await ensureExampleFiscalYears(ctx,access,organisation.organisation_id);
  const periods=await query(ctx,`SELECT fiscal_period_id,start_date
    FROM erp_fiscal_period
    WHERE tenant_id=$1
      AND organisation_id=$2
      AND fiscal_year_id=ANY($3::uuid[])
      AND period_number=1
      AND status IN('open','soft_closed')
    ORDER BY start_date,period_number
    LIMIT 2`,[access.tenantId,organisation.organisation_id,fiscalYears.map(year=>year.fiscal_year_id)]);
  if(periods.rowCount<exampleFiscalYears.length)return ctx.send(400,{error:'Could not create the example fiscal periods'});

  const subledgers=await ensureSubledgers(ctx,access,organisation.organisation_id,rootDivisionId);
  const samples=await createSampleJournals(ctx,access,organisation.organisation_id,rootDivisionId,periods.rows,subledgers);

  return {
    ok:true,
    organisation,
    deleted,
    copied:copied?.copied||0,
    template_counts:templateCounts,
    fiscal_years:fiscalYears.length,
    fiscal_periods:fiscalYears.length*12,
    subledgers:Object.keys(subledgers).length,
    ...samples
  };
};
