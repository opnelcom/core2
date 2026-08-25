'use strict';

const referenceCategories=[
  ['Personal','Personal goals, habits, health, learning, and life administration.',10],
  ['Family','Family plans, commitments, responsibilities, and shared goals.',20],
  ['Work','Work projects, responsibilities, deliverables, and follow-ups.',30],
  ['Health','Health, fitness, appointments, and wellbeing.',40],
  ['Finance','Budgeting, savings, investments, debt, and administration.',50],
  ['Home','Home repairs, maintenance, improvements, and household routines.',60],
  ['Learning','Courses, reading, research, practice, and personal development.',70],
  ['Projects','Standalone projects that need planning and decomposition.',80]
];

async function ensureSchema(ctx){
  await ctx.broker('core_tasks','query',{text:`
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
    ALTER TABLE tasks_task ADD COLUMN IF NOT EXISTS task_description text NOT NULL DEFAULT '';
    ALTER TABLE tasks_task ADD COLUMN IF NOT EXISTS importance text NOT NULL DEFAULT 'normal';
    ALTER TABLE tasks_task ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
    ALTER TABLE tasks_task ADD COLUMN IF NOT EXISTS percent_complete numeric(5,2) NOT NULL DEFAULT 0;
    ALTER TABLE tasks_task ADD COLUMN IF NOT EXISTS start_date date;
    ALTER TABLE tasks_task ADD COLUMN IF NOT EXISTS due_date date;
    ALTER TABLE tasks_task ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
    ALTER TABLE tasks_task ADD COLUMN IF NOT EXISTS completed_at timestamptz;
    ALTER TABLE tasks_task ADD COLUMN IF NOT EXISTS archived_at timestamptz;
    ALTER TABLE tasks_task ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
    ALTER TABLE tasks_task DROP CONSTRAINT IF EXISTS tasks_task_importance_check;
    ALTER TABLE tasks_task ADD CONSTRAINT tasks_task_importance_check CHECK(importance IN('low','normal','high','critical'));
    ALTER TABLE tasks_task DROP CONSTRAINT IF EXISTS tasks_task_status_check;
    ALTER TABLE tasks_task ADD CONSTRAINT tasks_task_status_check CHECK(status IN('active','future','on_hold','blocked','complete','cancelled','archived','deleted'));
    ALTER TABLE tasks_task DROP CONSTRAINT IF EXISTS tasks_task_percent_complete_check;
    ALTER TABLE tasks_task ADD CONSTRAINT tasks_task_percent_complete_check CHECK(percent_complete >= 0 AND percent_complete <= 100);
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
    CREATE TABLE IF NOT EXISTS tasks_tenant_openai_setting(
      tenant_id uuid PRIMARY KEY,
      api_key_ciphertext text,
      api_key_iv text,
      api_key_tag text,
      model text NOT NULL DEFAULT 'gpt-4.1-mini',
      updated_by_email text,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE tasks_tenant_openai_setting ADD COLUMN IF NOT EXISTS model text NOT NULL DEFAULT 'gpt-4.1-mini';
    ALTER TABLE tasks_tenant_openai_setting ADD COLUMN IF NOT EXISTS updated_by_email text;
    CREATE INDEX IF NOT EXISTS tasks_task_tenant_parent_idx ON tasks_task(tenant_id,parent_task_id,status,sort_order,task_name);
    CREATE INDEX IF NOT EXISTS tasks_task_tenant_status_idx ON tasks_task(tenant_id,status,importance,due_date);
    CREATE INDEX IF NOT EXISTS tasks_task_attachment_task_idx ON tasks_task_attachment(tenant_id,task_id,attachment_type,deleted,created_at);
  `});
  await seedReferenceCategories(ctx);
}

async function seedReferenceCategories(ctx){
  await ctx.broker('core_tasks','query',{
    text:`INSERT INTO tasks_reference_category(category_name,category_description,sort_order,status)
          SELECT category_name,category_description,sort_order,'active'
          FROM jsonb_to_recordset($1::jsonb) AS row(category_name text,category_description text,sort_order integer)
          ON CONFLICT(category_name) DO UPDATE
          SET category_description=excluded.category_description,sort_order=excluded.sort_order,status='active',updated_at=now()`,
    values:[JSON.stringify(referenceCategories.map(([category_name,category_description,sort_order])=>({category_name,category_description,sort_order})))]
  });
}

async function authTenant(ctx){
  const auth=ctx.auth();
  if(!auth)return {status:401,body:{error:'Authentication required'}};
  const tenantId=ctx.cookies.current_tenant;
  if(!tenantId)return {status:400,body:{error:'No current tenant'}};
  const access=await ctx.broker('core_saas','query',{
    brokerProfile:'core_saas',
    text:`SELECT t.tenant_id,tu.tenant_user_type
          FROM core_tenant t
          JOIN core_tenant_user tu ON tu.tenant_id=t.tenant_id
          WHERE t.tenant_id=$1
          AND lower(tu.email)=lower($2)
          AND t.status='active'
          AND tu.status='active'`,
    values:[tenantId,auth.email]
  });
  if(!access.rowCount)return {status:403,body:{error:'No access to active tenant'}};
  return {auth,tenantId};
}

function clean(value){
  const text=String(value||'').trim();
  return text||null;
}

function percent(value){
  const parsed=Number.parseFloat(value);
  if(!Number.isFinite(parsed))return 0;
  return Math.min(100,Math.max(0,parsed));
}

module.exports={ensureSchema,authTenant,clean,percent};
