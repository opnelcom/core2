'use strict';

const fs=require('fs');
const path=require('path');
const {ensureSchema}=require('./schema');
const {isAdministrator}=require('./access');

function contentRoot(){
  return process.env.CONTENT_ROOT||path.resolve(__dirname,'..','..','..');
}

function templateSeedPath(){
  return path.join(contentRoot(),'seeds','template-defaults.json');
}

function loadTemplateDefaults(){
  return JSON.parse(fs.readFileSync(templateSeedPath(),'utf8'));
}

async function ensureTenantSeed(ctx,access){
  await ensureSchema(ctx);
}

async function seedTaxTypes(ctx,access,organisationId,taxTypeSeeds){
  for(const taxType of taxTypeSeeds){
    const saved=await ctx.broker('core_erp','query',{
      text:`INSERT INTO erp_tax_type(tenant_id,organisation_id,tax_type_code,tax_type_description,tax_direction,is_active,is_seeded)
            VALUES($1,$2,$3,$4,$5,true,true)
            ON CONFLICT(tenant_id,organisation_id,tax_type_code) DO UPDATE
            SET tax_type_description=excluded.tax_type_description,
                tax_direction=excluded.tax_direction,
                is_active=true,
                is_seeded=true,
                updated_at=now()
            RETURNING tax_type_id`,
      values:[access.tenantId,organisationId,taxType.code,taxType.description,taxType.direction||'none']
    });
    const taxTypeId=saved.rows[0].tax_type_id;
    await ctx.broker('core_erp','query',{
      text:`INSERT INTO erp_tax_rate(tenant_id,organisation_id,tax_type_id,tax_rate,valid_from,valid_to,is_active,is_seeded)
            SELECT $1,$2,$3,tax_rate,valid_from,valid_to,true,true
            FROM jsonb_to_recordset($4::jsonb)
            AS row(tax_rate numeric,valid_from date,valid_to date)
            ON CONFLICT(tax_type_id,valid_from) DO UPDATE
            SET tax_rate=excluded.tax_rate,
                valid_to=excluded.valid_to,
                is_active=true,
                is_seeded=true,
                updated_at=now()`,
      values:[access.tenantId,organisationId,taxTypeId,JSON.stringify(taxType.rates.map(rate=>({tax_rate:rate.rate,valid_from:rate.valid_from,valid_to:rate.valid_to})))]
    });
  }
}

async function seedOrganisationDefaults(ctx,access,organisationId){
  const {
    currencies,
    taxTypeSeeds,
    countries,
    ledgerFamilies,
    ledgerFamilySchemas,
    accountingObjectTypeMetadata={},
    glAccountTypeSeeds,
    accountingObjectTypeSeeds,
    accountingDimensionTypeSeeds,
    ledgerTypeSeeds,
    chartTemplate,
    transactionGroups,
    transactionTypes,
    postingRuleSeeds,
    customerSchema,
    customerUiSchema,
    roleSeeds,
    roleModuleSeeds={},
    rolePermissionSeeds,
    moduleSeeds=[],
    moduleMappings={}
  }=loadTemplateDefaults();
  const org=await ctx.broker('core_erp','query',{
    text:`SELECT is_template FROM erp_organisation WHERE tenant_id=$1 AND organisation_id=$2 AND workflow_status <> 'deleted'`,
    values:[access.tenantId,organisationId]
  });
  if(!org.rows[0]?.is_template)return;
  await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_module(tenant_id,organisation_id,module_code,module_name,module_icon_svg,sort_order,is_seeded,is_active)
          SELECT $1,$2,module_code,module_name,module_icon_svg,sort_order,true,true
          FROM jsonb_to_recordset($3::jsonb) AS row(module_code text,module_name text,sort_order integer,module_icon_svg text)
          ON CONFLICT(tenant_id,organisation_id,module_code) DO UPDATE
          SET module_name=excluded.module_name,module_icon_svg=excluded.module_icon_svg,sort_order=excluded.sort_order,is_seeded=true,is_active=true,updated_at=now()`,
    values:[access.tenantId,organisationId,JSON.stringify(moduleSeeds.map(([module_code,module_name,sort_order,module_icon_svg=''])=>({module_code,module_name,sort_order,module_icon_svg})))]
  });
  await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_currency(tenant_id,organisation_id,currency_code,currency_name,decimal_places,is_seeded,is_active)
          SELECT $1,$2,currency_code,currency_name,decimal_places,true,true
          FROM jsonb_to_recordset($3::jsonb)
          AS row(currency_code text,currency_name text,decimal_places integer,is_seeded boolean)
          ON CONFLICT(tenant_id,organisation_id,currency_code) DO UPDATE
          SET currency_name=excluded.currency_name,
              decimal_places=excluded.decimal_places,
              is_seeded=true,
              is_active=true,
              updated_at=now()`,
    values:[access.tenantId,organisationId,JSON.stringify(currencies.map(([currency_code,currency_name,decimal_places,is_seeded])=>({currency_code,currency_name,decimal_places,is_seeded})))]
  });
  await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_country(tenant_id,organisation_id,country_code,alpha3_code,numeric_code,country_name,official_name,region,subregion,default_currency_code,calling_code,postal_code_required,administrative_level_label,is_seeded,is_active)
          SELECT $1,$2,country_code,alpha3_code,numeric_code,country_name,official_name,region,subregion,default_currency_code,calling_code,postal_code_required,administrative_level_label,true,true
          FROM jsonb_to_recordset($3::jsonb)
          AS row(country_code text,alpha3_code text,numeric_code text,country_name text,official_name text,region text,subregion text,default_currency_code text,calling_code text,postal_code_required boolean,administrative_level_label text)
          ON CONFLICT(tenant_id,organisation_id,country_code) DO UPDATE
          SET alpha3_code=excluded.alpha3_code,
              numeric_code=excluded.numeric_code,
              country_name=excluded.country_name,
              official_name=excluded.official_name,
              region=excluded.region,
              subregion=excluded.subregion,
              default_currency_code=excluded.default_currency_code,
              calling_code=excluded.calling_code,
              postal_code_required=excluded.postal_code_required,
              administrative_level_label=excluded.administrative_level_label,
              is_seeded=true,
              is_active=true,
              updated_at=now()`,
    values:[access.tenantId,organisationId,JSON.stringify(countries.map(([country_code,alpha3_code,numeric_code,country_name,official_name,region,subregion,default_currency_code,calling_code,postal_code_required,administrative_level_label])=>({country_code,alpha3_code,numeric_code,country_name,official_name,region,subregion,default_currency_code,calling_code,postal_code_required,administrative_level_label})))]
  });
  await seedTaxTypes(ctx,access,organisationId,taxTypeSeeds);
  await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_gl_account_type(tenant_id,organisation_id,type_code,type_name,is_required,is_seeded,is_active)
          SELECT $1,$2,type_code,type_name,is_required,true,true
          FROM jsonb_to_recordset($3::jsonb)
          AS row(type_code text,type_name text,is_required boolean)
          ON CONFLICT(tenant_id,organisation_id,type_code) DO UPDATE
          SET type_name=excluded.type_name,
              is_required=excluded.is_required,
              is_seeded=true,
              is_active=true,
              updated_at=now()`,
    values:[access.tenantId,organisationId,JSON.stringify(glAccountTypeSeeds.map(([type_code,type_name,is_required])=>({type_code,type_name,is_required})))]
  });
  await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_ledger_family(tenant_id,organisation_id,ledger_family_code,family_name,requires_standard_account_type,requires_legal_entity,schema_json,is_seeded,is_active)
          SELECT $1,$2,ledger_family_code,family_name,requires_standard_account_type,requires_legal_entity,schema_json,true,true
          FROM jsonb_to_recordset($3::jsonb)
          AS row(ledger_family_code text,family_name text,requires_standard_account_type boolean,requires_legal_entity boolean,schema_json jsonb)
          ON CONFLICT(tenant_id,organisation_id,ledger_family_code) DO UPDATE
          SET family_name=excluded.family_name,
              requires_standard_account_type=excluded.requires_standard_account_type,
              requires_legal_entity=excluded.requires_legal_entity,
              schema_json=CASE
                WHEN erp_ledger_family.schema_json IS NULL OR erp_ledger_family.schema_json='{}'::jsonb
                THEN excluded.schema_json
                ELSE erp_ledger_family.schema_json
              END,
              is_seeded=true,
              is_active=true,
              updated_at=now()`,
    values:[access.tenantId,organisationId,JSON.stringify(ledgerFamilies.map(([ledger_family_code,family_name,requires_standard_account_type,requires_legal_entity])=>({ledger_family_code,family_name,requires_standard_account_type,requires_legal_entity,schema_json:ledgerFamilySchemas[ledger_family_code]||{}})))]
  });
  await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_subledger_account_type(tenant_id,organisation_id,type_code,type_name,requires_legal_entity,schema_json,is_seeded,is_active)
          SELECT $1,$2,ledger_family_code,family_name,requires_legal_entity,schema_json,true,true
          FROM jsonb_to_recordset($3::jsonb)
          AS row(ledger_family_code text,family_name text,requires_standard_account_type boolean,requires_legal_entity boolean,schema_json jsonb)
          ON CONFLICT(tenant_id,organisation_id,type_code) DO UPDATE
          SET type_name=excluded.type_name,
              requires_legal_entity=excluded.requires_legal_entity,
              schema_json=excluded.schema_json,
              is_seeded=true,
              is_active=true,
              updated_at=now()`,
    values:[access.tenantId,organisationId,JSON.stringify(ledgerFamilies.map(([ledger_family_code,family_name,requires_standard_account_type,requires_legal_entity])=>({ledger_family_code,family_name,requires_standard_account_type,requires_legal_entity,schema_json:ledgerFamilySchemas[ledger_family_code]||{}})))]
  });
  await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_accounting_object_type(tenant_id,organisation_id,type_code,type_name,schema_json,ui_schema_json,is_seeded,is_active)
          SELECT $1,$2,type_code,type_name,schema_json,ui_schema_json,true,true
          FROM jsonb_to_recordset($3::jsonb)
          AS row(type_code text,type_name text,schema_json jsonb,ui_schema_json jsonb)
          ON CONFLICT(tenant_id,organisation_id,type_code) DO UPDATE
          SET type_name=excluded.type_name,
              schema_json=excluded.schema_json,
              ui_schema_json=excluded.ui_schema_json,
              is_seeded=true,
              is_active=true,
              updated_at=now()`,
    values:[access.tenantId,organisationId,JSON.stringify(accountingObjectTypeSeeds.map(([type_code,type_name])=>({
      type_code,
      type_name,
      schema_json:accountingObjectTypeMetadata[type_code]?.schema_json||{type:'object',properties:{},required:[],additionalProperties:false},
      ui_schema_json:accountingObjectTypeMetadata[type_code]?.ui_schema_json||{sections:[]}
    })))]
  });
  await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_accounting_dimension_type(tenant_id,organisation_id,type_code,type_name,schema_json,ui_schema_json,is_seeded,is_active)
          SELECT $1,$2,type_code,type_name,'{}'::jsonb,'{}'::jsonb,true,true
          FROM jsonb_to_recordset($3::jsonb)
          AS row(type_code text,type_name text)
          ON CONFLICT(tenant_id,organisation_id,type_code) DO UPDATE
          SET type_name=excluded.type_name,
              is_seeded=true,
              is_active=true,
              updated_at=now()`,
    values:[access.tenantId,organisationId,JSON.stringify(accountingDimensionTypeSeeds.map(([type_code,type_name])=>({type_code,type_name})))]
  });
  await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_ledger_account_type(tenant_id,organisation_id,ledger_family_code,account_type_code,account_type_name,is_required,is_seeded,is_active)
          SELECT $1,$2,'gl',type_code,type_name,is_required,true,true
          FROM jsonb_to_recordset($3::jsonb)
          AS row(type_code text,type_name text,is_required boolean)
          ON CONFLICT DO NOTHING`,
    values:[access.tenantId,organisationId,JSON.stringify(glAccountTypeSeeds.map(([type_code,type_name,is_required])=>({type_code,type_name,is_required})))]
  });
  await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_ledger_account_type(tenant_id,organisation_id,ledger_family_code,account_type_code,account_type_name,is_required,is_seeded,is_active)
          SELECT $1,$2,ledger_family_code,account_type_code,account_type_name,is_required,true,true
          FROM jsonb_to_recordset($3::jsonb)
          AS row(ledger_family_code text,account_type_code text,account_type_name text,is_required boolean)
          ON CONFLICT DO NOTHING`,
    values:[access.tenantId,organisationId,JSON.stringify(ledgerTypeSeeds.map(([ledger_family_code,account_type_code,account_type_name,is_required])=>({ledger_family_code,account_type_code,account_type_name,is_required})))]
  });
  await ctx.broker('core_erp','query',{
    text:`WITH root AS (
            SELECT division_id FROM erp_division WHERE tenant_id=$1 AND organisation_id=$2 AND parent_division_id IS NULL ORDER BY created_at LIMIT 1
          ),
          type_rows AS (
            SELECT account_type_id,account_type_code FROM erp_ledger_account_type WHERE tenant_id=$1 AND organisation_id=$2 AND ledger_family_code='gl'
          ),
          payload AS (
            SELECT * FROM jsonb_to_recordset($3::jsonb)
            AS row(account_code text,account_name text,account_type_code text,requires_subledger boolean,required_subledger_family_code text)
          )
          INSERT INTO erp_ledger_account(tenant_id,organisation_id,owner_division_id,ledger_family_code,account_code,account_name,account_type_id,requires_subledger,required_subledger_family_code,workflow_status,created_by_email,updated_by_email,approved_by_email,approved_at)
          SELECT $1,$2,root.division_id,'gl',p.account_code,p.account_name,t.account_type_id,p.requires_subledger,p.required_subledger_family_code,'approved',$4,$4,$4,now()
          FROM payload p CROSS JOIN root JOIN type_rows t ON t.account_type_code=p.account_type_code
          ON CONFLICT DO NOTHING`,
    values:[access.tenantId,organisationId,JSON.stringify(chartTemplate.map(([account_code,account_name,account_type_code,requires_subledger,required_subledger_family_code])=>({account_code,account_name,account_type_code,requires_subledger,required_subledger_family_code}))),access.auth.email]
  });
  await ctx.broker('core_erp','query',{
    text:`WITH root AS (
            SELECT division_id FROM erp_division WHERE tenant_id=$1 AND organisation_id=$2 AND parent_division_id IS NULL ORDER BY created_at LIMIT 1
          ),
          type_rows AS (
            SELECT gl_account_type_id,type_code FROM erp_gl_account_type WHERE tenant_id=$1 AND organisation_id=$2
          ),
          payload AS (
            SELECT * FROM jsonb_to_recordset($3::jsonb)
            AS row(account_code text,account_name text,account_type_code text,requires_subledger boolean,required_subledger_type_code text)
          )
          INSERT INTO erp_gl_account(tenant_id,organisation_id,owner_division_id,account_code,account_name,gl_account_type_id,requires_subledger,required_subledger_type_code,workflow_status,created_by_email,updated_by_email,approved_by_email,approved_at)
          SELECT $1,$2,root.division_id,p.account_code,p.account_name,t.gl_account_type_id,p.requires_subledger,p.required_subledger_type_code,'approved',$4,$4,$4,now()
          FROM payload p CROSS JOIN root JOIN type_rows t ON t.type_code=p.account_type_code
          ON CONFLICT(tenant_id,organisation_id,account_code) DO UPDATE
          SET account_name=excluded.account_name,
              gl_account_type_id=excluded.gl_account_type_id,
              requires_subledger=excluded.requires_subledger,
              required_subledger_type_code=excluded.required_subledger_type_code,
              workflow_status='approved',
              updated_by_email=$4,
              updated_at=now()`,
    values:[access.tenantId,organisationId,JSON.stringify(chartTemplate.map(([account_code,account_name,account_type_code,requires_subledger,required_subledger_type_code])=>({account_code,account_name,account_type_code,requires_subledger,required_subledger_type_code}))),access.auth.email]
  });
  await ctx.broker('core_erp','query',{
    text:`UPDATE erp_ledger_account
          SET requires_subledger=true,
              required_subledger_family_code='cash_point',
              updated_by_email=$3,
              updated_at=now()
          WHERE tenant_id=$1
            AND organisation_id=$2
            AND ledger_family_code='gl'
            AND account_code='1000'
            AND workflow_status <> 'deleted'`,
    values:[access.tenantId,organisationId,access.auth.email]
  });
  await seedFinancialStatementFormats(ctx,access,organisationId);
  await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_transaction_group(tenant_id,organisation_id,group_code,group_name,sort_order,is_active)
          SELECT $1,$2,group_code,group_name,sort_order,true
          FROM jsonb_to_recordset($3::jsonb) AS row(group_code text,group_name text,sort_order integer)
          ON CONFLICT(tenant_id,organisation_id,group_code) DO UPDATE
          SET group_name=excluded.group_name,sort_order=excluded.sort_order,is_active=true`,
    values:[access.tenantId,organisationId,JSON.stringify(transactionGroups.map(([group_code,group_name,sort_order])=>({group_code,group_name,sort_order})))]
  });
  await ctx.broker('core_erp','query',{
    text:`WITH payload AS (
            SELECT * FROM jsonb_to_recordset($3::jsonb)
            AS row(type_code text,group_code text,type_name text,type_description text,sort_order integer)
          )
          INSERT INTO erp_transaction_type(tenant_id,organisation_id,transaction_group_id,type_code,type_name,type_description,is_financial,allow_additional_lines,sort_order,is_active)
          SELECT $1,$2,g.transaction_group_id,p.type_code,p.type_name,p.type_description,true,true,p.sort_order,true
          FROM payload p JOIN erp_transaction_group g ON g.tenant_id=$1 AND g.organisation_id=$2 AND g.group_code=p.group_code
          ON CONFLICT(tenant_id,organisation_id,type_code) DO UPDATE
          SET transaction_group_id=excluded.transaction_group_id,type_name=excluded.type_name,type_description=excluded.type_description,is_financial=true,allow_additional_lines=true,sort_order=excluded.sort_order,is_active=true`,
    values:[access.tenantId,organisationId,JSON.stringify(transactionTypes.map(([type_code,group_code,type_name,type_description,sort_order])=>({type_code,group_code,type_name,type_description,sort_order})))]
  });
  const mappingRows=(mapping)=>Object.entries(mapping||{}).flatMap(([object_code,moduleCodes])=>moduleCodes.map(module_code=>({object_code,module_code})));
  await ctx.broker('core_erp','query',{
    text:`WITH payload AS (SELECT * FROM jsonb_to_recordset($3::jsonb) AS row(object_code text,module_code text))
          INSERT INTO erp_ledger_family_module(tenant_id,organisation_id,ledger_family_code,module_id)
          SELECT $1,$2,p.object_code,m.module_id FROM payload p
          JOIN erp_module m ON m.tenant_id=$1 AND m.organisation_id=$2 AND m.module_code=p.module_code
          JOIN erp_ledger_family f ON f.tenant_id=$1 AND f.organisation_id=$2 AND f.ledger_family_code=p.object_code
          ON CONFLICT DO NOTHING`,
    values:[access.tenantId,organisationId,JSON.stringify(mappingRows(moduleMappings.ledgerFamilies))]
  });
  await ctx.broker('core_erp','query',{
    text:`WITH payload AS (SELECT * FROM jsonb_to_recordset($3::jsonb) AS row(object_code text,module_code text))
          INSERT INTO erp_accounting_object_type_module(accounting_object_type_id,module_id)
          SELECT t.accounting_object_type_id,m.module_id FROM payload p
          JOIN erp_module m ON m.tenant_id=$1 AND m.organisation_id=$2 AND m.module_code=p.module_code
          JOIN erp_accounting_object_type t ON t.tenant_id=$1 AND t.organisation_id=$2 AND t.type_code=p.object_code
          ON CONFLICT DO NOTHING`,
    values:[access.tenantId,organisationId,JSON.stringify(mappingRows(moduleMappings.accountingObjectTypes))]
  });
  await ctx.broker('core_erp','query',{
    text:`WITH payload AS (SELECT * FROM jsonb_to_recordset($3::jsonb) AS row(object_code text,module_code text))
          INSERT INTO erp_accounting_dimension_type_module(accounting_dimension_type_id,module_id)
          SELECT t.accounting_dimension_type_id,m.module_id FROM payload p
          JOIN erp_module m ON m.tenant_id=$1 AND m.organisation_id=$2 AND m.module_code=p.module_code
          JOIN erp_accounting_dimension_type t ON t.tenant_id=$1 AND t.organisation_id=$2 AND t.type_code=p.object_code
          ON CONFLICT DO NOTHING`,
    values:[access.tenantId,organisationId,JSON.stringify(mappingRows(moduleMappings.accountingDimensionTypes))]
  });
  const transactionModuleRows=transactionTypes.flatMap(([type_code,group_code])=>[...new Set([...(moduleMappings.transactionGroups?.[group_code]||[]),...(moduleMappings.transactionTypeAdditions?.[type_code]||[])])].map(module_code=>({object_code:type_code,module_code})));
  await ctx.broker('core_erp','query',{
    text:`WITH payload AS (SELECT * FROM jsonb_to_recordset($3::jsonb) AS row(object_code text,module_code text))
          INSERT INTO erp_transaction_type_module(transaction_type_id,module_id)
          SELECT t.transaction_type_id,m.module_id FROM payload p
          JOIN erp_module m ON m.tenant_id=$1 AND m.organisation_id=$2 AND m.module_code=p.module_code
          JOIN erp_transaction_type t ON t.tenant_id=$1 AND t.organisation_id=$2 AND t.type_code=p.object_code
          ON CONFLICT DO NOTHING`,
    values:[access.tenantId,organisationId,JSON.stringify(transactionModuleRows)]
  });
  await ctx.broker('core_erp','query',{
    text:`WITH payload AS (
            SELECT * FROM jsonb_to_recordset($3::jsonb)
            AS row(type_code text,line_order integer,debit_credit text,account_code text,requires_subledger boolean,subledger_family_code text,line_description text)
          ),
          types AS (
            SELECT transaction_type_id,type_code
            FROM erp_transaction_type
            WHERE tenant_id=$1 AND organisation_id=$2
          ),
          accounts AS (
            SELECT ledger_account_id,account_code
            FROM erp_ledger_account
            WHERE tenant_id=$1 AND organisation_id=$2 AND ledger_family_code='gl' AND workflow_status <> 'deleted'
          )
          INSERT INTO erp_posting_rule(tenant_id,organisation_id,transaction_type_id,line_order,debit_credit,default_gl_account_id,requires_subledger,subledger_family_code,amount_source,line_description,is_required)
          SELECT $1,$2,t.transaction_type_id,p.line_order,p.debit_credit,a.ledger_account_id,p.requires_subledger,p.subledger_family_code,'manual',p.line_description,true
          FROM payload p
          JOIN types t ON t.type_code=p.type_code
          JOIN accounts a ON a.account_code=p.account_code
          ON CONFLICT(transaction_type_id,line_order) DO UPDATE
          SET debit_credit=excluded.debit_credit,
              default_gl_account_id=excluded.default_gl_account_id,
              requires_subledger=excluded.requires_subledger,
              subledger_family_code=excluded.subledger_family_code,
              amount_source=excluded.amount_source,
              line_description=excluded.line_description,
              is_required=excluded.is_required`,
    values:[access.tenantId,organisationId,JSON.stringify(postingRuleSeeds.map(([type_code,line_order,debit_credit,account_code,requires_subledger,subledger_family_code,line_description])=>({type_code,line_order,debit_credit,account_code,requires_subledger,subledger_family_code,line_description})))]
  });
  await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_master_data_type(tenant_id,organisation_id,ledger_family_code,type_code,type_name,schema_json,ui_schema_json,schema_version,workflow_status)
          VALUES($1,$2,'customer','customer','Customer',$3::jsonb,$4::jsonb,1,'approved')
          ON CONFLICT(tenant_id,organisation_id,type_code) DO NOTHING`,
    values:[access.tenantId,organisationId,JSON.stringify(customerSchema),JSON.stringify(customerUiSchema)]
  });
  await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_role(tenant_id,organisation_id,role_code,role_name,role_description,is_admin,is_active)
          SELECT $1,$2,role_code,role_name,role_description,is_admin,true
          FROM jsonb_to_recordset($3::jsonb)
          AS row(role_code text,role_name text,role_description text,is_admin boolean)
          ON CONFLICT(tenant_id,organisation_id,role_code) DO UPDATE
          SET role_name=excluded.role_name,
              role_description=excluded.role_description,
              is_admin=excluded.is_admin,
              is_active=true`,
    values:[access.tenantId,organisationId,JSON.stringify(roleSeeds.map(([role_code,role_name,role_description,is_admin])=>({role_code,role_name,role_description,is_admin})))]
  });
  await ctx.broker('core_erp','query',{
    text:`WITH root AS (
            SELECT division_id
            FROM erp_division
            WHERE tenant_id=$1 AND organisation_id=$2 AND parent_division_id IS NULL AND workflow_status <> 'deleted'
            ORDER BY created_at
            LIMIT 1
          ),
          payload AS (
            SELECT *
            FROM jsonb_to_recordset($3::jsonb)
            AS row(role_code text,resource_kind text,resource_code text,workflow_status text)
          ),
          expanded AS (
            SELECT p.role_code,p.resource_kind,p.resource_code,p.workflow_status
            FROM payload p
            WHERE p.resource_kind='master_data' OR p.resource_code='*'
            UNION ALL
            SELECT p.role_code,p.resource_kind,tt.transaction_type_id::text,p.workflow_status
            FROM payload p
            JOIN erp_transaction_group tg ON tg.tenant_id=$1 AND tg.organisation_id=$2 AND tg.group_code=p.resource_code
            JOIN erp_transaction_type tt ON tt.transaction_group_id=tg.transaction_group_id
            WHERE p.resource_kind='transaction' AND p.resource_code <> '*'
          )
          INSERT INTO erp_role_permission(tenant_id,organisation_id,role_id,division_id,resource_kind,resource_code,workflow_status,action_code,applies_to_children)
          SELECT $1,$2,r.role_id,root.division_id,e.resource_kind,e.resource_code,e.workflow_status,
                 CASE WHEN e.workflow_status='view' THEN 'view' ELSE 'manage' END,
                 true
          FROM expanded e
          JOIN erp_role r ON r.tenant_id=$1 AND r.organisation_id=$2 AND r.role_code=e.role_code
          CROSS JOIN root
          WHERE NOT EXISTS (
            SELECT 1
            FROM erp_role_permission existing
            WHERE existing.tenant_id=$1
              AND existing.organisation_id=$2
              AND existing.role_id=r.role_id
              AND existing.division_id=root.division_id
              AND existing.resource_kind=e.resource_kind
              AND existing.resource_code=e.resource_code
              AND existing.workflow_status=e.workflow_status
              AND existing.action_code=CASE WHEN e.workflow_status='view' THEN 'view' ELSE 'manage' END
          )`,
    values:[access.tenantId,organisationId,JSON.stringify(rolePermissionSeeds.map(([role_code,resource_kind,resource_code,workflow_status])=>({role_code,resource_kind,resource_code,workflow_status})))]
  });
  await ctx.broker('core_erp','query',{
    text:`WITH requested AS (
            SELECT role_code,module_code FROM jsonb_to_recordset($3::jsonb) AS row(role_code text,module_code text)
          ), role_modules AS (
            SELECT r.role_id,m.module_id FROM requested requested_role
            JOIN erp_role r ON r.tenant_id=$1 AND r.organisation_id=$2 AND r.role_code=requested_role.role_code
            JOIN erp_module m ON m.tenant_id=$1 AND m.organisation_id=$2 AND (requested_role.module_code='*' OR m.module_code=requested_role.module_code)
            UNION
            SELECT rp.role_id,fm.module_id FROM erp_role_permission rp
            JOIN erp_ledger_family_module fm ON fm.tenant_id=rp.tenant_id AND fm.organisation_id=rp.organisation_id AND (rp.resource_code='*' OR fm.ledger_family_code=rp.resource_code)
            WHERE rp.tenant_id=$1 AND rp.organisation_id=$2 AND rp.resource_kind='master_data'
            UNION
            SELECT rp.role_id,tm.module_id FROM erp_role_permission rp
            JOIN erp_transaction_type_module tm ON rp.resource_code='*' OR tm.transaction_type_id::text=rp.resource_code
            WHERE rp.tenant_id=$1 AND rp.organisation_id=$2 AND rp.resource_kind='transaction'
          )
          INSERT INTO erp_role_module(role_id,module_id) SELECT DISTINCT role_id,module_id FROM role_modules ON CONFLICT DO NOTHING`,
    values:[access.tenantId,organisationId,JSON.stringify(Object.entries(roleModuleSeeds).flatMap(([role_code,moduleCodes])=>moduleCodes.map(module_code=>({role_code,module_code}))))]
  });
  if(isAdministrator(access)){
    await ctx.broker('core_erp','query',{
      text:`WITH existing_admin_user AS (
              SELECT 1
              FROM erp_user_role ur
              JOIN erp_role role ON role.role_id=ur.role_id
              WHERE ur.tenant_id=$1
                AND ur.organisation_id=$2
                AND role.is_admin=true
                AND role.is_active=true
                AND ur.valid_from <= CURRENT_DATE
                AND (ur.valid_to IS NULL OR ur.valid_to >= CURRENT_DATE)
              LIMIT 1
            ),
            admin_role AS (
              SELECT role_id
              FROM erp_role
              WHERE tenant_id=$1
                AND organisation_id=$2
                AND role_code='erp_admin'
              LIMIT 1
            )
            INSERT INTO erp_user_role(tenant_id,organisation_id,role_id,email,valid_from,valid_to)
            SELECT $1,$2,admin_role.role_id,lower($3),CURRENT_DATE,NULL
            FROM admin_role
            WHERE NOT EXISTS (SELECT 1 FROM existing_admin_user)
            ON CONFLICT(tenant_id,organisation_id,role_id,email) DO UPDATE
            SET valid_from=LEAST(erp_user_role.valid_from,excluded.valid_from),
                valid_to=NULL`,
      values:[access.tenantId,organisationId,access.auth.email]
  });
}
}

async function seedFinancialStatementFormats(ctx,access,organisationId){
  const {financialStatementFormatSeeds}=loadTemplateDefaults();
  for(const format of financialStatementFormatSeeds){
    const saved=await ctx.broker('core_erp','query',{
      text:`INSERT INTO erp_financial_statement_format(tenant_id,organisation_id,format_code,format_name,statement_type,is_active,is_seeded)
            VALUES($1,$2,$3,$4,$5,true,true)
            ON CONFLICT(tenant_id,organisation_id,format_code) DO UPDATE
            SET format_name=excluded.format_name,
                statement_type=excluded.statement_type,
                is_active=true,
                is_seeded=true,
                updated_at=now()
            RETURNING financial_statement_format_id`,
      values:[access.tenantId,organisationId,format.code,format.name,format.statementType]
    });
    const formatId=saved.rows[0].financial_statement_format_id;
    await ctx.broker('core_erp','query',{
      text:`DELETE FROM erp_financial_statement_line_account WHERE tenant_id=$1 AND organisation_id=$2 AND financial_statement_format_id=$3`,
      values:[access.tenantId,organisationId,formatId]
    });
    await ctx.broker('core_erp','query',{
      text:`DELETE FROM erp_financial_statement_line WHERE tenant_id=$1 AND organisation_id=$2 AND financial_statement_format_id=$3`,
      values:[access.tenantId,organisationId,formatId]
    });
    const lineIds=new Map();
    for(const [lineCode,lineLabel,lineType,parentCode,sortOrder,options={}] of format.lines){
      const parentId=parentCode?lineIds.get(parentCode):null;
      const line=await ctx.broker('core_erp','query',{
        text:`INSERT INTO erp_financial_statement_line(tenant_id,organisation_id,financial_statement_format_id,parent_line_id,line_code,line_label,line_type,sort_order,sign_multiplier,formula_json,is_active)
              VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,true)
              RETURNING financial_statement_line_id`,
        values:[access.tenantId,organisationId,formatId,parentId,lineCode,lineLabel,lineType,sortOrder,options.sign_multiplier||1,JSON.stringify(options.formula||{})]
      });
      const lineId=line.rows[0].financial_statement_line_id;
      lineIds.set(lineCode,lineId);
      if(Array.isArray(options.accounts)&&options.accounts.length){
        await ctx.broker('core_erp','query',{
          text:`INSERT INTO erp_financial_statement_line_account(tenant_id,organisation_id,financial_statement_format_id,financial_statement_line_id,ledger_account_id)
                SELECT $1,$2,$3,$4,ledger_account_id
                FROM erp_ledger_account
                WHERE tenant_id=$1
                  AND organisation_id=$2
                  AND ledger_family_code='gl'
                  AND account_code=ANY($5::text[])
                  AND workflow_status <> 'deleted'
                ON CONFLICT(tenant_id,organisation_id,financial_statement_format_id,ledger_account_id) DO NOTHING`,
          values:[access.tenantId,organisationId,formatId,lineId,options.accounts]
        });
      }
    }
  }
}

module.exports={ensureTenantSeed,seedOrganisationDefaults,seedFinancialStatementFormats,templateSeedPath};
