'use strict';
const {authTenant,requireAdmin,clean,nullable,bool,parseJson}=require('../_shared/erp');

function normalCode(value){
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
}

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);
  const id=nullable(ctx.body.financial_statement_format_id);
  const orgId=ctx.body.organisation_id;
  const code=normalCode(ctx.body.format_code);
  const name=clean(ctx.body.format_name);
  const statementType=clean(ctx.body.statement_type);
  const lines=Array.isArray(ctx.body.lines)?ctx.body.lines:[];
  if(!orgId||!code||!name||!['income','balance'].includes(statementType)){
    return ctx.send(400,{error:'Organisation, code, name and valid statement type are required'});
  }
  if(!lines.length)return ctx.send(400,{error:'At least one statement line is required'});

  const seenCodes=new Set();
  for(const row of lines){
    row.client_key=clean(row.client_key||row.financial_statement_line_id||row.line_code);
    row.line_code=clean(row.line_code).toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
    row.line_label=clean(row.line_label);
    row.line_type=clean(row.line_type,'account_group');
    row.parent_client_key=nullable(row.parent_client_key);
    row.sort_order=Number.parseInt(row.sort_order,10)||0;
    row.sign_multiplier=Number(row.sign_multiplier)===-1?-1:1;
    row.formula_json=parseJson(row.formula_json||{}, {});
    row.account_ids=Array.isArray(row.account_ids)?row.account_ids.map(nullable).filter(Boolean):[];
    if(!row.client_key||!row.line_code||!row.line_label)return ctx.send(400,{error:'Every line needs a code and label'});
    if(!['header','account_group','formula'].includes(row.line_type))return ctx.send(400,{error:`Invalid line type for ${row.line_code}`});
    if(seenCodes.has(row.line_code))return ctx.send(400,{error:`Duplicate line code ${row.line_code}`});
    seenCodes.add(row.line_code);
  }
  const lineIndex=new Map(lines.map((row,index)=>[row.client_key,index]));
  for(const [index,row] of lines.entries()){
    if(row.parent_client_key&&(!lineIndex.has(row.parent_client_key)||lineIndex.get(row.parent_client_key)>=index)){
      return ctx.send(400,{error:`Parent line must appear above ${row.line_code}`});
    }
  }

  const mappedAccounts=new Set();
  for(const row of lines){
    for(const accountId of row.account_ids){
      if(mappedAccounts.has(accountId))return ctx.send(400,{error:'A GL account can only be mapped to one line per format'});
      mappedAccounts.add(accountId);
    }
  }

  if(mappedAccounts.size){
    const accounts=await ctx.broker('core_erp','query',{
      text:`SELECT ledger_account_id
            FROM erp_ledger_account
            WHERE tenant_id=$1
              AND organisation_id=$2
              AND ledger_family_code='gl'
              AND workflow_status <> 'deleted'
              AND ledger_account_id=ANY($3::uuid[])`,
      values:[access.tenantId,orgId,[...mappedAccounts]]
    });
    if(accounts.rowCount!==mappedAccounts.size)return ctx.send(400,{error:'One or more mapped GL accounts are invalid'});
  }

  const saved=id
    ? await ctx.broker('core_erp','query',{
      text:`UPDATE erp_financial_statement_format
            SET format_code=$3,format_name=$4,statement_type=$5,is_active=$6,updated_at=now()
            WHERE tenant_id=$1 AND organisation_id=$2 AND financial_statement_format_id=$7
            RETURNING *`,
      values:[access.tenantId,orgId,code,name,statementType,bool(ctx.body.is_active),id]
    })
    : await ctx.broker('core_erp','query',{
      text:`INSERT INTO erp_financial_statement_format(tenant_id,organisation_id,format_code,format_name,statement_type,is_active,is_seeded)
            VALUES($1,$2,$3,$4,$5,$6,false)
            ON CONFLICT(tenant_id,organisation_id,format_code) DO UPDATE
            SET format_name=excluded.format_name,
                statement_type=excluded.statement_type,
                is_active=excluded.is_active,
                updated_at=now()
            RETURNING *`,
      values:[access.tenantId,orgId,code,name,statementType,bool(ctx.body.is_active)]
    });
  if(!saved.rowCount)return ctx.send(404,{error:'Financial statement format not found'});
  const format=saved.rows[0];
  const formatId=format.financial_statement_format_id;

  await ctx.broker('core_erp','query',{
    text:`DELETE FROM erp_financial_statement_line_account WHERE tenant_id=$1 AND organisation_id=$2 AND financial_statement_format_id=$3`,
    values:[access.tenantId,orgId,formatId]
  });
  await ctx.broker('core_erp','query',{
    text:`DELETE FROM erp_financial_statement_line WHERE tenant_id=$1 AND organisation_id=$2 AND financial_statement_format_id=$3`,
    values:[access.tenantId,orgId,formatId]
  });

  const inserted=new Map();
  for(const row of lines){
    const parentId=row.parent_client_key?inserted.get(row.parent_client_key):null;
    if(row.parent_client_key&&!parentId)return ctx.send(400,{error:`Parent line not found for ${row.line_code}`});
    const line=await ctx.broker('core_erp','query',{
      text:`INSERT INTO erp_financial_statement_line(tenant_id,organisation_id,financial_statement_format_id,parent_line_id,line_code,line_label,line_type,sort_order,sign_multiplier,formula_json,is_active)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
            RETURNING *`,
      values:[access.tenantId,orgId,formatId,parentId,row.line_code,row.line_label,row.line_type,row.sort_order,row.sign_multiplier,JSON.stringify(row.formula_json),bool(row.is_active)]
    });
    inserted.set(row.client_key,line.rows[0].financial_statement_line_id);
    if(row.account_ids.length){
      await ctx.broker('core_erp','query',{
        text:`INSERT INTO erp_financial_statement_line_account(tenant_id,organisation_id,financial_statement_format_id,financial_statement_line_id,ledger_account_id)
              SELECT $1,$2,$3,$4,ledger_account_id
              FROM erp_ledger_account
              WHERE tenant_id=$1 AND organisation_id=$2 AND ledger_account_id=ANY($5::uuid[])
              ON CONFLICT(tenant_id,organisation_id,financial_statement_format_id,ledger_account_id) DO NOTHING`,
        values:[access.tenantId,orgId,formatId,line.rows[0].financial_statement_line_id,row.account_ids]
      });
    }
  }

  return {format};
};
