'use strict';
const {authTenant,requireAdmin}=require('../_shared/erp');

async function ensureRootDivision(ctx,access,targetId,email){
  const existing=await ctx.broker('core_erp','query',{
    text:`SELECT division_id FROM erp_division
          WHERE tenant_id=$1 AND organisation_id=$2 AND parent_division_id IS NULL AND workflow_status <> 'deleted'
          LIMIT 1`,
    values:[access.tenantId,targetId]
  });
  if(existing.rows.length)return 0;
  const inserted=await ctx.broker('core_erp','query',{
    text:`INSERT INTO erp_division(tenant_id,organisation_id,parent_division_id,division_code,division_name,workflow_status,created_by_email,updated_by_email)
          SELECT $1,organisation_id,NULL,'ROOT',organisation_name,'approved',$3,$3
          FROM erp_organisation
          WHERE tenant_id=$1 AND organisation_id=$2`,
    values:[access.tenantId,targetId,email]
  });
  return inserted.rowCount||0;
}

async function copyDivisions(ctx,access,sourceId,targetId,email){
  const source=await ctx.broker('core_erp','query',{
    text:`WITH RECURSIVE tree AS (
            SELECT division_id,parent_division_id,division_code,division_name,workflow_status,effective_from,effective_to,0 AS depth
            FROM erp_division
            WHERE tenant_id=$1 AND organisation_id=$2 AND parent_division_id IS NULL AND workflow_status <> 'deleted'
            UNION ALL
            SELECT d.division_id,d.parent_division_id,d.division_code,d.division_name,d.workflow_status,d.effective_from,d.effective_to,tree.depth+1
            FROM erp_division d
            JOIN tree ON tree.division_id=d.parent_division_id
            WHERE d.tenant_id=$1 AND d.organisation_id=$2 AND d.workflow_status <> 'deleted'
          )
          SELECT * FROM tree ORDER BY depth,division_code`,
    values:[access.tenantId,sourceId]
  });
  if(!source.rows.length)return ensureRootDivision(ctx,access,targetId,email);
  const mapped=new Map();
  let copied=0;
  for(const row of source.rows){
    const parentId=row.parent_division_id?mapped.get(row.parent_division_id):null;
    const existing=await ctx.broker('core_erp','query',{
      text:`SELECT division_id FROM erp_division
            WHERE tenant_id=$1 AND organisation_id=$2 AND division_code=$3 AND workflow_status <> 'deleted'
            LIMIT 1`,
      values:[access.tenantId,targetId,row.division_code]
    });
    if(existing.rows[0]){
      const updated=await ctx.broker('core_erp','query',{
        text:`UPDATE erp_division
              SET parent_division_id=$4,division_name=$5,workflow_status=$6,effective_from=$7,effective_to=$8,updated_by_email=$9,updated_at=now()
              WHERE tenant_id=$1 AND organisation_id=$2 AND division_id=$3
              RETURNING division_id`,
        values:[access.tenantId,targetId,existing.rows[0].division_id,parentId,row.division_name,row.workflow_status,row.effective_from,row.effective_to,email]
      });
      mapped.set(row.division_id,updated.rows[0].division_id);
      copied+=updated.rowCount||0;
    }else{
      const inserted=await ctx.broker('core_erp','query',{
        text:`INSERT INTO erp_division(tenant_id,organisation_id,parent_division_id,division_code,division_name,workflow_status,effective_from,effective_to,created_by_email,updated_by_email)
              VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
              RETURNING division_id`,
        values:[access.tenantId,targetId,parentId,row.division_code,row.division_name,row.workflow_status,row.effective_from,row.effective_to,email]
      });
      mapped.set(row.division_id,inserted.rows[0].division_id);
      copied+=inserted.rowCount||0;
    }
  }
  return copied;
}

function isEnabled(options,name){
  if(!options)return true;
  return options[name]===true||options[name]==='true';
}

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);

  const sourceId=ctx.body.source_organisation_id;
  const targetId=ctx.body.target_organisation_id;
  const options=ctx.body.options||null;
  if(!sourceId||!targetId||sourceId===targetId)return ctx.send(400,{error:'Source and target organisations are required'});

  const orgs=await ctx.broker('core_erp','query',{
    text:`SELECT organisation_id FROM erp_organisation
          WHERE tenant_id=$1 AND organisation_id=ANY($2::uuid[]) AND workflow_status <> 'deleted'`,
    values:[access.tenantId,[sourceId,targetId]]
  });
  if(orgs.rows.length!==2)return ctx.send(404,{error:'Source or target organisation was not found'});

  const wants={
    divisions:isEnabled(options,'divisions'),
    countries:isEnabled(options,'countries'),
    currencies:isEnabled(options,'currencies'),
    fiscal:isEnabled(options,'fiscal_years'),
    ledgerFamilies:isEnabled(options,'ledger_families')||isEnabled(options,'ledger_types')||isEnabled(options,'chart_of_accounts'),
    ledgerTypes:isEnabled(options,'ledger_types')||isEnabled(options,'chart_of_accounts'),
    chart:isEnabled(options,'chart_of_accounts')||isEnabled(options,'posting_rules'),
    transactionGroups:isEnabled(options,'transaction_groups')||isEnabled(options,'transaction_types')||isEnabled(options,'posting_rules'),
    transactionTypes:isEnabled(options,'transaction_types')||isEnabled(options,'posting_rules'),
    postingRules:isEnabled(options,'posting_rules'),
    masterDataTypes:isEnabled(options,'master_data_types'),
    permissions:isEnabled(options,'permissions')
  };

  const statements=[];
  const detail={};
  if(wants.divisions){
    detail.divisions=await copyDivisions(ctx,access,sourceId,targetId,access.auth.email);
  }else if(wants.chart){
    detail.root_division=await ensureRootDivision(ctx,access,targetId,access.auth.email);
  }

  const add=(name,text,values=[access.tenantId,sourceId,targetId])=>statements.push({name,text,values});

  if(wants.currencies)add('currencies',`INSERT INTO erp_organisation_currency(tenant_id,organisation_id,currency_code,currency_name,decimal_places,is_active,is_seeded)
    SELECT tenant_id,$3,currency_code,currency_name,decimal_places,is_active,is_seeded
    FROM erp_organisation_currency
    WHERE tenant_id=$1 AND organisation_id=$2
    ON CONFLICT(tenant_id,organisation_id,currency_code) DO UPDATE
    SET currency_name=excluded.currency_name,decimal_places=excluded.decimal_places,is_active=excluded.is_active,is_seeded=excluded.is_seeded,updated_at=now()`);

  if(wants.countries)add('countries',`INSERT INTO erp_organisation_country(tenant_id,organisation_id,country_code,alpha3_code,numeric_code,country_name,official_name,region,subregion,default_currency_code,calling_code,postal_code_required,administrative_level_label,is_active,is_seeded)
    SELECT tenant_id,$3,country_code,alpha3_code,numeric_code,country_name,official_name,region,subregion,default_currency_code,calling_code,postal_code_required,administrative_level_label,is_active,is_seeded
    FROM erp_organisation_country
    WHERE tenant_id=$1 AND organisation_id=$2
    ON CONFLICT(tenant_id,organisation_id,country_code) DO UPDATE
    SET alpha3_code=excluded.alpha3_code,numeric_code=excluded.numeric_code,country_name=excluded.country_name,official_name=excluded.official_name,region=excluded.region,subregion=excluded.subregion,default_currency_code=excluded.default_currency_code,calling_code=excluded.calling_code,postal_code_required=excluded.postal_code_required,administrative_level_label=excluded.administrative_level_label,is_active=excluded.is_active,is_seeded=excluded.is_seeded,updated_at=now()`);

  if(wants.fiscal){
    add('fiscal_years',`INSERT INTO erp_fiscal_year(tenant_id,organisation_id,fiscal_year_code,start_date,end_date,status)
      SELECT tenant_id,$3,fiscal_year_code,start_date,end_date,status
      FROM erp_fiscal_year
      WHERE tenant_id=$1 AND organisation_id=$2
      ON CONFLICT(tenant_id,organisation_id,fiscal_year_code) DO UPDATE
      SET start_date=excluded.start_date,end_date=excluded.end_date,status=excluded.status,updated_at=now()`);
    add('fiscal_periods',`WITH source_periods AS (
        SELECT p.*,y.fiscal_year_code
        FROM erp_fiscal_period p
        JOIN erp_fiscal_year y ON y.fiscal_year_id=p.fiscal_year_id
        WHERE p.tenant_id=$1 AND p.organisation_id=$2
      )
      INSERT INTO erp_fiscal_period(tenant_id,organisation_id,fiscal_year_id,period_number,period_code,start_date,end_date,status)
      SELECT $1,$3,target_year.fiscal_year_id,source_periods.period_number,source_periods.period_code,source_periods.start_date,source_periods.end_date,source_periods.status
      FROM source_periods
      JOIN erp_fiscal_year target_year ON target_year.tenant_id=$1 AND target_year.organisation_id=$3 AND target_year.fiscal_year_code=source_periods.fiscal_year_code
      ON CONFLICT(tenant_id,organisation_id,fiscal_year_id,period_number) DO UPDATE
      SET period_code=excluded.period_code,start_date=excluded.start_date,end_date=excluded.end_date,status=excluded.status,updated_at=now()`);
  }

  if(wants.ledgerFamilies)add('ledger_families',`INSERT INTO erp_organisation_ledger_family(tenant_id,organisation_id,ledger_family_code,family_name,requires_standard_account_type,schema_json,is_active,is_seeded)
    SELECT tenant_id,$3,ledger_family_code,family_name,requires_standard_account_type,schema_json,is_active,is_seeded
    FROM erp_organisation_ledger_family
    WHERE tenant_id=$1 AND organisation_id=$2
    ON CONFLICT(tenant_id,organisation_id,ledger_family_code) DO UPDATE
    SET family_name=excluded.family_name,requires_standard_account_type=excluded.requires_standard_account_type,schema_json=excluded.schema_json,is_active=excluded.is_active,is_seeded=excluded.is_seeded,updated_at=now()`);

  if(wants.ledgerTypes)add('ledger_types',`INSERT INTO erp_ledger_account_type(tenant_id,organisation_id,ledger_family_code,account_type_code,account_type_name,is_required,is_seeded,is_active)
    SELECT tenant_id,$3,ledger_family_code,account_type_code,account_type_name,is_required,is_seeded,is_active
    FROM erp_ledger_account_type
    WHERE tenant_id=$1 AND organisation_id=$2
    ON CONFLICT DO NOTHING`);

  if(wants.transactionGroups)add('transaction_groups',`INSERT INTO erp_transaction_group(tenant_id,organisation_id,group_code,group_name,sort_order,is_active)
    SELECT tenant_id,$3,group_code,group_name,sort_order,is_active
    FROM erp_transaction_group
    WHERE tenant_id=$1 AND organisation_id=$2
    ON CONFLICT(tenant_id,organisation_id,group_code) DO UPDATE
    SET group_name=excluded.group_name,sort_order=excluded.sort_order,is_active=excluded.is_active`);

  if(wants.transactionTypes)add('transaction_types',`WITH source_types AS (
      SELECT tt.*,tg.group_code
      FROM erp_transaction_type tt
      JOIN erp_transaction_group tg ON tg.transaction_group_id=tt.transaction_group_id
      WHERE tt.tenant_id=$1 AND tt.organisation_id=$2
    )
    INSERT INTO erp_transaction_type(tenant_id,organisation_id,transaction_group_id,type_code,type_name,type_description,is_financial,allow_additional_lines,sort_order,is_active)
    SELECT $1,$3,target_group.transaction_group_id,source_types.type_code,source_types.type_name,source_types.type_description,source_types.is_financial,source_types.allow_additional_lines,source_types.sort_order,source_types.is_active
    FROM source_types
    JOIN erp_transaction_group target_group ON target_group.tenant_id=$1 AND target_group.organisation_id=$3 AND target_group.group_code=source_types.group_code
    ON CONFLICT(tenant_id,organisation_id,type_code) DO UPDATE
    SET transaction_group_id=excluded.transaction_group_id,type_name=excluded.type_name,type_description=excluded.type_description,is_financial=excluded.is_financial,allow_additional_lines=excluded.allow_additional_lines,sort_order=excluded.sort_order,is_active=excluded.is_active`);

  if(wants.masterDataTypes)add('master_data_types',`INSERT INTO erp_master_data_type(tenant_id,organisation_id,ledger_family_code,type_code,type_name,schema_json,ui_schema_json,schema_version,workflow_status)
    SELECT tenant_id,$3,ledger_family_code,type_code,type_name,schema_json,ui_schema_json,schema_version,workflow_status
    FROM erp_master_data_type
    WHERE tenant_id=$1 AND organisation_id=$2 AND workflow_status <> 'deleted'
    ON CONFLICT(tenant_id,organisation_id,type_code) DO UPDATE
    SET ledger_family_code=excluded.ledger_family_code,type_name=excluded.type_name,schema_json=excluded.schema_json,ui_schema_json=excluded.ui_schema_json,schema_version=excluded.schema_version,workflow_status=excluded.workflow_status,updated_at=now()`);

  if(wants.chart)add('chart_of_accounts',`WITH target_root AS (
      SELECT division_id FROM erp_division WHERE tenant_id=$1 AND organisation_id=$3 AND parent_division_id IS NULL AND workflow_status <> 'deleted' LIMIT 1
    ),
    source_accounts AS (
      SELECT a.*,t.account_type_code,source_division.division_code
      FROM erp_ledger_account a
      LEFT JOIN erp_ledger_account_type t ON t.account_type_id=a.account_type_id
      LEFT JOIN erp_division source_division ON source_division.division_id=a.owner_division_id
      WHERE a.tenant_id=$1 AND a.organisation_id=$2 AND a.workflow_status <> 'deleted'
    ),
    target_types AS (
      SELECT account_type_id,ledger_family_code,account_type_code
      FROM erp_ledger_account_type
      WHERE tenant_id=$1 AND organisation_id=$3
    )
    INSERT INTO erp_ledger_account(tenant_id,organisation_id,owner_division_id,ledger_family_code,account_code,account_name,account_type_id,requires_subledger,required_subledger_family_code,workflow_status,additional_data,created_by_email,updated_by_email,approved_by_email,approved_at)
    SELECT $1,$3,COALESCE(target_division.division_id,target_root.division_id),s.ledger_family_code,s.account_code,s.account_name,tt.account_type_id,s.requires_subledger,s.required_subledger_family_code,s.workflow_status,s.additional_data,$4,$4,$4,CASE WHEN s.workflow_status='approved' THEN now() ELSE NULL END
    FROM source_accounts s
    CROSS JOIN target_root
    LEFT JOIN erp_division target_division ON target_division.tenant_id=$1 AND target_division.organisation_id=$3 AND target_division.division_code=s.division_code AND target_division.workflow_status <> 'deleted'
    LEFT JOIN target_types tt ON tt.ledger_family_code=s.ledger_family_code AND tt.account_type_code=s.account_type_code
    ON CONFLICT DO NOTHING`,[access.tenantId,sourceId,targetId,access.auth.email]);

  if(wants.postingRules)add('posting_rules',`WITH source_rules AS (
      SELECT pr.*,tt.type_code,a.ledger_family_code,a.account_code
      FROM erp_posting_rule pr
      JOIN erp_transaction_type tt ON tt.transaction_type_id=pr.transaction_type_id
      LEFT JOIN erp_ledger_account a ON a.ledger_account_id=pr.default_gl_account_id
      WHERE pr.tenant_id=$1 AND pr.organisation_id=$2
    )
    INSERT INTO erp_posting_rule(tenant_id,organisation_id,transaction_type_id,line_order,debit_credit,default_gl_account_id,requires_subledger,subledger_family_code,amount_source,line_description,is_required)
    SELECT $1,$3,target_type.transaction_type_id,source_rules.line_order,source_rules.debit_credit,target_account.ledger_account_id,source_rules.requires_subledger,source_rules.subledger_family_code,source_rules.amount_source,source_rules.line_description,source_rules.is_required
    FROM source_rules
    JOIN erp_transaction_type target_type ON target_type.tenant_id=$1 AND target_type.organisation_id=$3 AND target_type.type_code=source_rules.type_code
    LEFT JOIN erp_ledger_account target_account ON target_account.tenant_id=$1 AND target_account.organisation_id=$3 AND target_account.ledger_family_code=source_rules.ledger_family_code AND target_account.account_code=source_rules.account_code AND target_account.workflow_status <> 'deleted'
    ON CONFLICT DO NOTHING`);

  if(wants.permissions){
    add('roles',`INSERT INTO erp_role(tenant_id,organisation_id,role_code,role_name,role_description,is_admin,is_active)
      SELECT tenant_id,$3,role_code,role_name,role_description,is_admin,is_active
      FROM erp_role
      WHERE tenant_id=$1 AND organisation_id=$2
      ON CONFLICT(tenant_id,organisation_id,role_code) DO UPDATE
      SET role_name=excluded.role_name,role_description=excluded.role_description,is_admin=excluded.is_admin,is_active=excluded.is_active`);
    add('cleared_role_permissions',`DELETE FROM erp_role_permission target_permission
      USING erp_role target_role, erp_role source_role
      WHERE target_permission.tenant_id=$1
        AND target_permission.organisation_id=$3
        AND target_permission.role_id=target_role.role_id
        AND target_role.tenant_id=$1
        AND target_role.organisation_id=$3
        AND source_role.tenant_id=$1
        AND source_role.organisation_id=$2
        AND source_role.role_code=target_role.role_code`);
    add('cleared_user_roles',`DELETE FROM erp_user_role target_user_role
      USING erp_role target_role, erp_role source_role
      WHERE target_user_role.tenant_id=$1
        AND target_user_role.organisation_id=$3
        AND target_user_role.role_id=target_role.role_id
        AND target_role.tenant_id=$1
        AND target_role.organisation_id=$3
        AND source_role.tenant_id=$1
        AND source_role.organisation_id=$2
        AND source_role.role_code=target_role.role_code`);
    add('role_permissions',`WITH source_permissions AS (
        SELECT rp.*,r.role_code,source_division.division_code
        FROM erp_role_permission rp
        JOIN erp_role r ON r.role_id=rp.role_id
        LEFT JOIN erp_division source_division ON source_division.division_id=rp.division_id
        WHERE rp.tenant_id=$1 AND rp.organisation_id=$2
      )
      INSERT INTO erp_role_permission(tenant_id,organisation_id,role_id,division_id,resource_kind,resource_code,workflow_status,action_code,applies_to_children,valid_from,valid_to)
      SELECT $1,$3,target_role.role_id,target_division.division_id,source_permissions.resource_kind,target_transaction_type.transaction_type_id::text,source_permissions.workflow_status,source_permissions.action_code,source_permissions.applies_to_children,source_permissions.valid_from,source_permissions.valid_to
      FROM source_permissions
      JOIN erp_role target_role ON target_role.tenant_id=$1 AND target_role.organisation_id=$3 AND target_role.role_code=source_permissions.role_code
      JOIN erp_division target_division ON target_division.tenant_id=$1 AND target_division.organisation_id=$3 AND target_division.division_code=source_permissions.division_code AND target_division.workflow_status <> 'deleted'
      LEFT JOIN erp_transaction_type source_transaction_type ON source_transaction_type.transaction_type_id::text=source_permissions.resource_code AND source_permissions.resource_kind='transaction'
      LEFT JOIN erp_transaction_type target_transaction_type ON target_transaction_type.tenant_id=$1 AND target_transaction_type.organisation_id=$3 AND target_transaction_type.type_code=source_transaction_type.type_code
      WHERE source_permissions.resource_kind='transaction' AND target_transaction_type.transaction_type_id IS NOT NULL
      UNION ALL
      SELECT $1,$3,target_role.role_id,target_division.division_id,source_permissions.resource_kind,source_permissions.resource_code,source_permissions.workflow_status,source_permissions.action_code,source_permissions.applies_to_children,source_permissions.valid_from,source_permissions.valid_to
      FROM source_permissions
      JOIN erp_role target_role ON target_role.tenant_id=$1 AND target_role.organisation_id=$3 AND target_role.role_code=source_permissions.role_code
      JOIN erp_division target_division ON target_division.tenant_id=$1 AND target_division.organisation_id=$3 AND target_division.division_code=source_permissions.division_code AND target_division.workflow_status <> 'deleted'
      WHERE source_permissions.resource_kind='master_data'`);
    add('user_roles',`WITH source_user_roles AS (
        SELECT ur.*,r.role_code
        FROM erp_user_role ur
        JOIN erp_role r ON r.role_id=ur.role_id
        WHERE ur.tenant_id=$1 AND ur.organisation_id=$2
      )
      INSERT INTO erp_user_role(tenant_id,organisation_id,role_id,email,valid_from,valid_to)
      SELECT $1,$3,target_role.role_id,source_user_roles.email,source_user_roles.valid_from,source_user_roles.valid_to
      FROM source_user_roles
      JOIN erp_role target_role ON target_role.tenant_id=$1 AND target_role.organisation_id=$3 AND target_role.role_code=source_user_roles.role_code
      ON CONFLICT(tenant_id,organisation_id,role_id,email) DO UPDATE
      SET valid_from=excluded.valid_from,valid_to=excluded.valid_to`);
  }

  let copied=Object.values(detail).reduce((total,count)=>total+count,0);
  if(statements.length){
    const r=await ctx.broker('core_erp','transaction',{statements:statements.map(({text,values})=>({text,values}))});
    r.results.forEach((result,index)=>{
      const count=result.rowCount||0;
      detail[statements[index].name]=count;
      copied+=count;
    });
  }
  return {ok:true,copied,detail};
};
