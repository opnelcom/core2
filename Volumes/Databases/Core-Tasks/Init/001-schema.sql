CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tasks_task(
  task_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  parent_task_id uuid REFERENCES tasks_task(task_id),
  task_name text NOT NULL,
  task_description text NOT NULL DEFAULT '',
  importance text NOT NULL DEFAULT 'normal' CHECK(importance IN('low','normal','high','critical')),
  status text NOT NULL DEFAULT 'active' CHECK(status IN('active','future','on_hold','blocked','complete','cancelled','archived','deleted')),
  percent_complete numeric(5,2) NOT NULL DEFAULT 0 CHECK(percent_complete >= 0 AND percent_complete <= 100),
  start_date date,
  due_date date,
  sort_order integer NOT NULL DEFAULT 0,
  created_by_email text,
  updated_by_email text,
  completed_at timestamptz,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks_reference_category(
  reference_category_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name text NOT NULL UNIQUE,
  category_description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK(status IN('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks_task_attachment(
  attachment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  task_id uuid NOT NULL REFERENCES tasks_task(task_id) ON DELETE CASCADE,
  attachment_type text NOT NULL DEFAULT 'document' CHECK(attachment_type IN('document')),
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size integer NOT NULL DEFAULT 0,
  file_data bytea NOT NULL,
  deleted boolean NOT NULL DEFAULT false,
  created_by_email text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tasks_task_tenant_parent_idx ON tasks_task(tenant_id,parent_task_id,status,sort_order,task_name);
CREATE INDEX IF NOT EXISTS tasks_task_tenant_status_idx ON tasks_task(tenant_id,status,importance,due_date);
CREATE INDEX IF NOT EXISTS tasks_task_attachment_task_idx ON tasks_task_attachment(tenant_id,task_id,attachment_type,deleted,created_at);
