-- Additive upgrade for existing ERP databases.
CREATE TABLE IF NOT EXISTS erp_user_menu_favourite(
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  organisation_id uuid NOT NULL REFERENCES erp_organisation(organisation_id) ON DELETE CASCADE,
  item_key text NOT NULL CHECK(length(item_key)<=300),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,user_id,organisation_id,item_key)
);
