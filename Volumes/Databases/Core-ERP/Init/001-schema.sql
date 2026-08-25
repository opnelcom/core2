CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS erp_note(note_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,title text NOT NULL,body text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
