"use strict";

const fs = require("fs");
const path = require("path");
const { isAdministrator } = require("./access");

function contentRoot() {
  return process.env.CONTENT_ROOT || path.resolve(__dirname, "..", "..", "..");
}

function templateSeedPath() {
  return path.join(contentRoot(), "seeds", "template-defaults.json");
}

function loadTemplateDefaults() {
  return JSON.parse(fs.readFileSync(templateSeedPath(), "utf8"));
}

async function seedTaxTypes(ctx, access, organisationId, taxTypeSeeds) {
  for (const taxType of taxTypeSeeds) {
    const saved = await ctx.broker("core_erp", "query", {
      text: `INSERT INTO erp_tax_type(tenant_id,organisation_id,tax_type_code,tax_type_description,tax_direction,is_active,is_seeded)
            VALUES($1,$2,$3,$4,$5,true,true)
            ON CONFLICT(tenant_id,organisation_id,tax_type_code) DO UPDATE
            SET tax_type_description=excluded.tax_type_description,
                tax_direction=excluded.tax_direction,
                is_active=true,
                is_seeded=true,
                updated_at=now()
            RETURNING tax_type_id`,
      values: [
        access.tenantId,
        organisationId,
        taxType.code,
        taxType.description,
        taxType.direction || "none",
      ],
    });
    const taxTypeId = saved.rows[0].tax_type_id;
    await ctx.broker("core_erp", "query", {
      text: `INSERT INTO erp_tax_rate(tenant_id,organisation_id,tax_type_id,tax_rate,valid_from,valid_to,is_active,is_seeded)
            SELECT $1,$2,$3,tax_rate,valid_from,valid_to,true,true
            FROM jsonb_to_recordset($4::jsonb)
            AS row(tax_rate numeric,valid_from date,valid_to date)
            ON CONFLICT(tax_type_id,valid_from) DO UPDATE
            SET tax_rate=excluded.tax_rate,
                valid_to=excluded.valid_to,
                is_active=true,
                is_seeded=true,
                updated_at=now()`,
      values: [
        access.tenantId,
        organisationId,
        taxTypeId,
        JSON.stringify(
          taxType.rates.map((rate) => ({
            tax_rate: rate.rate,
            valid_from: rate.valid_from,
            valid_to: rate.valid_to,
          })),
        ),
      ],
    });
  }
}

async function seedTemplateResourceDefaults(ctx, access, organisationId) {
  const {
    resourceRoleSeeds = [],
    resourceRoleModuleSeeds = {},
    resourceRoleTypeMappings = [],
    moduleMappings = {},
  } = loadTemplateDefaults();
  await ctx.broker("core_erp", "query", {
    text: `WITH default_path AS (
            SELECT workflow_path_id FROM erp_workflow_path
            WHERE tenant_id=$1 AND organisation_id=$2 AND path_name='Default workflow'
          )
          INSERT INTO erp_accounting_object_type(tenant_id,organisation_id,type_code,type_name,type_description,workflow_path_id,schema_json,ui_schema_json,is_seeded,is_active)
          SELECT $1,$2,'team','Team','',default_path.workflow_path_id,
                 '{"type":"object","properties":{},"required":[],"additionalProperties":false}'::jsonb,
                 '{"sections":[]}'::jsonb,true,true
          FROM default_path
          ON CONFLICT(tenant_id,organisation_id,type_code) DO NOTHING`,
    values: [access.tenantId, organisationId],
  });
  const teamModules = moduleMappings.accountingObjectTypes?.team || [];
  if (teamModules.length) {
    await ctx.broker("core_erp", "query", {
      text: `INSERT INTO erp_accounting_object_type_module(accounting_object_type_id,module_id)
            SELECT type.accounting_object_type_id,module.module_id
            FROM erp_accounting_object_type type
            JOIN erp_module module ON module.tenant_id=$1 AND module.organisation_id=$2
              AND module.module_code=ANY($3::text[])
            WHERE type.tenant_id=$1 AND type.organisation_id=$2 AND type.type_code='team'
            ON CONFLICT DO NOTHING`,
      values: [access.tenantId, organisationId, teamModules],
    });
  }
  await ctx.broker("core_erp", "query", {
    text: `INSERT INTO erp_resource_role(tenant_id,organisation_id,role_code,role_name,is_active,is_seeded)
          SELECT $1,$2,role_code,role_name,true,true
          FROM jsonb_to_recordset($3::jsonb) AS row(role_code text,role_name text)
          ON CONFLICT(tenant_id,organisation_id,role_code) DO NOTHING`,
    values: [
      access.tenantId,
      organisationId,
      JSON.stringify(
        resourceRoleSeeds.map(([role_code, role_name]) => ({
          role_code,
          role_name,
        })),
      ),
    ],
  });
  await ctx.broker("core_erp", "query", {
    text: `WITH payload AS (
            SELECT * FROM jsonb_to_recordset($3::jsonb) AS row(role_code text,module_code text)
          )
          INSERT INTO erp_resource_role_module(resource_role_id,module_id)
          SELECT role.resource_role_id,module.module_id
          FROM payload
          JOIN erp_resource_role role ON role.tenant_id=$1 AND role.organisation_id=$2 AND role.role_code=payload.role_code
          JOIN erp_module module ON module.tenant_id=$1 AND module.organisation_id=$2 AND module.module_code=payload.module_code
          ON CONFLICT DO NOTHING`,
    values: [
      access.tenantId,
      organisationId,
      JSON.stringify(
        Object.entries(resourceRoleModuleSeeds).flatMap(
          ([role_code, moduleCodes]) =>
            moduleCodes.map((module_code) => ({ role_code, module_code })),
        ),
      ),
    ],
  });
  await ctx.broker("core_erp", "query", {
    text: `WITH payload AS (
            SELECT * FROM jsonb_to_recordset($3::jsonb)
            AS row(object_kind text,type_code text,role_code text,is_required boolean)
          ), types AS (
            SELECT 'gl_account'::text object_kind,type_code,gl_account_type_id object_type_id
            FROM erp_gl_account_type WHERE tenant_id=$1 AND organisation_id=$2
            UNION ALL
            SELECT 'subledger_account',type_code,subledger_account_type_id
            FROM erp_subledger_account_type WHERE tenant_id=$1 AND organisation_id=$2
            UNION ALL
            SELECT 'accounting_object',type_code,accounting_object_type_id
            FROM erp_accounting_object_type WHERE tenant_id=$1 AND organisation_id=$2
            UNION ALL
            SELECT 'accounting_dimension',type_code,accounting_dimension_type_id
            FROM erp_accounting_dimension_type WHERE tenant_id=$1 AND organisation_id=$2
          )
          INSERT INTO erp_object_type_resource_role(tenant_id,organisation_id,object_kind,object_type_id,resource_role_id,is_required)
          SELECT $1,$2,payload.object_kind,types.object_type_id,role.resource_role_id,payload.is_required
          FROM payload
          JOIN types ON types.object_kind=payload.object_kind AND types.type_code=payload.type_code
          JOIN erp_resource_role role ON role.tenant_id=$1 AND role.organisation_id=$2 AND role.role_code=payload.role_code
          ON CONFLICT(tenant_id,organisation_id,object_kind,object_type_id,resource_role_id) DO NOTHING`,
    values: [
      access.tenantId,
      organisationId,
      JSON.stringify(
        resourceRoleTypeMappings.map(
          ([object_kind, type_code, role_code, is_required]) => ({
            object_kind,
            type_code,
            role_code,
            is_required,
          }),
        ),
      ),
    ],
  });
}

async function seedOrganisationDefaults(ctx, access, organisationId) {
  const {
    currencies,
    taxTypeSeeds,
    countries,
    ledgerFamilies,
    ledgerFamilySchemas,
    accountingObjectTypeMetadata = {},
    glAccountTypeSeeds,
    accountingObjectTypeSeeds,
    accountingDimensionTypeSeeds,
    accountingDimensionSeeds = [],
    accountingObjectSeeds = [],
    legalEntitySeeds = [],
    subledgerAccountSeeds = [],
    municipalLineClassificationSeeds = [],
    ledgerTypeSeeds,
    chartTemplate,
    transactionGroups,
    transactionTypes,
    lineDefinitionSeeds,
    customerSchema,
    customerUiSchema,
    roleSeeds,
    roleModuleSeeds = {},
    rolePermissionSeeds,
    resourceRoleSeeds = [],
    resourceRoleModuleSeeds = {},
    resourceRoleTypeMappings = [],
    moduleSeeds = [],
    moduleMappings = {},
  } = loadTemplateDefaults();
  const org = await ctx.broker("core_erp", "query", {
    text: `SELECT is_template FROM erp_organisation WHERE tenant_id=$1 AND organisation_id=$2 AND workflow_status <> 'deleted'`,
    values: [access.tenantId, organisationId],
  });
  if (!org.rows[0]?.is_template) return;
  await ctx.broker("core_erp", "query", {
    text: `INSERT INTO erp_module(tenant_id,organisation_id,module_code,module_name,module_icon_svg,sort_order,is_seeded,is_active)
          SELECT $1,$2,module_code,module_name,module_icon_svg,sort_order,true,true
          FROM jsonb_to_recordset($3::jsonb) AS row(module_code text,module_name text,sort_order integer,module_icon_svg text)
          ON CONFLICT(tenant_id,organisation_id,module_code) DO UPDATE
          SET module_name=excluded.module_name,module_icon_svg=excluded.module_icon_svg,sort_order=excluded.sort_order,is_seeded=true,is_active=true,updated_at=now()`,
    values: [
      access.tenantId,
      organisationId,
      JSON.stringify(
        moduleSeeds.map(
          ([module_code, module_name, sort_order, module_icon_svg = ""]) => ({
            module_code,
            module_name,
            sort_order,
            module_icon_svg,
          }),
        ),
      ),
    ],
  });
  await ctx.broker("core_erp", "query", {
    text: `INSERT INTO erp_currency(tenant_id,organisation_id,currency_code,currency_name,decimal_places,is_seeded,is_active)
          SELECT $1,$2,currency_code,currency_name,decimal_places,true,true
          FROM jsonb_to_recordset($3::jsonb)
          AS row(currency_code text,currency_name text,decimal_places integer,is_seeded boolean)
          ON CONFLICT(tenant_id,organisation_id,currency_code) DO UPDATE
          SET currency_name=excluded.currency_name,
              decimal_places=excluded.decimal_places,
              is_seeded=true,
              is_active=true,
              updated_at=now()`,
    values: [
      access.tenantId,
      organisationId,
      JSON.stringify(
        currencies.map(
          ([currency_code, currency_name, decimal_places, is_seeded]) => ({
            currency_code,
            currency_name,
            decimal_places,
            is_seeded,
          }),
        ),
      ),
    ],
  });
  await ctx.broker("core_erp", "query", {
    text: `INSERT INTO erp_country(tenant_id,organisation_id,country_code,alpha3_code,numeric_code,country_name,official_name,region,subregion,default_currency_code,calling_code,postal_code_required,administrative_level_label,is_seeded,is_active)
          SELECT $1,$2,country_code,alpha3_code,numeric_code,country_name,official_name,region,subregion,default_currency_code,calling_code,postal_code_required,administrative_level_label,true,true
          FROM jsonb_to_recordset($3::jsonb)
          AS row(country_code text,alpha3_code text,numeric_code text,country_name text,official_name text,region text,subregion text,default_currency_code text,calling_code text,postal_code_required boolean,administrative_level_label text)
          ON CONFLICT(tenant_id,organisation_id,country_code) DO UPDATE
          SET alpha3_code=excluded.alpha3_code,
              numeric_code=excluded.numeric_code,
              country_name=excluded.country_name,
              official_name=excluded.official_name,
              region=excluded.region,
              subregion=excluded.subregion,
              default_currency_code=excluded.default_currency_code,
              calling_code=excluded.calling_code,
              postal_code_required=excluded.postal_code_required,
              administrative_level_label=excluded.administrative_level_label,
              is_seeded=true,
              is_active=true,
              updated_at=now()`,
    values: [
      access.tenantId,
      organisationId,
      JSON.stringify(
        countries.map(
          ([
            country_code,
            alpha3_code,
            numeric_code,
            country_name,
            official_name,
            region,
            subregion,
            default_currency_code,
            calling_code,
            postal_code_required,
            administrative_level_label,
          ]) => ({
            country_code,
            alpha3_code,
            numeric_code,
            country_name,
            official_name,
            region,
            subregion,
            default_currency_code,
            calling_code,
            postal_code_required,
            administrative_level_label,
          }),
        ),
      ),
    ],
  });
  await seedTaxTypes(ctx, access, organisationId, taxTypeSeeds);
  await ctx.broker("core_erp", "query", {
    text: `INSERT INTO erp_gl_account_type(tenant_id,organisation_id,type_code,type_name,is_required,is_seeded,is_active)
          SELECT $1,$2,type_code,type_name,is_required,true,true
          FROM jsonb_to_recordset($3::jsonb)
          AS row(type_code text,type_name text,is_required boolean)
          ON CONFLICT(tenant_id,organisation_id,type_code) DO UPDATE
          SET type_name=excluded.type_name,
              is_required=excluded.is_required,
              is_seeded=true,
              is_active=true,
              updated_at=now()`,
    values: [
      access.tenantId,
      organisationId,
      JSON.stringify(
        glAccountTypeSeeds.map(([type_code, type_name, is_required]) => ({
          type_code,
          type_name,
          is_required,
        })),
      ),
    ],
  });
  await ctx.broker("core_erp", "query", {
    text: `INSERT INTO erp_subledger_account_type(tenant_id,organisation_id,type_code,type_name,type_description,requires_legal_entity,schema_json,ui_schema_json,is_seeded,is_active)
          SELECT $1,$2,ledger_family_code,family_name,'',requires_legal_entity,schema_json,'{}'::jsonb,true,true
          FROM jsonb_to_recordset($3::jsonb)
          AS row(ledger_family_code text,family_name text,requires_standard_account_type boolean,requires_legal_entity boolean,schema_json jsonb)
          ON CONFLICT(tenant_id,organisation_id,type_code) DO UPDATE
          SET type_name=excluded.type_name,
              type_description=excluded.type_description,
              requires_legal_entity=excluded.requires_legal_entity,
              schema_json=excluded.schema_json,
              ui_schema_json=excluded.ui_schema_json,
              is_seeded=true,
              is_active=true,
              updated_at=now()`,
    values: [
      access.tenantId,
      organisationId,
      JSON.stringify(
        ledgerFamilies
          .filter(([type_code]) => type_code !== "gl")
          .map(
            ([
              ledger_family_code,
              family_name,
              requires_standard_account_type,
              requires_legal_entity,
            ]) => ({
              ledger_family_code,
              family_name,
              requires_standard_account_type,
              requires_legal_entity,
              schema_json: ledgerFamilySchemas[ledger_family_code] || {},
            }),
          ),
      ),
    ],
  });
  await ctx.broker("core_erp", "query", {
    text: `WITH path AS (
            INSERT INTO erp_workflow_path(tenant_id,organisation_id,path_name,initial_step_code,is_active,is_seeded)
            VALUES($1,$2,'Default workflow','draft',true,true)
            ON CONFLICT(tenant_id,organisation_id,path_name) DO UPDATE
            SET initial_step_code=excluded.initial_step_code,is_active=true,is_seeded=true,updated_at=now()
            RETURNING workflow_path_id
          ),
          steps AS (
            INSERT INTO erp_workflow_step(tenant_id,organisation_id,workflow_path_id,step_code,step_label,colour,sort_order)
            SELECT $1,$2,path.workflow_path_id,step.step_code,step.step_label,step.colour,step.sort_order
            FROM path
            CROSS JOIN (VALUES
              ('draft','Draft','#475467',10),
              ('submitted','Submitted','#4f46e5',20),
              ('approved','Approved','#2f7d68',30),
              ('rejected','Rejected','#b42318',40),
              ('blocked','Blocked','#a15c07',50),
              ('archived','Archived','#667085',60),
              ('deleted','Deleted','#344054',70)
            ) AS step(step_code,step_label,colour,sort_order)
            ON CONFLICT(workflow_path_id,step_code) DO UPDATE
            SET step_label=excluded.step_label,colour=excluded.colour,sort_order=excluded.sort_order,updated_at=now()
          )
          INSERT INTO erp_workflow_next(tenant_id,organisation_id,workflow_path_id,current_step_code,next_step_code)
          SELECT $1,$2,path.workflow_path_id,next.current_step_code,next.next_step_code
          FROM path
          CROSS JOIN (VALUES
            ('draft','submitted'),('draft','deleted'),('submitted','approved'),('submitted','rejected'),('submitted','blocked'),
            ('rejected','submitted'),('rejected','blocked'),('rejected','deleted'),('approved','blocked'),('approved','archived'),
            ('blocked','approved'),('blocked','archived')
          ) AS next(current_step_code,next_step_code)
          ON CONFLICT(workflow_path_id,current_step_code,next_step_code) DO NOTHING`,
    values: [access.tenantId, organisationId],
  });
  await ctx.broker("core_erp", "query", {
    text: `WITH default_path AS (
            SELECT workflow_path_id FROM erp_workflow_path WHERE tenant_id=$1 AND organisation_id=$2 AND path_name='Default workflow'
          )
          UPDATE erp_subledger_account_type type
          SET workflow_path_id=default_path.workflow_path_id
          FROM default_path
          WHERE type.tenant_id=$1 AND type.organisation_id=$2 AND type.workflow_path_id IS NULL`,
    values: [access.tenantId, organisationId],
  });
  await ctx.broker("core_erp", "query", {
    text: `WITH default_path AS (
            SELECT workflow_path_id FROM erp_workflow_path WHERE tenant_id=$1 AND organisation_id=$2 AND path_name='Default workflow'
          )
          INSERT INTO erp_accounting_object_type(tenant_id,organisation_id,type_code,type_name,type_description,workflow_path_id,schema_json,ui_schema_json,is_seeded,is_active)
          SELECT $1,$2,type_code,type_name,'',default_path.workflow_path_id,schema_json,ui_schema_json,true,true
          FROM jsonb_to_recordset($3::jsonb)
          AS row(type_code text,type_name text,schema_json jsonb,ui_schema_json jsonb)
          CROSS JOIN default_path
          ON CONFLICT(tenant_id,organisation_id,type_code) DO UPDATE
          SET type_name=excluded.type_name,
              type_description=excluded.type_description,
              workflow_path_id=excluded.workflow_path_id,
              schema_json=excluded.schema_json,
              ui_schema_json=excluded.ui_schema_json,
              is_seeded=true,
              is_active=true,
              updated_at=now()`,
    values: [
      access.tenantId,
      organisationId,
      JSON.stringify(
        accountingObjectTypeSeeds.map(([type_code, type_name]) => ({
          type_code,
          type_name,
          schema_json: accountingObjectTypeMetadata[type_code]?.schema_json || {
            type: "object",
            properties: {},
            required: [],
            additionalProperties: false,
          },
          ui_schema_json: accountingObjectTypeMetadata[type_code]
            ?.ui_schema_json || { sections: [] },
        })),
      ),
    ],
  });
  await ctx.broker("core_erp", "query", {
    text: `WITH default_path AS (
            SELECT workflow_path_id FROM erp_workflow_path WHERE tenant_id=$1 AND organisation_id=$2 AND path_name='Default workflow'
          )
          INSERT INTO erp_accounting_dimension_type(tenant_id,organisation_id,type_code,type_name,type_description,workflow_path_id,schema_json,ui_schema_json,is_seeded,is_active)
          SELECT $1,$2,type_code,type_name,'',default_path.workflow_path_id,'{}'::jsonb,'{}'::jsonb,true,true
          FROM jsonb_to_recordset($3::jsonb)
          AS row(type_code text,type_name text)
          CROSS JOIN default_path
          ON CONFLICT(tenant_id,organisation_id,type_code) DO UPDATE
          SET type_name=excluded.type_name,
              type_description=excluded.type_description,
              workflow_path_id=excluded.workflow_path_id,
              is_seeded=true,
              is_active=true,
              updated_at=now()`,
    values: [
      access.tenantId,
      organisationId,
      JSON.stringify(
        accountingDimensionTypeSeeds.map(([type_code, type_name]) => ({
          type_code,
          type_name,
        })),
      ),
    ],
  });
  await ctx.broker("core_erp", "query", {
    text: `WITH root AS (
            SELECT division_id FROM erp_division
            WHERE tenant_id=$1 AND organisation_id=$2 AND parent_division_id IS NULL AND workflow_status <> 'deleted'
            ORDER BY created_at LIMIT 1
          ),
          payload AS (
            SELECT * FROM jsonb_to_recordset($3::jsonb)
            AS row(type_code text,dimension_code text,dimension_name text)
          )
          INSERT INTO erp_accounting_dimension(tenant_id,organisation_id,owner_division_id,accounting_dimension_type_id,dimension_code,dimension_name,workflow_status,created_by_email,updated_by_email,approved_by_email,approved_at)
          SELECT $1,$2,root.division_id,type.accounting_dimension_type_id,p.dimension_code,p.dimension_name,'approved',$4,$4,$4,now()
          FROM payload p
          CROSS JOIN root
          JOIN erp_accounting_dimension_type type ON type.tenant_id=$1 AND type.organisation_id=$2 AND type.type_code=p.type_code
          ON CONFLICT(tenant_id,organisation_id,accounting_dimension_type_id,dimension_code) DO UPDATE
          SET dimension_name=excluded.dimension_name,workflow_status='approved',updated_by_email=$4,updated_at=now()`,
    values: [
      access.tenantId,
      organisationId,
      JSON.stringify(
        accountingDimensionSeeds.map(
          ([type_code, dimension_code, dimension_name]) => ({
            type_code,
            dimension_code,
            dimension_name,
          }),
        ),
      ),
      access.auth.email,
    ],
  });
  await ctx.broker("core_erp", "query", {
    text: `WITH root AS (
            SELECT division_id FROM erp_division WHERE tenant_id=$1 AND organisation_id=$2 AND parent_division_id IS NULL AND workflow_status<>'deleted' ORDER BY created_at LIMIT 1
          ), payload AS (
            SELECT * FROM jsonb_to_recordset($3::jsonb) AS row(type_code text,object_code text,object_name text)
          )
          INSERT INTO erp_accounting_object(tenant_id,organisation_id,owner_division_id,accounting_object_type_id,object_code,object_name,workflow_status,created_by_email,updated_by_email,approved_by_email,approved_at)
          SELECT $1,$2,root.division_id,type.accounting_object_type_id,p.object_code,p.object_name,'approved',$4,$4,$4,now()
          FROM payload p CROSS JOIN root JOIN erp_accounting_object_type type ON type.tenant_id=$1 AND type.organisation_id=$2 AND type.type_code=p.type_code
          ON CONFLICT(tenant_id,organisation_id,accounting_object_type_id,object_code) DO UPDATE SET object_name=excluded.object_name,workflow_status='approved',updated_by_email=$4,updated_at=now()`,
    values: [
      access.tenantId,
      organisationId,
      JSON.stringify(
        accountingObjectSeeds.map(([type_code, object_code, object_name]) => ({
          type_code,
          object_code,
          object_name,
        })),
      ),
      access.auth.email,
    ],
  });
  await ctx.broker("core_erp", "query", {
    text: `WITH payload AS (SELECT * FROM jsonb_to_recordset($3::jsonb) AS row(entity_type text,legal_name text,known_name text))
          INSERT INTO erp_legal_entity(tenant_id,organisation_id,entity_type,legal_name,known_name,workflow_status,created_by_email,updated_by_email,approved_by_email,approved_at)
          SELECT $1,$2,p.entity_type,p.legal_name,p.known_name,'approved',$4,$4,$4,now() FROM payload p
          ON CONFLICT(tenant_id,organisation_id,(lower(known_name))) WHERE workflow_status<>'deleted' DO UPDATE SET legal_name=excluded.legal_name,entity_type=excluded.entity_type,workflow_status='approved',updated_by_email=$4,updated_at=now()`,
    values: [
      access.tenantId,
      organisationId,
      JSON.stringify(
        legalEntitySeeds.map(([entity_type, legal_name, known_name]) => ({
          entity_type,
          legal_name,
          known_name,
        })),
      ),
      access.auth.email,
    ],
  });
  await ctx.broker("core_erp", "query", {
    text: `WITH root AS (
            SELECT division_id FROM erp_division WHERE tenant_id=$1 AND organisation_id=$2 AND parent_division_id IS NULL AND workflow_status<>'deleted' ORDER BY created_at LIMIT 1
          ), payload AS (
            SELECT * FROM jsonb_to_recordset($3::jsonb) AS row(type_code text,account_code text,account_name text,legal_entity_name text)
          )
          INSERT INTO erp_subledger_account(tenant_id,organisation_id,owner_division_id,subledger_account_type_id,legal_entity_id,account_code,account_name,workflow_status,created_by_email,updated_by_email,approved_by_email,approved_at)
          SELECT $1,$2,root.division_id,type.subledger_account_type_id,entity.legal_entity_id,p.account_code,p.account_name,'approved',$4,$4,$4,now()
          FROM payload p CROSS JOIN root
          JOIN erp_subledger_account_type type ON type.tenant_id=$1 AND type.organisation_id=$2 AND type.type_code=p.type_code
          LEFT JOIN erp_legal_entity entity ON entity.tenant_id=$1 AND entity.organisation_id=$2 AND entity.known_name=p.legal_entity_name AND entity.workflow_status<>'deleted'
          ON CONFLICT(tenant_id,organisation_id,subledger_account_type_id,account_code) DO UPDATE SET account_name=excluded.account_name,legal_entity_id=excluded.legal_entity_id,workflow_status='approved',updated_by_email=$4,updated_at=now()`,
    values: [
      access.tenantId,
      organisationId,
      JSON.stringify(
        subledgerAccountSeeds.map(
          ([type_code, account_code, account_name, legal_entity_name]) => ({
            type_code,
            account_code,
            account_name,
            legal_entity_name,
          }),
        ),
      ),
      access.auth.email,
    ],
  });
  await ctx.broker("core_erp", "query", {
    text: `WITH type_rows AS (
            SELECT gl_account_type_id,type_code FROM erp_gl_account_type WHERE tenant_id=$1 AND organisation_id=$2
          ),
          payload AS (
            SELECT * FROM jsonb_to_recordset($3::jsonb)
            AS row(account_code text,account_name text,account_type_code text,requires_subledger boolean,required_subledger_type_code text)
          )
          INSERT INTO erp_gl_account(tenant_id,organisation_id,account_code,account_name,gl_account_type_id,requires_subledger,required_subledger_account_type_id,workflow_status,created_by_email,updated_by_email,approved_by_email,approved_at)
          SELECT $1,$2,p.account_code,p.account_name,t.gl_account_type_id,p.requires_subledger,st.subledger_account_type_id,'approved',$4,$4,$4,now()
          FROM payload p JOIN type_rows t ON t.type_code=p.account_type_code
          LEFT JOIN erp_subledger_account_type st ON st.tenant_id=$1 AND st.organisation_id=$2 AND st.type_code=p.required_subledger_type_code
          ON CONFLICT(tenant_id,organisation_id,account_code) DO UPDATE
          SET account_name=excluded.account_name,
              gl_account_type_id=excluded.gl_account_type_id,
              requires_subledger=excluded.requires_subledger,
              required_subledger_account_type_id=excluded.required_subledger_account_type_id,
              workflow_status='approved',
              updated_by_email=$4,
              updated_at=now()`,
    values: [
      access.tenantId,
      organisationId,
      JSON.stringify(
        chartTemplate.map(
          ([
            account_code,
            account_name,
            account_type_code,
            requires_subledger,
            required_subledger_type_code,
          ]) => ({
            account_code,
            account_name,
            account_type_code,
            requires_subledger,
            required_subledger_type_code,
          }),
        ),
      ),
      access.auth.email,
    ],
  });
  await ctx.broker("core_erp", "query", {
    text: `UPDATE erp_gl_account
          SET requires_subledger=true,
              required_subledger_account_type_id=(SELECT subledger_account_type_id FROM erp_subledger_account_type WHERE tenant_id=$1 AND organisation_id=$2 AND type_code='cash_point'),
              updated_by_email=$3,
              updated_at=now()
          WHERE tenant_id=$1
            AND organisation_id=$2
            AND account_code='1000'
            AND workflow_status <> 'deleted'`,
    values: [access.tenantId, organisationId, access.auth.email],
  });
  await seedFinancialStatementFormats(ctx, access, organisationId);
  await ctx.broker("core_erp", "query", {
    text: `INSERT INTO erp_transaction_group(tenant_id,organisation_id,group_code,group_name,sort_order,is_active)
          SELECT $1,$2,group_code,group_name,sort_order,true
          FROM jsonb_to_recordset($3::jsonb) AS row(group_code text,group_name text,sort_order integer)
          ON CONFLICT(tenant_id,organisation_id,group_code) DO UPDATE
          SET group_name=excluded.group_name,sort_order=excluded.sort_order,is_active=true`,
    values: [
      access.tenantId,
      organisationId,
      JSON.stringify(
        transactionGroups.map(([group_code, group_name, sort_order]) => ({
          group_code,
          group_name,
          sort_order,
        })),
      ),
    ],
  });
  await ctx.broker("core_erp", "query", {
    text: `WITH payload AS (
            SELECT * FROM jsonb_to_recordset($3::jsonb)
            AS row(type_code text,group_code text,type_name text,type_description text,sort_order integer,allow_additional_lines boolean)
          )
          INSERT INTO erp_transaction_type(tenant_id,organisation_id,transaction_group_id,type_code,type_name,type_description,is_financial,allow_additional_lines,sort_order,is_active)
          SELECT $1,$2,g.transaction_group_id,p.type_code,p.type_name,p.type_description,true,COALESCE(p.allow_additional_lines,true),p.sort_order,true
          FROM payload p JOIN erp_transaction_group g ON g.tenant_id=$1 AND g.organisation_id=$2 AND g.group_code=p.group_code
          ON CONFLICT(tenant_id,organisation_id,type_code) DO UPDATE
          SET transaction_group_id=excluded.transaction_group_id,type_name=excluded.type_name,type_description=excluded.type_description,is_financial=true,allow_additional_lines=true,sort_order=excluded.sort_order,is_active=true`,
    values: [
      access.tenantId,
      organisationId,
      JSON.stringify(
        transactionTypes.map(
          ([
            type_code,
            group_code,
            type_name,
            type_description,
            sort_order,
            allow_additional_lines = true,
          ]) => ({
            type_code,
            group_code,
            type_name,
            type_description,
            sort_order,
            allow_additional_lines,
          }),
        ),
      ),
    ],
  });
  const mappingRows = (mapping) =>
    Object.entries(mapping || {}).flatMap(([object_code, moduleCodes]) =>
      moduleCodes.map((module_code) => ({ object_code, module_code })),
    );
  await ctx.broker("core_erp", "query", {
    text: `WITH payload AS (SELECT * FROM jsonb_to_recordset($3::jsonb) AS row(object_code text,module_code text))
          INSERT INTO erp_subledger_account_type_module(subledger_account_type_id,module_id)
          SELECT t.subledger_account_type_id,m.module_id FROM payload p
          JOIN erp_module m ON m.tenant_id=$1 AND m.organisation_id=$2 AND m.module_code=p.module_code
          JOIN erp_subledger_account_type t ON t.tenant_id=$1 AND t.organisation_id=$2 AND t.type_code=p.object_code
          ON CONFLICT DO NOTHING`,
    values: [
      access.tenantId,
      organisationId,
      JSON.stringify(mappingRows(moduleMappings.ledgerFamilies)),
    ],
  });
  await ctx.broker("core_erp", "query", {
    text: `WITH payload AS (SELECT * FROM jsonb_to_recordset($3::jsonb) AS row(object_code text,module_code text))
          INSERT INTO erp_accounting_object_type_module(accounting_object_type_id,module_id)
          SELECT t.accounting_object_type_id,m.module_id FROM payload p
          JOIN erp_module m ON m.tenant_id=$1 AND m.organisation_id=$2 AND m.module_code=p.module_code
          JOIN erp_accounting_object_type t ON t.tenant_id=$1 AND t.organisation_id=$2 AND t.type_code=p.object_code
          ON CONFLICT DO NOTHING`,
    values: [
      access.tenantId,
      organisationId,
      JSON.stringify(mappingRows(moduleMappings.accountingObjectTypes)),
    ],
  });
  await ctx.broker("core_erp", "query", {
    text: `WITH payload AS (SELECT * FROM jsonb_to_recordset($3::jsonb) AS row(object_code text,module_code text))
          INSERT INTO erp_accounting_dimension_type_module(accounting_dimension_type_id,module_id)
          SELECT t.accounting_dimension_type_id,m.module_id FROM payload p
          JOIN erp_module m ON m.tenant_id=$1 AND m.organisation_id=$2 AND m.module_code=p.module_code
          JOIN erp_accounting_dimension_type t ON t.tenant_id=$1 AND t.organisation_id=$2 AND t.type_code=p.object_code
          ON CONFLICT DO NOTHING`,
    values: [
      access.tenantId,
      organisationId,
      JSON.stringify(mappingRows(moduleMappings.accountingDimensionTypes)),
    ],
  });
  const transactionModuleRows = transactionTypes.flatMap(
    ([type_code, group_code]) =>
      [
        ...new Set([
          ...(moduleMappings.transactionGroups?.[group_code] || []),
          ...(moduleMappings.transactionTypeAdditions?.[type_code] || []),
        ]),
      ].map((module_code) => ({ object_code: type_code, module_code })),
  );
  await ctx.broker("core_erp", "query", {
    text: `WITH payload AS (SELECT * FROM jsonb_to_recordset($3::jsonb) AS row(object_code text,module_code text))
          INSERT INTO erp_transaction_type_module(transaction_type_id,module_id)
          SELECT t.transaction_type_id,m.module_id FROM payload p
          JOIN erp_module m ON m.tenant_id=$1 AND m.organisation_id=$2 AND m.module_code=p.module_code
          JOIN erp_transaction_type t ON t.tenant_id=$1 AND t.organisation_id=$2 AND t.type_code=p.object_code
          ON CONFLICT DO NOTHING`,
    values: [
      access.tenantId,
      organisationId,
      JSON.stringify(transactionModuleRows),
    ],
  });
  const normalisedLineDefinitions = lineDefinitionSeeds.map(
    ([
      type_code,
      line_order,
      debit_credit,
      account_code,
      requires_subledger,
      subledger_type_code,
      line_description,
      occurrence = "required",
      line_code,
      amount_source = "manual",
    ]) => ({
      type_code,
      line_order,
      line_code: line_code || `${type_code}_${line_order}`,
      debit_credit,
      account_code,
      occurrence,
      subledger_requirement: requires_subledger ? "mandatory" : "not_used",
      subledger_type_code,
      line_description,
      amount_source,
    }),
  );
  await ctx.broker("core_erp", "query", {
    text: `WITH payload AS (
            SELECT * FROM jsonb_to_recordset($3::jsonb)
            AS row(type_code text,line_order integer,line_code text,debit_credit text,account_code text,occurrence text,subledger_requirement text,subledger_type_code text,line_description text,amount_source text)
          ),
          types AS (
            SELECT transaction_type_id,type_code
            FROM erp_transaction_type
            WHERE tenant_id=$1 AND organisation_id=$2
          ),
          accounts AS (
            SELECT gl_account_id,account_code
            FROM erp_gl_account
            WHERE tenant_id=$1 AND organisation_id=$2 AND workflow_status <> 'deleted'
          )
          INSERT INTO erp_transaction_line_definition(tenant_id,organisation_id,transaction_type_id,line_order,line_code,debit_credit,gl_account_id,occurrence,subledger_requirement,subledger_account_type_id,amount_source,line_description)
          SELECT $1,$2,t.transaction_type_id,p.line_order,p.line_code,p.debit_credit,a.gl_account_id,p.occurrence,p.subledger_requirement,st.subledger_account_type_id,p.amount_source,p.line_description
          FROM payload p
          JOIN types t ON t.type_code=p.type_code
          JOIN accounts a ON a.account_code=p.account_code
          LEFT JOIN erp_subledger_account_type st ON st.tenant_id=$1 AND st.organisation_id=$2 AND st.type_code=p.subledger_type_code
          ON CONFLICT(transaction_type_id,line_order) DO UPDATE
          SET line_code=excluded.line_code,
              debit_credit=excluded.debit_credit,
              gl_account_id=excluded.gl_account_id,
              occurrence=excluded.occurrence,
              subledger_requirement=excluded.subledger_requirement,
              subledger_account_type_id=excluded.subledger_account_type_id,
              amount_source=excluded.amount_source,
              line_description=excluded.line_description`,
    values: [
      access.tenantId,
      organisationId,
      JSON.stringify(normalisedLineDefinitions),
    ],
  });
  await ctx.broker("core_erp", "query", {
    text: `WITH payload AS (
            SELECT * FROM jsonb_to_recordset($3::jsonb)
            AS row(line_code text,service_code text,component_code text,requires_property boolean,requires_meter boolean,requires_cost_centre boolean)
          ),
          definitions AS (
            SELECT definition.transaction_line_definition_id,definition.line_code
            FROM erp_transaction_line_definition definition
            JOIN erp_transaction_type type ON type.transaction_type_id=definition.transaction_type_id
            WHERE definition.tenant_id=$1 AND definition.organisation_id=$2 AND type.type_code='municipal_services_invoice'
          ),
          object_requirements AS (
            INSERT INTO erp_transaction_line_definition_object_type(tenant_id,organisation_id,transaction_line_definition_id,accounting_object_type_id,requirement,value_behaviour,accounting_object_id,sort_order)
            SELECT $1,$2,definition.transaction_line_definition_id,type.accounting_object_type_id,'mandatory',requirement.value_behaviour,object.accounting_object_id,requirement.sort_order
            FROM payload p
            JOIN definitions definition ON definition.line_code=p.line_code
            CROSS JOIN LATERAL (VALUES ('property',p.requires_property,'captured',NULL::text,10),('utility_meter',p.requires_meter,'captured',NULL::text,20),('cost_centre',p.requires_cost_centre,'defaulted','FACILITIES',30)) requirement(type_code,enabled,value_behaviour,object_code,sort_order)
            JOIN erp_accounting_object_type type ON type.tenant_id=$1 AND type.organisation_id=$2 AND type.type_code=requirement.type_code
            LEFT JOIN erp_accounting_object object ON object.tenant_id=$1 AND object.organisation_id=$2 AND object.accounting_object_type_id=type.accounting_object_type_id AND object.object_code=requirement.object_code
            WHERE requirement.enabled
            ON CONFLICT(transaction_line_definition_id,accounting_object_type_id) DO UPDATE
            SET requirement=excluded.requirement,value_behaviour=excluded.value_behaviour,accounting_object_id=excluded.accounting_object_id,sort_order=excluded.sort_order
          )
          INSERT INTO erp_transaction_line_definition_dimension_type(tenant_id,organisation_id,transaction_line_definition_id,accounting_dimension_type_id,requirement,value_behaviour,accounting_dimension_id,sort_order)
          SELECT $1,$2,definition.transaction_line_definition_id,type.accounting_dimension_type_id,'mandatory','fixed',dimension.accounting_dimension_id,requirement.sort_order
          FROM payload p
          JOIN definitions definition ON definition.line_code=p.line_code
          CROSS JOIN LATERAL (VALUES ('service',p.service_code,10),('charge_component',p.component_code,20)) requirement(type_code,dimension_code,sort_order)
          JOIN erp_accounting_dimension_type type ON type.tenant_id=$1 AND type.organisation_id=$2 AND type.type_code=requirement.type_code
          JOIN erp_accounting_dimension dimension ON dimension.tenant_id=$1 AND dimension.organisation_id=$2 AND dimension.accounting_dimension_type_id=type.accounting_dimension_type_id AND dimension.dimension_code=requirement.dimension_code
          ON CONFLICT(transaction_line_definition_id,accounting_dimension_type_id) DO UPDATE
          SET requirement=excluded.requirement,value_behaviour=excluded.value_behaviour,accounting_dimension_id=excluded.accounting_dimension_id,sort_order=excluded.sort_order`,
    values: [
      access.tenantId,
      organisationId,
      JSON.stringify(
        municipalLineClassificationSeeds.map(
          ([
            line_code,
            service_code,
            component_code,
            requires_property,
            requires_meter,
            requires_cost_centre,
          ]) => ({
            line_code,
            service_code,
            component_code,
            requires_property,
            requires_meter,
            requires_cost_centre,
          }),
        ),
      ),
    ],
  });
  await ctx.broker("core_erp", "query", {
    text: `INSERT INTO erp_role(tenant_id,organisation_id,role_code,role_name,role_description,is_admin,is_active)
          SELECT $1,$2,role_code,role_name,role_description,is_admin,true
          FROM jsonb_to_recordset($3::jsonb)
          AS row(role_code text,role_name text,role_description text,is_admin boolean)
          ON CONFLICT(tenant_id,organisation_id,role_code) DO UPDATE
          SET role_name=excluded.role_name,
              role_description=excluded.role_description,
              is_admin=excluded.is_admin,
              is_active=true`,
    values: [
      access.tenantId,
      organisationId,
      JSON.stringify(
        roleSeeds.map(([role_code, role_name, role_description, is_admin]) => ({
          role_code,
          role_name,
          role_description,
          is_admin,
        })),
      ),
    ],
  });
  await ctx.broker("core_erp", "query", {
    text: `WITH root AS (
            SELECT division_id
            FROM erp_division
            WHERE tenant_id=$1 AND organisation_id=$2 AND parent_division_id IS NULL AND workflow_status <> 'deleted'
            ORDER BY created_at
            LIMIT 1
          ),
          payload AS (
            SELECT *
            FROM jsonb_to_recordset($3::jsonb)
            AS row(role_code text,resource_kind text,resource_code text,workflow_status text)
          ),
          raw_expanded AS (
            SELECT p.role_code,root.division_id,'subledger_account'::text resource_kind,type.subledger_account_type_id::text resource_code,p.workflow_status
            FROM payload p CROSS JOIN root
            JOIN erp_subledger_account_type type ON type.tenant_id=$1 AND type.organisation_id=$2 AND (p.resource_code='*' OR type.type_code=p.resource_code)
            WHERE p.resource_kind='master_data'
            UNION ALL
            SELECT p.role_code,root.division_id,'accounting_object',type.accounting_object_type_id::text,p.workflow_status
            FROM payload p CROSS JOIN root
            JOIN erp_accounting_object_type type ON type.tenant_id=$1 AND type.organisation_id=$2
            WHERE p.resource_kind='master_data' AND p.resource_code='*'
            UNION ALL
            SELECT p.role_code,root.division_id,'accounting_dimension',type.accounting_dimension_type_id::text,p.workflow_status
            FROM payload p CROSS JOIN root
            JOIN erp_accounting_dimension_type type ON type.tenant_id=$1 AND type.organisation_id=$2
            WHERE p.resource_kind='master_data' AND p.resource_code='*'
            UNION ALL
            SELECT p.role_code,NULL::uuid,'gl_account','*',p.workflow_status FROM payload p WHERE p.resource_kind='master_data' AND p.resource_code='*'
            UNION ALL
            SELECT p.role_code,NULL::uuid,'legal_entity','*',p.workflow_status FROM payload p WHERE p.resource_kind='master_data' AND p.resource_code='*'
            UNION ALL
            SELECT p.role_code,root.division_id,p.resource_kind,p.resource_code,p.workflow_status
            FROM payload p CROSS JOIN root
            WHERE p.resource_kind='transaction' AND p.resource_code='*'
            UNION ALL
            SELECT p.role_code,root.division_id,p.resource_kind,tt.transaction_type_id::text,p.workflow_status
            FROM payload p CROSS JOIN root
            JOIN erp_transaction_group tg ON tg.tenant_id=$1 AND tg.organisation_id=$2 AND tg.group_code=p.resource_code
            JOIN erp_transaction_type tt ON tt.transaction_group_id=tg.transaction_group_id
            WHERE p.resource_kind='transaction' AND p.resource_code <> '*'
          ),
          expanded AS (
            SELECT role_code,division_id,resource_kind,resource_code,
                   CASE WHEN bool_or(workflow_status<>'view') THEN '*' ELSE 'view' END workflow_status
            FROM raw_expanded
            GROUP BY role_code,division_id,resource_kind,resource_code
          )
          INSERT INTO erp_role_permission(tenant_id,organisation_id,role_id,division_id,resource_kind,resource_code,workflow_status,action_code,applies_to_children)
          SELECT $1,$2,r.role_id,e.division_id,e.resource_kind,e.resource_code,e.workflow_status,
                 CASE WHEN e.workflow_status='view' THEN 'view' ELSE 'manage' END,
                 true
          FROM expanded e
          JOIN erp_role r ON r.tenant_id=$1 AND r.organisation_id=$2 AND r.role_code=e.role_code
          WHERE NOT EXISTS (
            SELECT 1
            FROM erp_role_permission existing
            WHERE existing.tenant_id=$1
              AND existing.organisation_id=$2
              AND existing.role_id=r.role_id
              AND existing.division_id IS NOT DISTINCT FROM e.division_id
              AND existing.resource_kind=e.resource_kind
              AND existing.resource_code=e.resource_code
              AND existing.workflow_status=e.workflow_status
              AND existing.action_code=CASE WHEN e.workflow_status='view' THEN 'view' ELSE 'manage' END
          )`,
    values: [
      access.tenantId,
      organisationId,
      JSON.stringify(
        rolePermissionSeeds.map(
          ([role_code, resource_kind, resource_code, workflow_status]) => ({
            role_code,
            resource_kind,
            resource_code,
            workflow_status,
          }),
        ),
      ),
    ],
  });
  await ctx.broker("core_erp", "query", {
    text: `WITH requested AS (
            SELECT role_code,module_code FROM jsonb_to_recordset($3::jsonb) AS row(role_code text,module_code text)
          ), role_modules AS (
            SELECT r.role_id,m.module_id FROM requested requested_role
            JOIN erp_role r ON r.tenant_id=$1 AND r.organisation_id=$2 AND r.role_code=requested_role.role_code
            JOIN erp_module m ON m.tenant_id=$1 AND m.organisation_id=$2 AND (requested_role.module_code='*' OR m.module_code=requested_role.module_code)
            UNION
            SELECT rp.role_id,sm.module_id FROM erp_role_permission rp
            JOIN erp_subledger_account_type st ON st.tenant_id=rp.tenant_id AND st.organisation_id=rp.organisation_id AND (rp.resource_code='*' OR st.type_code=rp.resource_code OR st.subledger_account_type_id::text=rp.resource_code)
            JOIN erp_subledger_account_type_module sm ON sm.subledger_account_type_id=st.subledger_account_type_id
            WHERE rp.tenant_id=$1 AND rp.organisation_id=$2 AND rp.resource_kind='subledger_account'
            UNION
            SELECT rp.role_id,tm.module_id FROM erp_role_permission rp
            JOIN erp_transaction_type_module tm ON rp.resource_code='*' OR tm.transaction_type_id::text=rp.resource_code
            WHERE rp.tenant_id=$1 AND rp.organisation_id=$2 AND rp.resource_kind='transaction'
          )
          INSERT INTO erp_role_module(role_id,module_id) SELECT DISTINCT role_id,module_id FROM role_modules ON CONFLICT DO NOTHING`,
    values: [
      access.tenantId,
      organisationId,
      JSON.stringify(
        Object.entries(roleModuleSeeds).flatMap(([role_code, moduleCodes]) =>
          moduleCodes.map((module_code) => ({ role_code, module_code })),
        ),
      ),
    ],
  });
  await ctx.broker("core_erp", "query", {
    text: `INSERT INTO erp_resource_role(tenant_id,organisation_id,role_code,role_name,is_active,is_seeded)
          SELECT $1,$2,role_code,role_name,true,true
          FROM jsonb_to_recordset($3::jsonb) AS row(role_code text,role_name text)
          ON CONFLICT(tenant_id,organisation_id,role_code) DO UPDATE
          SET role_name=excluded.role_name,is_active=true,is_seeded=true,updated_at=now()`,
    values: [
      access.tenantId,
      organisationId,
      JSON.stringify(
        resourceRoleSeeds.map(([role_code, role_name]) => ({
          role_code,
          role_name,
        })),
      ),
    ],
  });
  await ctx.broker("core_erp", "query", {
    text: `WITH payload AS (
            SELECT * FROM jsonb_to_recordset($3::jsonb) AS row(role_code text,module_code text)
          )
          INSERT INTO erp_resource_role_module(resource_role_id,module_id)
          SELECT role.resource_role_id,module.module_id
          FROM payload
          JOIN erp_resource_role role ON role.tenant_id=$1 AND role.organisation_id=$2 AND role.role_code=payload.role_code
          JOIN erp_module module ON module.tenant_id=$1 AND module.organisation_id=$2 AND module.module_code=payload.module_code
          ON CONFLICT DO NOTHING`,
    values: [
      access.tenantId,
      organisationId,
      JSON.stringify(
        Object.entries(resourceRoleModuleSeeds).flatMap(
          ([role_code, moduleCodes]) =>
            moduleCodes.map((module_code) => ({ role_code, module_code })),
        ),
      ),
    ],
  });
  await ctx.broker("core_erp", "query", {
    text: `WITH payload AS (
            SELECT * FROM jsonb_to_recordset($3::jsonb)
            AS row(object_kind text,type_code text,role_code text,is_required boolean)
          ), types AS (
            SELECT 'gl_account'::text object_kind,type_code,gl_account_type_id object_type_id
            FROM erp_gl_account_type WHERE tenant_id=$1 AND organisation_id=$2
            UNION ALL
            SELECT 'subledger_account',type_code,subledger_account_type_id
            FROM erp_subledger_account_type WHERE tenant_id=$1 AND organisation_id=$2
            UNION ALL
            SELECT 'accounting_object',type_code,accounting_object_type_id
            FROM erp_accounting_object_type WHERE tenant_id=$1 AND organisation_id=$2
            UNION ALL
            SELECT 'accounting_dimension',type_code,accounting_dimension_type_id
            FROM erp_accounting_dimension_type WHERE tenant_id=$1 AND organisation_id=$2
          )
          INSERT INTO erp_object_type_resource_role(tenant_id,organisation_id,object_kind,object_type_id,resource_role_id,is_required)
          SELECT $1,$2,payload.object_kind,types.object_type_id,role.resource_role_id,payload.is_required
          FROM payload
          JOIN types ON types.object_kind=payload.object_kind AND types.type_code=payload.type_code
          JOIN erp_resource_role role ON role.tenant_id=$1 AND role.organisation_id=$2 AND role.role_code=payload.role_code
          ON CONFLICT(tenant_id,organisation_id,object_kind,object_type_id,resource_role_id) DO UPDATE
          SET is_required=excluded.is_required`,
    values: [
      access.tenantId,
      organisationId,
      JSON.stringify(
        resourceRoleTypeMappings.map(
          ([object_kind, type_code, role_code, is_required]) => ({
            object_kind,
            type_code,
            role_code,
            is_required,
          }),
        ),
      ),
    ],
  });
  if (isAdministrator(access)) {
    await ctx.broker("core_erp", "query", {
      text: `WITH existing_admin_user AS (
              SELECT 1
              FROM erp_user_role ur
              JOIN erp_role role ON role.role_id=ur.role_id
              WHERE ur.tenant_id=$1
                AND ur.organisation_id=$2
                AND role.is_admin=true
                AND role.is_active=true
                AND ur.valid_from <= CURRENT_DATE
                AND (ur.valid_to IS NULL OR ur.valid_to >= CURRENT_DATE)
              LIMIT 1
            ),
            admin_role AS (
              SELECT role_id
              FROM erp_role
              WHERE tenant_id=$1
                AND organisation_id=$2
                AND role_code='erp_admin'
              LIMIT 1
            )
            INSERT INTO erp_user_role(tenant_id,organisation_id,role_id,email,valid_from,valid_to)
            SELECT $1,$2,admin_role.role_id,lower($3),CURRENT_DATE,NULL
            FROM admin_role
            WHERE NOT EXISTS (SELECT 1 FROM existing_admin_user)
            ON CONFLICT(tenant_id,organisation_id,role_id,email) DO UPDATE
            SET valid_from=LEAST(erp_user_role.valid_from,excluded.valid_from),
                valid_to=NULL`,
      values: [access.tenantId, organisationId, access.auth.email],
    });
  }
}

async function seedFinancialStatementFormats(ctx, access, organisationId) {
  const { financialStatementFormatSeeds } = loadTemplateDefaults();
  for (const format of financialStatementFormatSeeds) {
    const saved = await ctx.broker("core_erp", "query", {
      text: `INSERT INTO erp_financial_statement_format(tenant_id,organisation_id,format_code,format_name,statement_type,is_active,is_seeded)
            VALUES($1,$2,$3,$4,$5,true,true)
            ON CONFLICT(tenant_id,organisation_id,format_code) DO UPDATE
            SET format_name=excluded.format_name,
                statement_type=excluded.statement_type,
                is_active=true,
                is_seeded=true,
                updated_at=now()
            RETURNING financial_statement_format_id`,
      values: [
        access.tenantId,
        organisationId,
        format.code,
        format.name,
        format.statementType,
      ],
    });
    const formatId = saved.rows[0].financial_statement_format_id;
    await ctx.broker("core_erp", "query", {
      text: `DELETE FROM erp_financial_statement_line_account WHERE tenant_id=$1 AND organisation_id=$2 AND financial_statement_format_id=$3`,
      values: [access.tenantId, organisationId, formatId],
    });
    await ctx.broker("core_erp", "query", {
      text: `DELETE FROM erp_financial_statement_line WHERE tenant_id=$1 AND organisation_id=$2 AND financial_statement_format_id=$3`,
      values: [access.tenantId, organisationId, formatId],
    });
    const lineIds = new Map();
    for (const [
      lineCode,
      lineLabel,
      lineType,
      parentCode,
      sortOrder,
      options = {},
    ] of format.lines) {
      const parentId = parentCode ? lineIds.get(parentCode) : null;
      const line = await ctx.broker("core_erp", "query", {
        text: `INSERT INTO erp_financial_statement_line(tenant_id,organisation_id,financial_statement_format_id,parent_line_id,line_code,line_label,line_type,sort_order,sign_multiplier,formula_json,is_active)
              VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,true)
              RETURNING financial_statement_line_id`,
        values: [
          access.tenantId,
          organisationId,
          formatId,
          parentId,
          lineCode,
          lineLabel,
          lineType,
          sortOrder,
          options.sign_multiplier || 1,
          JSON.stringify(options.formula || {}),
        ],
      });
      const lineId = line.rows[0].financial_statement_line_id;
      lineIds.set(lineCode, lineId);
      if (Array.isArray(options.accounts) && options.accounts.length) {
        await ctx.broker("core_erp", "query", {
          text: `INSERT INTO erp_financial_statement_line_account(tenant_id,organisation_id,financial_statement_format_id,financial_statement_line_id,gl_account_id)
                SELECT $1,$2,$3,$4,gl_account_id
                FROM erp_gl_account
                WHERE tenant_id=$1
                  AND organisation_id=$2
                  AND account_code=ANY($5::text[])
                  AND workflow_status <> 'deleted'
                ON CONFLICT(tenant_id,organisation_id,financial_statement_format_id,gl_account_id) DO NOTHING`,
          values: [
            access.tenantId,
            organisationId,
            formatId,
            lineId,
            options.accounts,
          ],
        });
      }
    }
  }
}

module.exports = {
  seedOrganisationDefaults,
  seedTemplateResourceDefaults,
  seedFinancialStatementFormats,
  templateSeedPath,
};
