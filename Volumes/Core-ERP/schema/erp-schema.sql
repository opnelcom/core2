SELECT pg_advisory_xact_lock(hashtext('erp_schema'));
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    DO $$
    BEGIN
      IF to_regclass('public.erp_currency') IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='erp_currency' AND column_name='organisation_id'
         ) THEN
        DROP TABLE erp_currency CASCADE;
      END IF;
      IF to_regclass('public.erp_country') IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='erp_country' AND column_name='organisation_id'
         ) THEN
        DROP TABLE erp_country CASCADE;
      END IF;
      IF to_regclass('public.erp_ledger_family') IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='erp_ledger_family' AND column_name='organisation_id'
         ) THEN
        DROP TABLE erp_ledger_family CASCADE;
      END IF;
      IF to_regclass('public.erp_organisation_currency') IS NOT NULL
         AND to_regclass('public.erp_currency') IS NULL THEN
        ALTER TABLE erp_organisation_currency RENAME TO erp_currency;
      END IF;
      IF to_regclass('public.erp_organisation_country') IS NOT NULL
         AND to_regclass('public.erp_country') IS NULL THEN
        ALTER TABLE erp_organisation_country RENAME TO erp_country;
      END IF;
      IF to_regclass('public.erp_organisation_ledger_family') IS NOT NULL
         AND to_regclass('public.erp_ledger_family') IS NULL THEN
        ALTER TABLE erp_organisation_ledger_family RENAME TO erp_ledger_family;
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS erp_organisation(
      organisation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_code text NOT NULL,
      organisation_name text NOT NULL,
      is_template boolean NOT NULL DEFAULT false,
      base_currency_code text NOT NULL DEFAULT 'ZAR',
      workflow_status text NOT NULL DEFAULT 'draft' CHECK(workflow_status IN('draft','submitted','approved','rejected','blocked','archived','deleted')),
      effective_from date NOT NULL DEFAULT CURRENT_DATE,
      effective_to date,
      additional_data jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_by_email text,
      updated_by_email text,
      approved_by_email text,
      approved_at timestamptz,
      archived_at timestamptz,
      deleted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS erp_organisation_live_code_idx ON erp_organisation(tenant_id,organisation_code) WHERE workflow_status <> 'deleted';

    CREATE TABLE IF NOT EXISTS erp_division(
      division_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      parent_division_id uuid REFERENCES erp_division(division_id),
      division_code text NOT NULL,
      division_name text NOT NULL,
      workflow_status text NOT NULL DEFAULT 'draft' CHECK(workflow_status IN('draft','submitted','approved','rejected','blocked','archived','deleted')),
      effective_from date NOT NULL DEFAULT CURRENT_DATE,
      effective_to date,
      created_by_email text,
      updated_by_email text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS erp_division_live_code_idx ON erp_division(tenant_id,organisation_id,division_code) WHERE workflow_status <> 'deleted';
    CREATE INDEX IF NOT EXISTS erp_division_parent_idx ON erp_division(tenant_id,organisation_id,parent_division_id,division_name);

    CREATE TABLE IF NOT EXISTS erp_legal_entity(
      legal_entity_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      entity_type text NOT NULL DEFAULT 'company',
      legal_name text NOT NULL,
      known_name text NOT NULL,
      workflow_status text NOT NULL DEFAULT 'draft' CHECK(workflow_status IN('draft','submitted','approved','rejected','blocked','archived','deleted')),
      effective_from date NOT NULL DEFAULT CURRENT_DATE,
      effective_to date,
      additional_data jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_by_email text,
      updated_by_email text,
      approved_by_email text,
      approved_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS erp_legal_entity_live_known_name_idx ON erp_legal_entity(tenant_id,organisation_id,lower(known_name)) WHERE workflow_status <> 'deleted';
    CREATE INDEX IF NOT EXISTS erp_legal_entity_lookup_idx ON erp_legal_entity(tenant_id,organisation_id,workflow_status,known_name);

    CREATE TABLE IF NOT EXISTS erp_legal_entity_identification(
      identification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      legal_entity_id uuid NOT NULL REFERENCES erp_legal_entity(legal_entity_id) ON DELETE CASCADE,
      identification_type text NOT NULL,
      identification_number text NOT NULL,
      issuing_authority text,
      country_code text,
      valid_from date NOT NULL DEFAULT CURRENT_DATE,
      valid_to date,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS erp_legal_entity_identification_lookup_idx ON erp_legal_entity_identification(tenant_id,organisation_id,legal_entity_id,identification_type,valid_from,valid_to);
    CREATE UNIQUE INDEX IF NOT EXISTS erp_legal_entity_identification_period_idx ON erp_legal_entity_identification(tenant_id,organisation_id,legal_entity_id,identification_type,valid_from) WHERE is_active=true;

    CREATE TABLE IF NOT EXISTS erp_legal_entity_address(
      address_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      legal_entity_id uuid NOT NULL REFERENCES erp_legal_entity(legal_entity_id) ON DELETE CASCADE,
      address_type text NOT NULL,
      address_line1 text NOT NULL,
      address_line2 text,
      city text,
      region text,
      postal_code text,
      country_code text,
      valid_from date NOT NULL DEFAULT CURRENT_DATE,
      valid_to date,
      is_primary boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS erp_legal_entity_address_lookup_idx ON erp_legal_entity_address(tenant_id,organisation_id,legal_entity_id,address_type,is_primary);

    CREATE TABLE IF NOT EXISTS erp_legal_entity_relationship(
      relationship_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      from_legal_entity_id uuid NOT NULL REFERENCES erp_legal_entity(legal_entity_id) ON DELETE CASCADE,
      to_legal_entity_id uuid NOT NULL REFERENCES erp_legal_entity(legal_entity_id) ON DELETE CASCADE,
      relationship_type text NOT NULL,
      role_title text,
      ownership_percentage numeric(9,4),
      valid_from date NOT NULL DEFAULT CURRENT_DATE,
      valid_to date,
      is_primary boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK(from_legal_entity_id <> to_legal_entity_id)
    );
    CREATE INDEX IF NOT EXISTS erp_legal_entity_relationship_from_idx ON erp_legal_entity_relationship(tenant_id,organisation_id,from_legal_entity_id,relationship_type);
    CREATE INDEX IF NOT EXISTS erp_legal_entity_relationship_to_idx ON erp_legal_entity_relationship(tenant_id,organisation_id,to_legal_entity_id,relationship_type);

    CREATE TABLE IF NOT EXISTS erp_fiscal_year(
      fiscal_year_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      fiscal_year_code text NOT NULL,
      start_date date NOT NULL,
      end_date date NOT NULL,
      status text NOT NULL DEFAULT 'open' CHECK(status IN('open','soft_closed','closed','locked')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id,organisation_id,fiscal_year_code)
    );

    CREATE TABLE IF NOT EXISTS erp_fiscal_period(
      fiscal_period_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      fiscal_year_id uuid NOT NULL REFERENCES erp_fiscal_year(fiscal_year_id) ON DELETE CASCADE,
      period_number integer NOT NULL,
      period_code text NOT NULL,
      start_date date NOT NULL,
      end_date date NOT NULL,
      status text NOT NULL DEFAULT 'open' CHECK(status IN('open','soft_closed','closed','locked')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id,organisation_id,fiscal_year_id,period_number)
    );

    CREATE TABLE IF NOT EXISTS erp_currency(
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      currency_code text NOT NULL,
      currency_name text NOT NULL,
      decimal_places integer NOT NULL DEFAULT 2,
      is_active boolean NOT NULL DEFAULT true,
      is_seeded boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(tenant_id,organisation_id,currency_code)
    );

    CREATE TABLE IF NOT EXISTS erp_country(
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      country_code text NOT NULL,
      country_name text NOT NULL,
      official_name text,
      alpha3_code text,
      numeric_code text,
      region text,
      subregion text,
      default_currency_code text,
      calling_code text,
      postal_code_required boolean NOT NULL DEFAULT false,
      administrative_level_label text,
      is_active boolean NOT NULL DEFAULT true,
      is_seeded boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(tenant_id,organisation_id,country_code)
    );

    CREATE TABLE IF NOT EXISTS erp_ledger_family(
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      ledger_family_code text NOT NULL,
      family_name text NOT NULL,
      requires_standard_account_type boolean NOT NULL DEFAULT false,
      requires_legal_entity boolean NOT NULL DEFAULT false,
      schema_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      is_active boolean NOT NULL DEFAULT true,
      is_seeded boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(tenant_id,organisation_id,ledger_family_code)
    );

    CREATE TABLE IF NOT EXISTS erp_module(
      module_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      module_code text NOT NULL,
      module_name text NOT NULL,
      module_description text NOT NULL DEFAULT '',
      module_icon_svg text NOT NULL DEFAULT '',
      sort_order integer NOT NULL DEFAULT 0,
      is_seeded boolean NOT NULL DEFAULT false,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id,organisation_id,module_code)
    );
    ALTER TABLE erp_module ADD COLUMN IF NOT EXISTS module_icon_svg text NOT NULL DEFAULT '';
    ALTER TABLE erp_ledger_family ADD COLUMN IF NOT EXISTS requires_legal_entity boolean NOT NULL DEFAULT false;
    ALTER TABLE erp_ledger_family ADD COLUMN IF NOT EXISTS schema_json jsonb NOT NULL DEFAULT '{}'::jsonb;

    CREATE TABLE IF NOT EXISTS erp_gl_account_type(
      gl_account_type_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      type_code text NOT NULL,
      type_name text NOT NULL,
      is_required boolean NOT NULL DEFAULT true,
      is_seeded boolean NOT NULL DEFAULT false,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id,organisation_id,type_code)
    );

    CREATE TABLE IF NOT EXISTS erp_subledger_account_type(
      subledger_account_type_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      type_code text NOT NULL,
      type_name text NOT NULL,
      requires_legal_entity boolean NOT NULL DEFAULT false,
      schema_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      is_seeded boolean NOT NULL DEFAULT false,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id,organisation_id,type_code)
    );

    CREATE TABLE IF NOT EXISTS erp_gl_account(
      gl_account_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      owner_division_id uuid NOT NULL REFERENCES erp_division(division_id),
      account_code text NOT NULL,
      account_name text NOT NULL,
      gl_account_type_id uuid REFERENCES erp_gl_account_type(gl_account_type_id),
      requires_subledger boolean NOT NULL DEFAULT false,
      required_subledger_type_code text,
      workflow_status text NOT NULL DEFAULT 'draft' CHECK(workflow_status IN('draft','submitted','approved','rejected','blocked','archived','deleted')),
      valid_from date NOT NULL DEFAULT CURRENT_DATE,
      valid_to date,
      additional_data jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_by_email text,
      updated_by_email text,
      approved_by_email text,
      approved_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id,organisation_id,account_code)
    );

    CREATE TABLE IF NOT EXISTS erp_subledger_account(
      subledger_account_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      owner_division_id uuid NOT NULL REFERENCES erp_division(division_id),
      subledger_account_type_id uuid NOT NULL REFERENCES erp_subledger_account_type(subledger_account_type_id),
      legal_entity_id uuid REFERENCES erp_legal_entity(legal_entity_id),
      account_code text NOT NULL,
      account_name text NOT NULL,
      workflow_status text NOT NULL DEFAULT 'draft' CHECK(workflow_status IN('draft','submitted','approved','rejected','blocked','archived','deleted')),
      valid_from date NOT NULL DEFAULT CURRENT_DATE,
      valid_to date,
      additional_data jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_by_email text,
      updated_by_email text,
      approved_by_email text,
      approved_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id,organisation_id,subledger_account_type_id,account_code)
    );

    CREATE TABLE IF NOT EXISTS erp_accounting_object_type(
      accounting_object_type_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      type_code text NOT NULL,
      type_name text NOT NULL,
      schema_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      ui_schema_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      is_seeded boolean NOT NULL DEFAULT false,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id,organisation_id,type_code)
    );

    CREATE TABLE IF NOT EXISTS erp_accounting_object(
      accounting_object_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      owner_division_id uuid NOT NULL REFERENCES erp_division(division_id),
      accounting_object_type_id uuid NOT NULL REFERENCES erp_accounting_object_type(accounting_object_type_id),
      parent_accounting_object_id uuid REFERENCES erp_accounting_object(accounting_object_id),
      object_code text NOT NULL,
      object_name text NOT NULL,
      workflow_status text NOT NULL DEFAULT 'draft' CHECK(workflow_status IN('draft','submitted','approved','rejected','blocked','archived','deleted')),
      valid_from date NOT NULL DEFAULT CURRENT_DATE,
      valid_to date,
      additional_data jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_by_email text,
      updated_by_email text,
      approved_by_email text,
      approved_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id,organisation_id,accounting_object_type_id,object_code)
    );

    ALTER TABLE erp_accounting_object
      ADD COLUMN IF NOT EXISTS parent_accounting_object_id uuid REFERENCES erp_accounting_object(accounting_object_id);

    CREATE TABLE IF NOT EXISTS erp_accounting_dimension_type(
      accounting_dimension_type_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      type_code text NOT NULL,
      type_name text NOT NULL,
      schema_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      ui_schema_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      is_seeded boolean NOT NULL DEFAULT false,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id,organisation_id,type_code)
    );

    CREATE TABLE IF NOT EXISTS erp_accounting_dimension(
      accounting_dimension_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      owner_division_id uuid NOT NULL REFERENCES erp_division(division_id),
      accounting_dimension_type_id uuid NOT NULL REFERENCES erp_accounting_dimension_type(accounting_dimension_type_id),
      dimension_code text NOT NULL,
      dimension_name text NOT NULL,
      workflow_status text NOT NULL DEFAULT 'draft' CHECK(workflow_status IN('draft','submitted','approved','rejected','blocked','archived','deleted')),
      valid_from date NOT NULL DEFAULT CURRENT_DATE,
      valid_to date,
      additional_data jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_by_email text,
      updated_by_email text,
      approved_by_email text,
      approved_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id,organisation_id,accounting_dimension_type_id,dimension_code)
    );

    CREATE TABLE IF NOT EXISTS erp_tax_type(
      tax_type_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      tax_type_code text NOT NULL,
      tax_type_description text NOT NULL,
      tax_direction text NOT NULL DEFAULT 'none' CHECK(tax_direction IN('output','input','none')),
      is_active boolean NOT NULL DEFAULT true,
      is_seeded boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id,organisation_id,tax_type_code)
    );
    ALTER TABLE erp_tax_type ADD COLUMN IF NOT EXISTS tax_direction text NOT NULL DEFAULT 'none';
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname='erp_tax_type_direction_check'
          AND conrelid='erp_tax_type'::regclass
      ) THEN
        ALTER TABLE erp_tax_type
        ADD CONSTRAINT erp_tax_type_direction_check
        CHECK(tax_direction IN('output','input','none'));
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS erp_tax_rate(
      tax_rate_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      tax_type_id uuid NOT NULL REFERENCES erp_tax_type(tax_type_id) ON DELETE CASCADE,
      tax_rate numeric(9,4) NOT NULL,
      valid_from date NOT NULL,
      valid_to date,
      is_active boolean NOT NULL DEFAULT true,
      is_seeded boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK(tax_rate >= 0),
      CHECK(valid_to IS NULL OR valid_to >= valid_from),
      UNIQUE(tax_type_id,valid_from)
    );
    CREATE INDEX IF NOT EXISTS erp_tax_rate_lookup_idx ON erp_tax_rate(tenant_id,organisation_id,tax_type_id,valid_from DESC);

    CREATE TABLE IF NOT EXISTS erp_ledger_account_type(
      account_type_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      ledger_family_code text NOT NULL,
      account_type_code text NOT NULL,
      account_type_name text NOT NULL,
      is_required boolean NOT NULL DEFAULT false,
      is_seeded boolean NOT NULL DEFAULT false,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS erp_account_type_live_idx ON erp_ledger_account_type(tenant_id,organisation_id,ledger_family_code,account_type_code) WHERE is_active=true;

    CREATE TABLE IF NOT EXISTS erp_ledger_account(
      ledger_account_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      owner_division_id uuid NOT NULL REFERENCES erp_division(division_id),
      ledger_family_code text NOT NULL,
      account_code text NOT NULL,
      account_name text NOT NULL,
      account_type_id uuid REFERENCES erp_ledger_account_type(account_type_id),
      legal_entity_id uuid REFERENCES erp_legal_entity(legal_entity_id),
      requires_subledger boolean NOT NULL DEFAULT false,
      required_subledger_family_code text,
      workflow_status text NOT NULL DEFAULT 'draft' CHECK(workflow_status IN('draft','submitted','approved','rejected','blocked','archived','deleted')),
      effective_from date NOT NULL DEFAULT CURRENT_DATE,
      effective_to date,
      additional_data jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_by_email text,
      updated_by_email text,
      approved_by_email text,
      approved_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE erp_ledger_account ADD COLUMN IF NOT EXISTS legal_entity_id uuid REFERENCES erp_legal_entity(legal_entity_id);
    CREATE UNIQUE INDEX IF NOT EXISTS erp_ledger_account_live_code_idx ON erp_ledger_account(tenant_id,organisation_id,ledger_family_code,account_code) WHERE workflow_status <> 'deleted';
    CREATE INDEX IF NOT EXISTS erp_ledger_account_lookup_idx ON erp_ledger_account(tenant_id,organisation_id,ledger_family_code,workflow_status,account_name);
    CREATE INDEX IF NOT EXISTS erp_ledger_account_legal_entity_idx ON erp_ledger_account(tenant_id,organisation_id,legal_entity_id,ledger_family_code) WHERE workflow_status <> 'deleted';

    CREATE TABLE IF NOT EXISTS erp_master_data_type(
      master_data_type_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      ledger_family_code text NOT NULL,
      type_code text NOT NULL,
      type_name text NOT NULL,
      schema_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      ui_schema_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      schema_version integer NOT NULL DEFAULT 1,
      workflow_status text NOT NULL DEFAULT 'approved' CHECK(workflow_status IN('draft','submitted','approved','rejected','blocked','archived','deleted')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id,organisation_id,type_code)
    );

    CREATE TABLE IF NOT EXISTS erp_master_data_record(
      master_data_record_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      owner_division_id uuid NOT NULL REFERENCES erp_division(division_id),
      master_data_type_id uuid NOT NULL REFERENCES erp_master_data_type(master_data_type_id),
      ledger_account_id uuid REFERENCES erp_ledger_account(ledger_account_id),
      record_code text NOT NULL,
      display_name text NOT NULL,
      workflow_status text NOT NULL DEFAULT 'draft' CHECK(workflow_status IN('draft','submitted','approved','rejected','blocked','archived','deleted')),
      schema_version integer NOT NULL DEFAULT 1,
      additional_data jsonb NOT NULL DEFAULT '{}'::jsonb,
      top_level_search jsonb NOT NULL DEFAULT '{}'::jsonb,
      effective_from date NOT NULL DEFAULT CURRENT_DATE,
      effective_to date,
      created_by_email text,
      updated_by_email text,
      approved_by_email text,
      approved_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS erp_master_data_record_live_code_idx ON erp_master_data_record(tenant_id,organisation_id,master_data_type_id,record_code) WHERE workflow_status <> 'deleted';
    CREATE INDEX IF NOT EXISTS erp_master_data_record_search_idx ON erp_master_data_record USING gin(top_level_search);

    CREATE TABLE IF NOT EXISTS erp_transaction_group(
      transaction_group_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      group_code text NOT NULL,
      group_name text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0,
      is_active boolean NOT NULL DEFAULT true,
      UNIQUE(tenant_id,organisation_id,group_code)
    );

    CREATE TABLE IF NOT EXISTS erp_transaction_type(
      transaction_type_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      transaction_group_id uuid NOT NULL REFERENCES erp_transaction_group(transaction_group_id) ON DELETE CASCADE,
      type_code text NOT NULL,
      type_name text NOT NULL,
      type_description text NOT NULL DEFAULT '',
      is_financial boolean NOT NULL DEFAULT true,
      allow_additional_lines boolean NOT NULL DEFAULT true,
      is_active boolean NOT NULL DEFAULT true,
      sort_order integer NOT NULL DEFAULT 0,
      UNIQUE(tenant_id,organisation_id,type_code)
    );

    CREATE TABLE IF NOT EXISTS erp_posting_rule(
      posting_rule_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      transaction_type_id uuid NOT NULL REFERENCES erp_transaction_type(transaction_type_id) ON DELETE CASCADE,
      line_order integer NOT NULL DEFAULT 0,
      debit_credit text NOT NULL CHECK(debit_credit IN('debit','credit')),
      default_gl_account_id uuid REFERENCES erp_ledger_account(ledger_account_id),
      requires_subledger boolean NOT NULL DEFAULT false,
      subledger_family_code text,
      amount_source text NOT NULL DEFAULT 'manual',
      line_description text NOT NULL DEFAULT '',
      is_required boolean NOT NULL DEFAULT true,
      UNIQUE(transaction_type_id,line_order)
    );
    ALTER TABLE erp_transaction_type ADD COLUMN IF NOT EXISTS is_financial boolean NOT NULL DEFAULT true;

    CREATE TABLE IF NOT EXISTS erp_ledger_family_module(
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      ledger_family_code text NOT NULL,
      module_id uuid NOT NULL REFERENCES erp_module(module_id) ON DELETE CASCADE,
      PRIMARY KEY(tenant_id,organisation_id,ledger_family_code,module_id),
      FOREIGN KEY(tenant_id,organisation_id,ledger_family_code) REFERENCES erp_ledger_family(tenant_id,organisation_id,ledger_family_code) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS erp_accounting_object_type_module(
      accounting_object_type_id uuid NOT NULL REFERENCES erp_accounting_object_type(accounting_object_type_id) ON DELETE CASCADE,
      module_id uuid NOT NULL REFERENCES erp_module(module_id) ON DELETE CASCADE,
      PRIMARY KEY(accounting_object_type_id,module_id)
    );
    CREATE TABLE IF NOT EXISTS erp_accounting_dimension_type_module(
      accounting_dimension_type_id uuid NOT NULL REFERENCES erp_accounting_dimension_type(accounting_dimension_type_id) ON DELETE CASCADE,
      module_id uuid NOT NULL REFERENCES erp_module(module_id) ON DELETE CASCADE,
      PRIMARY KEY(accounting_dimension_type_id,module_id)
    );
    CREATE TABLE IF NOT EXISTS erp_transaction_type_module(
      transaction_type_id uuid NOT NULL REFERENCES erp_transaction_type(transaction_type_id) ON DELETE CASCADE,
      module_id uuid NOT NULL REFERENCES erp_module(module_id) ON DELETE CASCADE,
      PRIMARY KEY(transaction_type_id,module_id)
    );
    ALTER TABLE erp_posting_rule ADD COLUMN IF NOT EXISTS requires_subledger boolean NOT NULL DEFAULT false;
    ALTER TABLE erp_posting_rule ADD COLUMN IF NOT EXISTS subledger_family_code text;

    CREATE TABLE IF NOT EXISTS erp_journal(
      journal_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id),
      transaction_type_id uuid REFERENCES erp_transaction_type(transaction_type_id),
      fiscal_period_id uuid NOT NULL REFERENCES erp_fiscal_period(fiscal_period_id),
      source_division_id uuid NOT NULL REFERENCES erp_division(division_id),
      journal_number text,
      journal_date date NOT NULL DEFAULT CURRENT_DATE,
      description text NOT NULL DEFAULT '',
      workflow_status text NOT NULL DEFAULT 'draft' CHECK(workflow_status IN('draft','submitted','approved','rejected','blocked','deleted','reversed')),
      currency_code text NOT NULL,
      exchange_rate numeric(18,8) NOT NULL DEFAULT 1,
      reversing_journal_id uuid REFERENCES erp_journal(journal_id),
      created_by_email text,
      updated_by_email text,
      submitted_by_email text,
      approved_by_email text,
      approved_at timestamptz,
      reversed_by_email text,
      reversed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    DO $$
    DECLARE constraint_name text;
    BEGIN
      SELECT conname INTO constraint_name
      FROM pg_constraint
      WHERE conrelid='erp_journal'::regclass
        AND contype='c'
        AND pg_get_constraintdef(oid) LIKE '%workflow_status%'
      LIMIT 1;
      IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE erp_journal DROP CONSTRAINT %I',constraint_name);
      END IF;
      ALTER TABLE erp_journal ADD CONSTRAINT erp_journal_workflow_status_check CHECK(workflow_status IN('draft','submitted','approved','rejected','blocked','deleted','reversed'));
    END $$;
    CREATE INDEX IF NOT EXISTS erp_journal_lookup_idx ON erp_journal(tenant_id,organisation_id,workflow_status,journal_date DESC);

    CREATE TABLE IF NOT EXISTS erp_journal_line(
      journal_line_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id),
      journal_id uuid NOT NULL REFERENCES erp_journal(journal_id) ON DELETE CASCADE,
      line_number integer NOT NULL,
      division_id uuid NOT NULL REFERENCES erp_division(division_id),
      gl_account_id uuid NOT NULL REFERENCES erp_ledger_account(ledger_account_id),
      subledger_account_id uuid REFERENCES erp_ledger_account(ledger_account_id),
      description text NOT NULL DEFAULT '',
      debit_amount numeric(18,2) NOT NULL DEFAULT 0,
      credit_amount numeric(18,2) NOT NULL DEFAULT 0,
      currency_code text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK(debit_amount >= 0 AND credit_amount >= 0),
      CHECK((debit_amount > 0 AND credit_amount = 0) OR (credit_amount > 0 AND debit_amount = 0))
    );
    CREATE INDEX IF NOT EXISTS erp_journal_line_subledger_idx ON erp_journal_line(tenant_id,organisation_id,subledger_account_id);

    CREATE TABLE IF NOT EXISTS erp_financial_statement_format(
      financial_statement_format_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      format_code text NOT NULL,
      format_name text NOT NULL,
      statement_type text NOT NULL CHECK(statement_type IN('income','balance')),
      is_active boolean NOT NULL DEFAULT true,
      is_seeded boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id,organisation_id,format_code)
    );

    CREATE TABLE IF NOT EXISTS erp_financial_statement_line(
      financial_statement_line_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      financial_statement_format_id uuid NOT NULL REFERENCES erp_financial_statement_format(financial_statement_format_id) ON DELETE CASCADE,
      parent_line_id uuid REFERENCES erp_financial_statement_line(financial_statement_line_id) ON DELETE CASCADE,
      line_code text NOT NULL,
      line_label text NOT NULL,
      line_type text NOT NULL DEFAULT 'account_group' CHECK(line_type IN('header','account_group','formula')),
      sort_order integer NOT NULL DEFAULT 0,
      sign_multiplier integer NOT NULL DEFAULT 1 CHECK(sign_multiplier IN(-1,1)),
      formula_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(financial_statement_format_id,line_code)
    );

    CREATE TABLE IF NOT EXISTS erp_financial_statement_line_account(
      financial_statement_line_account_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      financial_statement_format_id uuid NOT NULL REFERENCES erp_financial_statement_format(financial_statement_format_id) ON DELETE CASCADE,
      financial_statement_line_id uuid NOT NULL REFERENCES erp_financial_statement_line(financial_statement_line_id) ON DELETE CASCADE,
      ledger_account_id uuid NOT NULL REFERENCES erp_ledger_account(ledger_account_id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id,organisation_id,financial_statement_format_id,ledger_account_id)
    );

    CREATE TABLE IF NOT EXISTS erp_supporting_document(
      document_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      entity_kind text NOT NULL CHECK(entity_kind IN('ledger_account','master_data_record','journal','legal_entity')),
      entity_id uuid NOT NULL,
      document_type text NOT NULL DEFAULT 'other',
      file_name text NOT NULL,
      mime_type text NOT NULL,
      file_size integer NOT NULL DEFAULT 0,
      file_data bytea NOT NULL,
      description text NOT NULL DEFAULT '',
      deleted boolean NOT NULL DEFAULT false,
      deleted_at timestamptz,
      created_by_email text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE erp_supporting_document DROP CONSTRAINT IF EXISTS erp_supporting_document_entity_kind_check;
    ALTER TABLE erp_supporting_document ADD CONSTRAINT erp_supporting_document_entity_kind_check CHECK(entity_kind IN('ledger_account','master_data_record','journal','legal_entity'));
    CREATE INDEX IF NOT EXISTS erp_supporting_document_entity_idx ON erp_supporting_document(tenant_id,organisation_id,entity_kind,entity_id,deleted,created_at DESC);

    CREATE TABLE IF NOT EXISTS erp_document_intake(
      intake_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      target_kind text NOT NULL CHECK(target_kind IN('legal_entity','ledger_account','journal')),
      source_file_name text NOT NULL,
      source_mime_type text NOT NULL,
      source_file_size integer NOT NULL DEFAULT 0,
      source_file_data bytea NOT NULL,
      extracted_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      confidence numeric(6,4) NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'analysed' CHECK(status IN('analysed','confirmed','discarded')),
      created_entity_kind text,
      created_entity_id uuid,
      created_by_email text,
      created_at timestamptz NOT NULL DEFAULT now(),
      confirmed_by_email text,
      confirmed_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS erp_document_intake_lookup_idx ON erp_document_intake(tenant_id,organisation_id,target_kind,status,created_at DESC);

    CREATE TABLE IF NOT EXISTS erp_organisation_openai_setting(
      tenant_id uuid NOT NULL,
      organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      api_key_ciphertext text,
      api_key_iv text,
      api_key_tag text,
      model text NOT NULL DEFAULT 'gpt-4.1-mini',
      updated_by_email text,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(tenant_id,organisation_id)
    );
    ALTER TABLE erp_organisation_openai_setting ADD COLUMN IF NOT EXISTS model text NOT NULL DEFAULT 'gpt-4.1-mini';
    ALTER TABLE erp_organisation_openai_setting ADD COLUMN IF NOT EXISTS updated_by_email text;

    CREATE TABLE IF NOT EXISTS erp_role(
      role_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      role_code text NOT NULL,
      role_name text NOT NULL,
      role_description text NOT NULL DEFAULT '',
      is_admin boolean NOT NULL DEFAULT false,
      is_active boolean NOT NULL DEFAULT true,
      UNIQUE(tenant_id,organisation_id,role_code)
    );
    ALTER TABLE erp_role ADD COLUMN IF NOT EXISTS role_description text NOT NULL DEFAULT '';
    UPDATE erp_role
    SET is_admin=false
    WHERE role_code='erp_admin' AND is_admin=true;

    CREATE TABLE IF NOT EXISTS erp_role_permission(
      role_permission_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      role_id uuid NOT NULL REFERENCES erp_role(role_id) ON DELETE CASCADE,
      division_id uuid REFERENCES erp_division(division_id),
      resource_kind text NOT NULL,
      resource_code text NOT NULL DEFAULT '*',
      workflow_status text NOT NULL DEFAULT '*',
      action_code text NOT NULL,
      applies_to_children boolean NOT NULL DEFAULT true,
      valid_from date NOT NULL DEFAULT CURRENT_DATE,
      valid_to date
    );

    CREATE TABLE IF NOT EXISTS erp_user_role(
      user_role_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      organisation_id uuid REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
      role_id uuid NOT NULL REFERENCES erp_role(role_id) ON DELETE CASCADE,
      email text NOT NULL,
      valid_from date NOT NULL DEFAULT CURRENT_DATE,
      valid_to date,
      UNIQUE(tenant_id,organisation_id,role_id,email)
    );

    CREATE TABLE IF NOT EXISTS erp_role_module(
      role_id uuid NOT NULL REFERENCES erp_role(role_id) ON DELETE CASCADE,
      module_id uuid NOT NULL REFERENCES erp_module(module_id) ON DELETE CASCADE,
      PRIMARY KEY(role_id,module_id)
    );
