'use strict';
const {authTenant}=require('../_shared/erp');

module.exports=async ctx=>{
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const orgId=ctx.query.organisation_id;
  const activeDivisionId=ctx.query.active_division_id||null;
  const includeChildren=ctx.query.include_child_divisions==='1';
  if(!orgId)return ctx.send(400,{error:'organisation_id is required'});

  const count=async text=>{
    const result=await ctx.broker('core_erp','query',{text,values:[access.tenantId,orgId]});
    return Number(result.rows[0]?.count)||0;
  };
  const scopedCount=async (table,divisionColumn,extra='')=>{
    const result=await ctx.broker('core_erp','query',{
      text:`WITH RECURSIVE selected_scope AS (
              SELECT division_id FROM erp_division WHERE tenant_id=$1 AND organisation_id=$2 AND division_id=$3::uuid
              UNION ALL
              SELECT child.division_id FROM erp_division child JOIN selected_scope parent ON child.parent_division_id=parent.division_id
              WHERE child.tenant_id=$1 AND child.organisation_id=$2 AND $4::boolean
            )
            SELECT count(*) FROM ${table}
            WHERE tenant_id=$1 AND organisation_id=$2 ${extra}
              AND ($3::uuid IS NULL OR ${divisionColumn} IN (SELECT division_id FROM selected_scope))`,
      values:[access.tenantId,orgId,activeDivisionId,includeChildren]
    });
    return Number(result.rows[0]?.count)||0;
  };
  const [divisions,legalEntities,glAccounts,subledgers,periods,journals,adminUsers]=await Promise.all([
    scopedCount('erp_division','division_id',`AND workflow_status <> 'deleted'`),
    count(`SELECT count(*) FROM erp_legal_entity WHERE tenant_id=$1 AND organisation_id=$2 AND workflow_status <> 'deleted'`),
    count(`SELECT count(*) FROM erp_gl_account WHERE tenant_id=$1 AND organisation_id=$2 AND workflow_status <> 'deleted'`),
    scopedCount('erp_subledger_account','owner_division_id',`AND workflow_status <> 'deleted'`),
    count(`SELECT count(*) FROM erp_fiscal_period WHERE tenant_id=$1 AND organisation_id=$2`),
    scopedCount('erp_journal','source_division_id',`AND workflow_status <> 'deleted'`),
    count(`SELECT count(DISTINCT lower(ur.email))
      FROM erp_user_role ur
      JOIN erp_role role ON role.role_id=ur.role_id
      WHERE ur.tenant_id=$1
        AND ur.organisation_id=$2
        AND role.is_admin=true
        AND role.is_active=true
        AND ur.valid_from <= CURRENT_DATE
        AND (ur.valid_to IS NULL OR ur.valid_to >= CURRENT_DATE)`)
  ]);
  return {divisions,legal_entities:legalEntities,gl_accounts:glAccounts,subledgers,periods,journals,admin_users:adminUsers};
};
