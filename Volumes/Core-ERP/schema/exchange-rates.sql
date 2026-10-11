-- Additive, idempotent migration; no existing currency or journal values change.
CREATE TABLE IF NOT EXISTS erp_exchange_rate (
  exchange_rate_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
  from_currency_code text NOT NULL,
  to_currency_code text NOT NULL,
  effective_from date NOT NULL,
  rate numeric(28,8) NOT NULL CHECK (rate > 0),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by_email text NOT NULL,
  updated_by_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_currency_code <> to_currency_code),
  UNIQUE (tenant_id,organisation_id,exchange_rate_id),
  FOREIGN KEY (tenant_id,organisation_id,from_currency_code) REFERENCES erp_currency(tenant_id,organisation_id,currency_code),
  FOREIGN KEY (tenant_id,organisation_id,to_currency_code) REFERENCES erp_currency(tenant_id,organisation_id,currency_code)
);
CREATE UNIQUE INDEX IF NOT EXISTS erp_exchange_rate_pair_date
  ON erp_exchange_rate(tenant_id,organisation_id,least(from_currency_code,to_currency_code),greatest(from_currency_code,to_currency_code),effective_from);
CREATE TABLE IF NOT EXISTS erp_exchange_rate_change (
  tenant_id uuid NOT NULL,
  organisation_id uuid NOT NULL,
  exchange_rate_id uuid NOT NULL,
  revision integer NOT NULL,
  previous_rate numeric(28,8),
  rate numeric(28,8) NOT NULL CHECK (rate > 0),
  reason text,
  changed_by_email text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (exchange_rate_id,revision),
  FOREIGN KEY (tenant_id,organisation_id,exchange_rate_id)
    REFERENCES erp_exchange_rate(tenant_id,organisation_id,exchange_rate_id) ON DELETE CASCADE,
  CHECK ((revision=1 AND previous_rate IS NULL AND reason IS NULL) OR
         (revision>1 AND previous_rate IS NOT NULL AND reason IS NOT NULL AND length(btrim(reason)) BETWEEN 1 AND 1000))
);
