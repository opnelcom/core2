CREATE TABLE IF NOT EXISTS dbmanager_connection (
  connection_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  connection_name varchar(120) NOT NULL,
  engine text NOT NULL DEFAULT 'postgresql' CHECK (engine IN ('postgresql')),
  host varchar(255) NOT NULL,
  port integer NOT NULL DEFAULT 5432 CHECK (port BETWEEN 1 AND 65535),
  database_name varchar(255) NOT NULL,
  username varchar(255) NOT NULL,
  ssl_mode text NOT NULL DEFAULT 'verify-full' CHECK (ssl_mode IN ('verify-full','disable')),
  description text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  created_by_email text NOT NULL,
  updated_by_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS dbmanager_connection_tenant_name ON dbmanager_connection (tenant_id,lower(connection_name));
