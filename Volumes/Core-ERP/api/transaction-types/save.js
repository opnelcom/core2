'use strict';
const {authTenant,requireAdmin,clean,nullable,bool}=require('../_shared/erp');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);

  const orgId=ctx.body.organisation_id;
  const id=nullable(ctx.body.transaction_type_id);
  const groupId=nullable(ctx.body.transaction_group_id);
  const code=clean(ctx.body.type_code).toLowerCase().replace(/\s+/g,'_');
  const name=clean(ctx.body.type_name);
  const description=clean(ctx.body.type_description);
  const isFinancial=ctx.body.is_financial!==false&&ctx.body.is_financial!=='false';
  const allowAdditional=ctx.body.allow_additional_lines!==false&&ctx.body.allow_additional_lines!=='false';
  const sortOrder=Number(ctx.body.sort_order)||0;
  const isActive=ctx.body.is_active!==false&&ctx.body.is_active!=='false';
  const lines=Array.isArray(ctx.body.lines)?ctx.body.lines:[];
  if(!orgId||!groupId||!code||!name)return ctx.send(400,{error:'organisation_id, transaction_group_id, type_code, and type_name are required'});
  if(isFinancial&&lines.length<2)return ctx.send(400,{error:'Financial transaction types require at least two transaction lines'});
  if(!isFinancial&&lines.length>0)return ctx.send(400,{error:'Non-financial transaction types cannot have transaction lines'});
  if(lines.length===1)return ctx.send(400,{error:'Transaction types can have zero, two, or more transaction lines'});

  const group=await ctx.broker('core_erp','query',{
    text:`SELECT transaction_group_id FROM erp_transaction_group
          WHERE tenant_id=$1 AND organisation_id=$2 AND transaction_group_id=$3`,
    values:[access.tenantId,orgId,groupId]
  });
  if(!group.rows.length)return ctx.send(404,{error:'Transaction group was not found'});

  for(const [index,line] of lines.entries()){
    const debitCredit=clean(line.debit_credit).toLowerCase();
    if(!['debit','credit'].includes(debitCredit))return ctx.send(400,{error:`Line ${index+1} requires DR/CR`});
    if(!nullable(line.default_gl_account_id))return ctx.send(400,{error:`Line ${index+1} requires a GL account`});
    if(bool(line.requires_subledger)&&!clean(line.subledger_family_code))return ctx.send(400,{error:`Line ${index+1} requires a subledger family`});
  }
  if(lines.length){
    const accountIds=[...new Set(lines.map(line=>nullable(line.default_gl_account_id)).filter(Boolean))];
    const accounts=await ctx.broker('core_erp','query',{
      text:`SELECT ledger_account_id FROM erp_ledger_account
            WHERE tenant_id=$1 AND organisation_id=$2 AND ledger_family_code='gl' AND ledger_account_id=ANY($3::uuid[]) AND workflow_status <> 'deleted'`,
      values:[access.tenantId,orgId,accountIds]
    });
    if(accounts.rows.length!==accountIds.length)return ctx.send(400,{error:'Every transaction line must reference a live GL account in this organisation'});
  }

  const typeValues=[access.tenantId,orgId,groupId,code,name,description,isFinancial,allowAdditional,sortOrder,isActive];
  const saved=id
    ? await ctx.broker('core_erp','query',{
        text:`UPDATE erp_transaction_type
              SET transaction_group_id=$3,type_code=$4,type_name=$5,type_description=$6,is_financial=$7,allow_additional_lines=$8,sort_order=$9,is_active=$10
              WHERE tenant_id=$1 AND organisation_id=$2 AND transaction_type_id=$11
              RETURNING *`,
        values:[...typeValues,id]
      })
    : await ctx.broker('core_erp','query',{
        text:`INSERT INTO erp_transaction_type(tenant_id,organisation_id,transaction_group_id,type_code,type_name,type_description,is_financial,allow_additional_lines,sort_order,is_active)
              VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
              ON CONFLICT(tenant_id,organisation_id,type_code) DO UPDATE
              SET transaction_group_id=excluded.transaction_group_id,type_name=excluded.type_name,type_description=excluded.type_description,is_financial=excluded.is_financial,allow_additional_lines=excluded.allow_additional_lines,sort_order=excluded.sort_order,is_active=excluded.is_active
              RETURNING *`,
        values:typeValues
      });
  if(!saved.rows.length)return ctx.send(404,{error:'Transaction type was not found'});
  const typeId=saved.rows[0].transaction_type_id;

  const statements=[{text:`DELETE FROM erp_posting_rule WHERE tenant_id=$1 AND organisation_id=$2 AND transaction_type_id=$3`,values:[access.tenantId,orgId,typeId]}];
  lines.forEach((line,index)=>{
    statements.push({
      text:`INSERT INTO erp_posting_rule(tenant_id,organisation_id,transaction_type_id,line_order,debit_credit,default_gl_account_id,requires_subledger,subledger_family_code,amount_source,line_description,is_required)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,'manual',$9,true)`,
      values:[
        access.tenantId,
        orgId,
        typeId,
        index+1,
        clean(line.debit_credit).toLowerCase(),
        nullable(line.default_gl_account_id),
        bool(line.requires_subledger),
        bool(line.requires_subledger)?clean(line.subledger_family_code):null,
        clean(line.line_description)
      ]
    });
  });
  await ctx.broker('core_erp','transaction',{statements});
  return {ok:true,transaction_type:saved.rows[0]};
};
