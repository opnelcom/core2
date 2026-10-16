-- Additive migration for existing ERP databases. Existing SVGs remain unchanged.
ALTER TABLE erp_organisation
  ADD COLUMN IF NOT EXISTS organisation_icon_colour text
  CHECK (organisation_icon_colour ~ '^#[0-9A-Fa-f]{6}$');
