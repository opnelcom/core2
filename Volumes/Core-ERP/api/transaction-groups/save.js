'use strict';
const {authTenant,requireAdmin,clean}=require('../_shared/erp');

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);

  const orgId=ctx.body.organisation_id;
  const groupId=ctx.body.transaction_group_id||null;
  const code=clean(ctx.body.group_code).toLowerCase();
  const name=clean(ctx.body.group_name);
  const sortOrder=Number(ctx.body.sort_order)||0;
  const isActive=ctx.body.is_active!==false&&ctx.body.is_active!=='false';
  if(!orgId||!code||!name)return ctx.send(400,{error:'organisation_id, group_code, and group_name are required'});

  const organisation=await ctx.broker('core_erp','query',{
    text:`SELECT organisation_id FROM erp_organisation
          WHERE tenant_id=$1 AND organisation_id=$2 AND workflow_status <> 'deleted'`,
    values:[access.tenantId,orgId]
  });
  if(!organisation.rows.length)return ctx.send(404,{error:'Organisation was not found'});

  const values=[access.tenantId,orgId,code,name,sortOrder,isActive];
  const result=groupId
    ? await ctx.broker('core_erp','query',{
        text:`UPDATE erp_transaction_group
              SET group_code=$3,group_name=$4,sort_order=$5,is_active=$6
              WHERE tenant_id=$1 AND organisation_id=$2 AND transaction_group_id=$7
              RETURNING *`,
        values:[...values,groupId]
      })
    : await ctx.broker('core_erp','query',{
        text:`INSERT INTO erp_transaction_group(tenant_id,organisation_id,group_code,group_name,sort_order,is_active)
              VALUES($1,$2,$3,$4,$5,$6)
              ON CONFLICT(tenant_id,organisation_id,group_code) DO UPDATE
              SET group_name=excluded.group_name,sort_order=excluded.sort_order,is_active=excluded.is_active
              RETURNING *`,
        values
      });
  if(!result.rows.length)return ctx.send(404,{error:'Transaction group was not found'});
  return {ok:true,transaction_group:result.rows[0]};
};
