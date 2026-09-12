CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS objectsphere_item(
  item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  parent_item_id uuid REFERENCES objectsphere_item(item_id),
  item_name text NOT NULL,
  item_description text NOT NULL DEFAULT '',
  quantity integer NOT NULL DEFAULT 1 CHECK(quantity > 0),
  latitude numeric(10,7),
  longitude numeric(10,7),
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK(status IN('active','archived','deleted')),
  created_by_email text,
  updated_by_email text,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE objectsphere_item ADD COLUMN IF NOT EXISTS latitude numeric(10,7);
ALTER TABLE objectsphere_item ADD COLUMN IF NOT EXISTS longitude numeric(10,7);
CREATE INDEX IF NOT EXISTS objectsphere_item_tenant_parent_idx ON objectsphere_item(tenant_id,parent_item_id,status,sort_order,item_name);
CREATE TABLE IF NOT EXISTS objectsphere_object_type(
  object_type_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  type_name text NOT NULL,
  type_description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK(status IN('active','disabled')),
  deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS objectsphere_attribute(
  attribute_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  object_type_id uuid NOT NULL REFERENCES objectsphere_object_type(object_type_id) ON DELETE CASCADE,
  attribute_name text NOT NULL,
  attribute_type text NOT NULL CHECK(attribute_type IN('text','large_text','date','number','float','currency')),
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK(status IN('active','disabled')),
  deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS objectsphere_item_type(
  item_type_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES objectsphere_item(item_id) ON DELETE CASCADE,
  object_type_id uuid NOT NULL REFERENCES objectsphere_object_type(object_type_id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK(status IN('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(item_id,object_type_id)
);
CREATE TABLE IF NOT EXISTS objectsphere_attribute_value(
  value_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES objectsphere_item(item_id) ON DELETE CASCADE,
  attribute_id uuid NOT NULL REFERENCES objectsphere_attribute(attribute_id) ON DELETE CASCADE,
  value_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(item_id,attribute_id)
);
CREATE TABLE IF NOT EXISTS objectsphere_attribute_value_history(
  history_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  item_id uuid NOT NULL,
  attribute_id uuid NOT NULL,
  object_type_id uuid,
  item_name text NOT NULL DEFAULT '',
  object_type_name text NOT NULL DEFAULT '',
  attribute_name text NOT NULL DEFAULT '',
  old_value_text text,
  new_value_text text,
  changed_by_email text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS objectsphere_item_attachment(
  attachment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES objectsphere_item(item_id) ON DELETE CASCADE,
  attachment_type text NOT NULL CHECK(attachment_type IN('photo','document','wireframe')),
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size integer NOT NULL DEFAULT 0,
  file_data bytea NOT NULL,
  deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE objectsphere_item_attachment DROP CONSTRAINT IF EXISTS objectsphere_item_attachment_attachment_type_check;
ALTER TABLE objectsphere_item_attachment ADD CONSTRAINT objectsphere_item_attachment_attachment_type_check CHECK(attachment_type IN('photo','document','wireframe'));
CREATE TABLE IF NOT EXISTS objectsphere_tenant_openai_setting(
  tenant_id uuid PRIMARY KEY,
  api_key_ciphertext text,
  api_key_iv text,
  api_key_tag text,
  model text NOT NULL DEFAULT 'gpt-4.1-mini',
  updated_by_email text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS objectsphere_event_type(
  event_type_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  type_name text NOT NULL,
  type_description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  default_severity text NOT NULL DEFAULT 'medium' CHECK(default_severity IN('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'active' CHECK(status IN('active','disabled')),
  deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS objectsphere_event(
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES objectsphere_item(item_id) ON DELETE CASCADE,
  event_type_id uuid NOT NULL REFERENCES objectsphere_event_type(event_type_id),
  event_title text NOT NULL,
  event_description text NOT NULL DEFAULT '',
  event_at timestamptz NOT NULL DEFAULT now(),
  severity text NOT NULL DEFAULT 'medium' CHECK(severity IN('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'open' CHECK(status IN('open','in_review','resolved','closed')),
  reported_by_email text,
  created_by_email text,
  updated_by_email text,
  deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS objectsphere_reference_object_type(
  reference_object_type_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_name text NOT NULL UNIQUE,
  type_description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK(status IN('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS objectsphere_reference_attribute(
  reference_attribute_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_object_type_id uuid NOT NULL REFERENCES objectsphere_reference_object_type(reference_object_type_id) ON DELETE CASCADE,
  attribute_name text NOT NULL,
  attribute_type text NOT NULL CHECK(attribute_type IN('text','large_text','date','number','float','currency')),
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK(status IN('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(reference_object_type_id,attribute_name)
);
CREATE TABLE IF NOT EXISTS objectsphere_reference_event_type(
  reference_event_type_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_name text NOT NULL UNIQUE,
  type_description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  default_severity text NOT NULL DEFAULT 'medium' CHECK(default_severity IN('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'active' CHECK(status IN('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS objectsphere_object_type_tenant_idx ON objectsphere_object_type(tenant_id,deleted,status,sort_order,type_name);
CREATE UNIQUE INDEX IF NOT EXISTS objectsphere_object_type_live_name_idx ON objectsphere_object_type(tenant_id,type_name) WHERE deleted=false;
CREATE INDEX IF NOT EXISTS objectsphere_attribute_type_idx ON objectsphere_attribute(object_type_id,deleted,status,sort_order,attribute_name);
CREATE UNIQUE INDEX IF NOT EXISTS objectsphere_attribute_live_name_idx ON objectsphere_attribute(object_type_id,attribute_name) WHERE deleted=false;
CREATE INDEX IF NOT EXISTS objectsphere_item_type_item_idx ON objectsphere_item_type(item_id,status);
CREATE INDEX IF NOT EXISTS objectsphere_attribute_value_item_idx ON objectsphere_attribute_value(item_id);
CREATE INDEX IF NOT EXISTS objectsphere_attribute_value_history_lookup_idx ON objectsphere_attribute_value_history(tenant_id,item_id,attribute_id,changed_at DESC);
CREATE INDEX IF NOT EXISTS objectsphere_item_attachment_lookup_idx ON objectsphere_item_attachment(tenant_id,item_id,attachment_type,deleted,created_at DESC);
CREATE INDEX IF NOT EXISTS objectsphere_event_type_tenant_idx ON objectsphere_event_type(tenant_id,deleted,status,sort_order,type_name);
CREATE UNIQUE INDEX IF NOT EXISTS objectsphere_event_type_live_name_idx ON objectsphere_event_type(tenant_id,type_name) WHERE deleted=false;
CREATE INDEX IF NOT EXISTS objectsphere_event_item_idx ON objectsphere_event(tenant_id,item_id,deleted,event_at DESC);
CREATE INDEX IF NOT EXISTS objectsphere_event_type_idx ON objectsphere_event(tenant_id,event_type_id,deleted,event_at DESC);
