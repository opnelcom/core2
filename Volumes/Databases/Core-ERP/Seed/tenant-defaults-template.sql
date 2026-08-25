-- Core ERP tenant default seed template.
-- This file is for visibility and manual review. It is not executed automatically
-- because tenant-scoped seed data needs runtime values.
--
-- Replace these placeholders before running manually:
--   :tenant_id
--   :admin_email
--
-- Runtime equivalent:
--   Volumes/Core-ERP/api/_shared/erp.js
--   ensureTenantSeed()
--   seedOrganisationDefaults()

BEGIN;

WITH org AS (
  INSERT INTO erp_organisation(
    tenant_id,
    organisation_code,
    organisation_name,
    is_template,
    base_currency_code,
    workflow_status,
    created_by_email,
    updated_by_email,
    approved_by_email,
    approved_at
  )
  VALUES(
    :tenant_id,
    'TEMPLATE',
    'Template Organisation',
    true,
    'ZAR',
    'approved',
    :admin_email,
    :admin_email,
    :admin_email,
    now()
  )
  ON CONFLICT DO NOTHING
  RETURNING organisation_id
),
existing_org AS (
  SELECT organisation_id FROM org
  UNION ALL
  SELECT organisation_id
  FROM erp_organisation
  WHERE tenant_id=:tenant_id
  AND organisation_code='TEMPLATE'
  LIMIT 1
),
root_division AS (
  INSERT INTO erp_division(
    tenant_id,
    organisation_id,
    parent_division_id,
    division_code,
    division_name,
    workflow_status,
    created_by_email,
    updated_by_email
  )
  SELECT
    :tenant_id,
    organisation_id,
    NULL,
    'ROOT',
    'Template Organisation',
    'approved',
    :admin_email,
    :admin_email
  FROM existing_org
  ON CONFLICT DO NOTHING
  RETURNING organisation_id, division_id
),
root AS (
  SELECT organisation_id, division_id FROM root_division
  UNION ALL
  SELECT organisation_id, division_id
  FROM erp_division
  WHERE tenant_id=:tenant_id
  AND organisation_id=(SELECT organisation_id FROM existing_org)
  AND parent_division_id IS NULL
  LIMIT 1
),
org_currencies AS (
  INSERT INTO erp_organisation_currency(
    tenant_id,
    organisation_id,
    currency_code,
    currency_name,
    decimal_places,
    is_seeded,
    is_active
  )
  SELECT
    :tenant_id,
    (SELECT organisation_id FROM existing_org),
    seed.currency_code,
    seed.currency_name,
    seed.decimal_places,
    true,
    true
  FROM (
    VALUES
      ('USD','US Dollar',2),
      ('GBP','Pound Sterling',2),
      ('EUR','Euro',2),
      ('ZAR','South African Rand',2)
  ) AS seed(currency_code,currency_name,decimal_places)
  ON CONFLICT(tenant_id,organisation_id,currency_code) DO UPDATE
  SET currency_name=excluded.currency_name,
      decimal_places=excluded.decimal_places,
      is_seeded=true,
      is_active=true,
      updated_at=now()
  RETURNING currency_code
),
org_ledger_families AS (
  INSERT INTO erp_organisation_ledger_family(
    tenant_id,
    organisation_id,
    ledger_family_code,
    family_name,
    requires_standard_account_type,
    is_seeded,
    is_active
  )
  SELECT
    :tenant_id,
    (SELECT organisation_id FROM existing_org),
    seed.ledger_family_code,
    seed.family_name,
    seed.requires_standard_account_type,
    true,
    true
  FROM (
    VALUES
      ('gl','General ledger',true),
      ('bank','Bank',false),
      ('customer','Customer',false),
      ('vendor','Vendor',false),
      ('employee','Employee',false),
      ('project','Project',false),
      ('contract','Contract',false),
      ('loan','Loan',false)
  ) AS seed(ledger_family_code,family_name,requires_standard_account_type)
  ON CONFLICT(tenant_id,organisation_id,ledger_family_code) DO UPDATE
  SET family_name=excluded.family_name,
      requires_standard_account_type=excluded.requires_standard_account_type,
      is_seeded=true,
      is_active=true,
      updated_at=now()
  RETURNING ledger_family_code
),
gl_types AS (
  INSERT INTO erp_ledger_account_type(
    tenant_id,
    organisation_id,
    ledger_family_code,
    account_type_code,
    account_type_name,
    is_required,
    is_seeded,
    is_active
  )
  SELECT
    :tenant_id,
    (SELECT organisation_id FROM existing_org),
    seed.ledger_family_code,
    seed.account_type_code,
    seed.account_type_name,
    seed.is_required,
    true,
    true
  FROM (
    VALUES
      ('gl','asset','Asset',true),
      ('gl','liability','Liability',true),
      ('gl','equity','Equity',true),
      ('gl','revenue','Revenue',true),
      ('gl','expense','Expense',true),
      ('bank','current_account','Current account',false),
      ('bank','savings_account','Savings account',false),
      ('bank','cash_account','Cash account',false),
      ('bank','credit_card','Credit card',false),
      ('customer','trade_customer','Trade customer',false),
      ('customer','cash_customer','Cash customer',false),
      ('customer','intercompany_customer','Intercompany customer',false),
      ('vendor','trade_vendor','Trade vendor',false),
      ('vendor','service_provider','Service provider',false),
      ('vendor','intercompany_vendor','Intercompany vendor',false),
      ('employee','permanent_employee','Permanent employee',false),
      ('employee','contractor','Contractor',false),
      ('project','capital_project','Capital project',false),
      ('project','operational_project','Operational project',false),
      ('contract','customer_contract','Customer contract',false),
      ('contract','supplier_contract','Supplier contract',false),
      ('loan','loan_account','Loan account',false),
      ('loan','intercompany_loan','Intercompany loan',false)
  ) AS seed(ledger_family_code,account_type_code,account_type_name,is_required)
  ON CONFLICT DO NOTHING
  RETURNING account_type_id, account_type_code
),
all_gl_types AS (
  SELECT account_type_id, account_type_code FROM gl_types
  UNION ALL
  SELECT account_type_id, account_type_code
  FROM erp_ledger_account_type
  WHERE tenant_id=:tenant_id
  AND organisation_id=(SELECT organisation_id FROM existing_org)
  AND ledger_family_code='gl'
)
INSERT INTO erp_ledger_account(
  tenant_id,
  organisation_id,
  owner_division_id,
  ledger_family_code,
  account_code,
  account_name,
  account_type_id,
  requires_subledger,
  required_subledger_family_code,
  workflow_status,
  created_by_email,
  updated_by_email,
  approved_by_email,
  approved_at
)
SELECT
  :tenant_id,
  root.organisation_id,
  root.division_id,
  'gl',
  account.account_code,
  account.account_name,
  account_type.account_type_id,
  account.requires_subledger,
  account.required_subledger_family_code,
  'approved',
  :admin_email,
  :admin_email,
  :admin_email,
  now()
FROM root
CROSS JOIN (
  VALUES
    ('1000','Cash','asset',true,'bank'),
    ('1010','Bank Clearing','asset',true,'bank'),
    ('1100','Accounts Receivable','asset',true,'customer'),
    ('1150','Customer Advances','liability',true,'customer'),
    ('1200','Inventory','asset',false,NULL),
    ('1300','Fixed Assets','asset',false,NULL),
    ('1350','Accumulated Depreciation','asset',false,NULL),
    ('2000','Accounts Payable','liability',true,'vendor'),
    ('2050','Accrued Expenses','liability',false,NULL),
    ('2100','VAT Output','liability',false,NULL),
    ('2200','VAT Input','asset',false,NULL),
    ('2250','VAT Control','liability',false,NULL),
    ('2300','Payroll Liability','liability',true,'employee'),
    ('2400','Tax Payable','liability',false,NULL),
    ('2500','Loan Payable','liability',false,NULL),
    ('3000','Owner Equity','equity',false,NULL),
    ('3100','Retained Earnings','equity',false,NULL),
    ('4000','Sales Revenue','revenue',false,NULL),
    ('4100','Other Income','revenue',false,NULL),
    ('5000','Cost of Sales','expense',false,NULL),
    ('5050','Inventory Adjustments','expense',false,NULL),
    ('5100','Bank Charges','expense',false,NULL),
    ('5200','Payroll Expense','expense',false,NULL),
    ('5300','Depreciation Expense','expense',false,NULL),
    ('5400','Tax Expense','expense',false,NULL),
    ('5500','Interest Expense','expense',false,NULL),
    ('5600','Purchase Expense','expense',false,NULL)
) AS account(account_code,account_name,account_type_code,requires_subledger,required_subledger_family_code)
JOIN all_gl_types account_type ON account_type.account_type_code=account.account_type_code
ON CONFLICT DO NOTHING;

INSERT INTO erp_transaction_group(
  tenant_id,
  organisation_id,
  group_code,
  group_name,
  sort_order,
  is_active
)
SELECT
  :tenant_id,
  organisation_id,
  group_code,
  group_name,
  sort_order,
  true
FROM erp_organisation
CROSS JOIN (
  VALUES
    ('sales','Sales',10),
    ('purchasing','Purchasing',20),
    ('banking','Banking',30),
    ('tax','Tax',40),
    ('payroll','Payroll',50),
    ('inventory','Inventory',60),
    ('assets','Assets',70),
    ('loans','Loans',80),
    ('intercompany','Intercompany',90),
    ('journal','Journals',100)
) AS seed(group_code,group_name,sort_order)
WHERE tenant_id=:tenant_id
AND organisation_code='TEMPLATE'
ON CONFLICT(tenant_id,organisation_id,group_code) DO UPDATE
SET group_name=excluded.group_name,
    sort_order=excluded.sort_order,
    is_active=true;

WITH template_org AS (
  SELECT organisation_id
  FROM erp_organisation
  WHERE tenant_id=:tenant_id
  AND organisation_code='TEMPLATE'
  LIMIT 1
)
INSERT INTO erp_transaction_type(
  tenant_id,
  organisation_id,
  transaction_group_id,
  type_code,
  type_name,
  type_description,
  sort_order,
  is_active
)
SELECT
  :tenant_id,
  template_org.organisation_id,
  group_row.transaction_group_id,
  seed.type_code,
  seed.type_name,
  seed.type_description,
  seed.sort_order,
  true
FROM template_org
JOIN (
  VALUES
    ('manual_journal','journal','Manual journal','General journal capture.',100),
    ('cash_sale','sales','Cash sale','Immediate sale settled through cash or bank.',110),
    ('customer_invoice','sales','Customer invoice','Sale on account through accounts receivable.',120),
    ('customer_payment','sales','Customer payment','Receipt from a customer subledger.',130),
    ('supplier_invoice','purchasing','Purchase on account','Supplier purchase through accounts payable.',210),
    ('supplier_payment','purchasing','Supplier payment','Payment to a vendor subledger.',220),
    ('bank_charge','banking','Bank charge','Bank fee or service charge.',310),
    ('bank_deposit','banking','Bank deposit','Non-customer bank deposit.',320),
    ('bank_withdrawal','banking','Bank withdrawal','Non-vendor bank withdrawal.',330),
    ('tax_accrual','tax','Tax accrual','Tax liability accrual.',410),
    ('tax_payment','tax','Tax payment','Payment against tax liability.',420),
    ('payroll_accrual','payroll','Payroll accrual','Payroll liability recognition.',510),
    ('payroll_payment','payroll','Payroll payment','Payroll settlement.',520),
    ('asset_purchase_cash','assets','Asset purchase cash','Asset bought and paid immediately.',710),
    ('asset_purchase_account','assets','Asset purchase on account','Asset bought through accounts payable.',720),
    ('depreciation','assets','Depreciation','Periodic depreciation posting.',730),
    ('loan_received','loans','Loan received','Loan funding received.',810),
    ('loan_repayment_principal','loans','Loan repayment principal','Principal repayment.',820),
    ('loan_interest_payment','loans','Loan interest payment','Interest repayment.',830)
) AS seed(type_code,group_code,type_name,type_description,sort_order) ON true
JOIN erp_transaction_group group_row
  ON group_row.tenant_id=:tenant_id
  AND group_row.organisation_id=template_org.organisation_id
  AND group_row.group_code=seed.group_code
ON CONFLICT(tenant_id,organisation_id,type_code) DO UPDATE
SET transaction_group_id=excluded.transaction_group_id,
    type_name=excluded.type_name,
    type_description=excluded.type_description,
    sort_order=excluded.sort_order,
    is_active=true;

WITH template_org AS (
  SELECT organisation_id
  FROM erp_organisation
  WHERE tenant_id=:tenant_id
  AND organisation_code='TEMPLATE'
  LIMIT 1
)
INSERT INTO erp_master_data_type(
  tenant_id,
  organisation_id,
  ledger_family_code,
  type_code,
  type_name,
  schema_json,
  ui_schema_json,
  schema_version,
  workflow_status
)
SELECT
  :tenant_id,
  organisation_id,
  'customer',
  'customer',
  'Customer',
  '{
    "type":"object",
    "properties":{
      "knownName":{"type":"string","title":"Known name","x-searchable":true,"x-reportable":true,"x-listView":true},
      "legalName":{"type":"string","title":"Legal name","x-searchable":true,"x-reportable":true,"x-listView":true},
      "registrationNumber":{"type":"string","title":"Registration number","x-searchable":true},
      "taxNumber":{"type":"string","title":"Tax number","x-searchable":true},
      "addressList":{"type":"array","title":"Addresses","items":{"type":"object"}},
      "directorList":{"type":"array","title":"Directors","items":{"type":"object"}},
      "creditLimits":{"type":"array","title":"Credit limits","items":{"type":"object"}},
      "contacts":{"type":"array","title":"Contacts","items":{"type":"object"}}
    },
    "required":["knownName","legalName"]
  }'::jsonb,
  '{"ui:order":["knownName","legalName","registrationNumber","taxNumber","addressList","directorList","creditLimits","contacts"]}'::jsonb,
  1,
  'approved'
FROM template_org
ON CONFLICT(tenant_id,organisation_id,type_code) DO NOTHING;

WITH template_org AS (
  SELECT organisation_id
  FROM erp_organisation
  WHERE tenant_id=:tenant_id
  AND organisation_code='TEMPLATE'
  LIMIT 1
)
INSERT INTO erp_role(
  tenant_id,
  organisation_id,
  role_code,
  role_name,
  is_admin,
  is_active
)
SELECT
  :tenant_id,
  organisation_id,
  'erp_admin',
  'ERP Administrator',
  true,
  true
FROM template_org
ON CONFLICT DO NOTHING;

COMMIT;
