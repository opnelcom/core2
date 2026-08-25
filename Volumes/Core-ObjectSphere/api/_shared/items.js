'use strict';

const referenceCatalog=[
  {type_name:'Organisation',type_description:'Legal or operating organisation details.',sort_order:10,attributes:[
    ['Legal Name','text',10],['Trading Name','text',20],['Company Registration Number','text',30],['VAT Registration Number','text',40],['Tax Number','text',50],['Website','text',60],['Email','text',70],['Phone','text',80],['Contact Person','text',90],['Registered Address','large_text',100],['Postal Address','large_text',110],['Domicilium','large_text',120],['Directors','text',130]
  ]},
  {type_name:'Software',type_description:'Software systems, subscriptions, and licences.',sort_order:20,attributes:[
    ['URL','text',10],['Login URL','text',20],['Licence Expiry Date','date',30],['Subscription Renewal Date','date',40],['Vendor','text',50],['Licence Key','text',60],['Number of Seats','number',70],['Monthly Cost','currency',80],['Annual Cost','currency',90]
  ]},
  {type_name:'Property',type_description:'Land, buildings, units, and immovable property.',sort_order:30,attributes:[
    ['Address','large_text',10],['Street','text',20],['Suburb','text',30],['City','text',40],['Province','text',50],['Postal Code','number',60],['Stand','text',70],['ERF size','number',80],['Municipal Account Number','text',90],['Title Deed Number','text',100],['Zoning','text',110],['Purchase Date','date',120],['Purchase Price','currency',130],['Market Value','currency',140]
  ]},
  {type_name:'Asset',type_description:'Owned assets with financial and lifecycle details.',sort_order:40,attributes:[
    ['Asset Tag','text',10],['Supplier','text',20],['Purchase Date','date',30],['Purchase Price','currency',40],['Expected Useful Life (Years)','number',50],['Condition','text',60],['Replacement Value','currency',70],['Insurance Value','currency',80],['Financial Classification','text',90],['Warranty Expiry Date','date',100],['Owner / Responsible Person','text',110],['Disposal Date','date',120],['Disposal Value','currency',130]
  ]},
  {type_name:'Vehicle',type_description:'Cars, trucks, trailers, and other registered vehicles.',sort_order:50,attributes:[
    ['Make','text',10],['Model','text',20],['Registration','text',30],['VIN','text',40],['License Expiry Date','date',50],['Colour','text',60],['Engine Size','float',70],['Odometer','number',80],['Fuel Type','text',90],['Service Due Date','date',100],['Insurance Policy Number','text',110],['Purchase Date','date',120],['Purchase Price','currency',130],['Current Value','currency',140]
  ]},
  {type_name:'Artwork',type_description:'Artworks, collectibles, and appraised pieces.',sort_order:60,attributes:[
    ['Artist','text',10],['Creation Date','date',20],['Medium','text',30],['Dimensions','text',40],['Provenance','large_text',50],['Appraised Value','currency',60],['Appraisal Date','date',70]
  ]},
  {type_name:'Book',type_description:'Books and publications.',sort_order:70,attributes:[
    ['Author','text',10],['Publishing Date','date',20],['Publisher','text',30],['ISBN','text',40],['Edition','text',50],['Genre / Category','text',60],['Location / Shelf','text',70]
  ]},
  {type_name:'Equipment',type_description:'Operational, technical, or serviceable equipment.',sort_order:80,attributes:[
    ['Manufacturer','text',10],['Serial Number','text',20],['Access URL','text',30],['Model Number','text',40],['IP Address / Network Name','text',50],['Warranty Expiry Date','date',60],['Maintenance Interval','text',70],['Last Service Date','date',80],['Next Service Date','date',90]
  ]},
  {type_name:'Plant',type_description:'Plants, trees, and garden items.',sort_order:90,attributes:[
    ['Species','text',10],['Variety','text',20],['Planted Date','date',30],['Watering Frequency','text',40],['Sunlight Requirement','text',50],['Care Notes','large_text',60]
  ]},
  {type_name:'Account',type_description:'Accounts with external organisations or systems.',sort_order:100,attributes:[
    ['Organisation','text',10],['Account Holder','text',20],['Account Number','text',30],['URL','text',40],['Login Name','text',50],['Recovery Email','text',60],['Notes','large_text',70]
  ]},
  {type_name:'Room',type_description:'Rooms or spaces in a hierarchy.',sort_order:110,attributes:[
    ['Floor','text',10],['Room Number','text',20],['Area','float',30],['Use','text',40]
  ]},
  {type_name:'Stock item',type_description:'Consumable, stock, or inventory items.',sort_order:120,attributes:[
    ['Type','text',10],['Brand','text',20],['Unit of Measure','text',30],['Minimum Stock Level','number',40],['Expiry Date','date',50],['Batch Number','text',60],['Storage Location','text',70],['Supplier','text',80]
  ]},
  {type_name:'Contract',type_description:'Contracts and agreements.',sort_order:130,attributes:[
    ['Contract Number','text',10],['Counterparty','text',20],['Start Date','date',30],['End Date','date',40],['Renewal Date','date',50],['Contract Value','currency',60],['Notice Period','text',70],['Responsible Person','text',80]
  ]},
  {type_name:'Insurance Policy',type_description:'Insurance policies and cover.',sort_order:140,attributes:[
    ['Policy Number','text',10],['Insurer','text',20],['Broker','text',30],['Start Date','date',40],['Renewal Date','date',50],['Premium','currency',60],['Insured Value','currency',70],['Excess','currency',80]
  ]},
  {type_name:'Subscription',type_description:'Recurring subscriptions and services.',sort_order:150,attributes:[
    ['Provider','text',10],['Subscription Number','text',20],['Start Date','date',30],['Renewal Date','date',40],['Billing Frequency','text',50],['Cost','currency',60],['Cancellation Notice','text',70]
  ]},
  {type_name:'Warranty',type_description:'Warranty or guarantee information.',sort_order:160,attributes:[
    ['Provider','text',10],['Warranty Number','text',20],['Start Date','date',30],['Expiry Date','date',40],['Coverage','large_text',50],['Claim Contact','text',60]
  ]}
];

const referenceEventCatalog=[
  ['Damage','Physical damage, breakage, deterioration, leaks, or defects.',10,'high'],
  ['Theft / Robbery','Stolen property, robbery, burglary, or attempted theft.',20,'critical'],
  ['Incident','General incident affecting an object, person, site, or service.',30,'medium'],
  ['Inspection','Inspection findings, site checks, audits, or review visits.',40,'low'],
  ['Maintenance','Maintenance activity, repair work, service visits, or follow-up work.',50,'medium'],
  ['Safety issue','Safety hazards, near misses, injuries, or unsafe conditions.',60,'high'],
  ['Security issue','Access control, alarm, perimeter, guard, or security concerns.',70,'high'],
  ['Outage','Service interruption, utility outage, equipment outage, or downtime.',80,'high'],
  ['Complaint','Complaint or concern raised by an occupant, customer, tenant, or visitor.',90,'medium'],
  ['Insurance claim','Claim event, insurer communication, loss assessment, or claim outcome.',100,'high'],
  ['Handover','Handover, acceptance, checkout, condition record, or responsibility transfer.',110,'low'],
  ['Movement / relocation','Object movement, relocation, transfer, or change of storage position.',120,'low'],
  ['Compliance finding','Regulatory, statutory, policy, or standards-related finding.',130,'high'],
  ['General note','General notable event that does not fit another event type.',140,'low']
];

let schemaReady=false;
let schemaPromise=null;

async function ensureSchema(ctx){
  if(schemaReady)return;
  if(!schemaPromise){
    schemaPromise=ensureSchemaUncached(ctx)
      .then(()=>{schemaReady=true;})
      .catch(error=>{
        schemaPromise=null;
        throw error;
      });
  }
  return schemaPromise;
}

async function ensureSchemaUncached(ctx){
  await ctx.broker('core_objectsphere','query',{text:`
    SELECT pg_advisory_xact_lock(hashtext('objectsphere_schema'));
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
    ALTER TABLE objectsphere_item ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1 CHECK(quantity > 0);
    ALTER TABLE objectsphere_item ADD COLUMN IF NOT EXISTS latitude numeric(10,7);
    ALTER TABLE objectsphere_item ADD COLUMN IF NOT EXISTS longitude numeric(10,7);
    ALTER TABLE objectsphere_item ADD COLUMN IF NOT EXISTS archived_at timestamptz;
    ALTER TABLE objectsphere_item DROP CONSTRAINT IF EXISTS objectsphere_item_status_check;
    ALTER TABLE objectsphere_item ADD CONSTRAINT objectsphere_item_status_check CHECK(status IN('active','archived','deleted'));
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
    ALTER TABLE objectsphere_object_type ADD COLUMN IF NOT EXISTS deleted boolean NOT NULL DEFAULT false;
    ALTER TABLE objectsphere_object_type ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
    ALTER TABLE objectsphere_object_type DROP CONSTRAINT IF EXISTS objectsphere_object_type_tenant_id_type_name_key;
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
    ALTER TABLE objectsphere_attribute ADD COLUMN IF NOT EXISTS deleted boolean NOT NULL DEFAULT false;
    ALTER TABLE objectsphere_attribute ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
    ALTER TABLE objectsphere_attribute DROP CONSTRAINT IF EXISTS objectsphere_attribute_object_type_id_attribute_name_key;
    ALTER TABLE objectsphere_attribute DROP CONSTRAINT IF EXISTS objectsphere_attribute_attribute_type_check;
    ALTER TABLE objectsphere_attribute ADD CONSTRAINT objectsphere_attribute_attribute_type_check CHECK(attribute_type IN('text','large_text','date','number','float','currency'));
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
    ALTER TABLE objectsphere_tenant_openai_setting ADD COLUMN IF NOT EXISTS model text NOT NULL DEFAULT 'gpt-4.1-mini';
    ALTER TABLE objectsphere_tenant_openai_setting ADD COLUMN IF NOT EXISTS updated_by_email text;
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
    ALTER TABLE objectsphere_event_type ADD COLUMN IF NOT EXISTS default_severity text NOT NULL DEFAULT 'medium';
    ALTER TABLE objectsphere_event_type ADD COLUMN IF NOT EXISTS deleted boolean NOT NULL DEFAULT false;
    ALTER TABLE objectsphere_event_type ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
    ALTER TABLE objectsphere_event_type DROP CONSTRAINT IF EXISTS objectsphere_event_type_default_severity_check;
    ALTER TABLE objectsphere_event_type ADD CONSTRAINT objectsphere_event_type_default_severity_check CHECK(default_severity IN('low','medium','high','critical'));
    ALTER TABLE objectsphere_event_type DROP CONSTRAINT IF EXISTS objectsphere_event_type_status_check;
    ALTER TABLE objectsphere_event_type ADD CONSTRAINT objectsphere_event_type_status_check CHECK(status IN('active','disabled'));
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
    ALTER TABLE objectsphere_event ADD COLUMN IF NOT EXISTS reported_by_email text;
    ALTER TABLE objectsphere_event ADD COLUMN IF NOT EXISTS updated_by_email text;
    ALTER TABLE objectsphere_event ADD COLUMN IF NOT EXISTS deleted boolean NOT NULL DEFAULT false;
    ALTER TABLE objectsphere_event ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
    ALTER TABLE objectsphere_event DROP CONSTRAINT IF EXISTS objectsphere_event_severity_check;
    ALTER TABLE objectsphere_event ADD CONSTRAINT objectsphere_event_severity_check CHECK(severity IN('low','medium','high','critical'));
    ALTER TABLE objectsphere_event DROP CONSTRAINT IF EXISTS objectsphere_event_status_check;
    ALTER TABLE objectsphere_event ADD CONSTRAINT objectsphere_event_status_check CHECK(status IN('open','in_review','resolved','closed'));
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
  `});
  await seedReferenceCatalog(ctx);
  await seedReferenceEventCatalog(ctx);
}

async function seedReferenceCatalog(ctx){
  await ctx.broker('core_objectsphere','query',{
    text:`WITH payload AS (
            SELECT *
            FROM jsonb_to_recordset($1::jsonb) AS type_row(type_name text,type_description text,sort_order integer,attributes jsonb)
          ),
          upsert_types AS (
            INSERT INTO objectsphere_reference_object_type(type_name,type_description,sort_order,status)
            SELECT type_name,type_description,sort_order,'active' FROM payload
            ON CONFLICT(type_name) DO UPDATE
            SET type_description=excluded.type_description,sort_order=excluded.sort_order,status='active',updated_at=now()
            RETURNING reference_object_type_id,type_name
          ),
          all_types AS (
            SELECT reference_object_type_id,type_name FROM upsert_types
            UNION
            SELECT reference_object_type_id,type_name
            FROM objectsphere_reference_object_type
            WHERE type_name IN (SELECT type_name FROM payload)
          )
          INSERT INTO objectsphere_reference_attribute(reference_object_type_id,attribute_name,attribute_type,sort_order,status)
          SELECT t.reference_object_type_id,attr.attribute_name,attr.attribute_type,attr.sort_order,'active'
          FROM payload p
          JOIN all_types t ON t.type_name=p.type_name
          CROSS JOIN LATERAL jsonb_to_recordset(p.attributes) AS attr(attribute_name text,attribute_type text,sort_order integer)
          ON CONFLICT(reference_object_type_id,attribute_name) DO UPDATE
          SET attribute_type=excluded.attribute_type,sort_order=excluded.sort_order,status='active',updated_at=now()`,
    values:[JSON.stringify(referenceCatalog.map(type=>({
      ...type,
      attributes:type.attributes.map(([attribute_name,attribute_type,sort_order])=>({attribute_name,attribute_type,sort_order}))
    })))]
  });
}

async function seedReferenceEventCatalog(ctx){
  await ctx.broker('core_objectsphere','query',{
    text:`INSERT INTO objectsphere_reference_event_type(type_name,type_description,sort_order,default_severity,status)
          SELECT type_name,type_description,sort_order,default_severity,'active'
          FROM jsonb_to_recordset($1::jsonb) AS row(type_name text,type_description text,sort_order integer,default_severity text)
          ON CONFLICT(type_name) DO UPDATE
          SET type_description=excluded.type_description,
              sort_order=excluded.sort_order,
              default_severity=excluded.default_severity,
              status='active',
              updated_at=now()`,
    values:[JSON.stringify(referenceEventCatalog.map(([type_name,type_description,sort_order,default_severity])=>({
      type_name,
      type_description,
      sort_order,
      default_severity
    })))]
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
  return {auth,tenantId,role:access.rows[0].tenant_user_type};
}

function clean(value){
  const text=String(value||'').trim();
  return text||null;
}

function quantity(value){
  const parsed=Number.parseInt(value,10);
  return Number.isFinite(parsed)&&parsed>0?parsed:null;
}

module.exports={ensureSchema,authTenant,clean,quantity};
