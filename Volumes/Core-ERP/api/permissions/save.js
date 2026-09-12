'use strict';
const {authTenant,requireAdmin,clean,nullable,bool}=require('../_shared/erp');

function roleCodeFromName(value){
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')||'role';
}

module.exports=async ctx=>{
  if(ctx.req.method!=='POST')return ctx.send(405,{error:'POST required'});
  const access=await authTenant(ctx);
  if(access.status)return ctx.send(access.status,access.body);
  const denied=requireAdmin(access);
  if(denied)return ctx.send(denied.status,denied.body);

  const orgId=ctx.body.organisation_id;
  const id=nullable(ctx.body.role_id);
  const name=clean(ctx.body.role_name);
  const description=clean(ctx.body.role_description);
  const isAdmin=bool(ctx.body.is_admin);
  const isActive=ctx.body.is_active!==false&&ctx.body.is_active!=='false';
  const masterPermissions=Array.isArray(ctx.body.master_permissions)?ctx.body.master_permissions:[];
  const transactionPermissions=Array.isArray(ctx.body.transaction_permissions)?ctx.body.transaction_permissions:[];
  const roleUsers=Array.isArray(ctx.body.role_users)?ctx.body.role_users:[];
  const moduleIds=[...new Set((Array.isArray(ctx.body.module_ids)?ctx.body.module_ids:[]).map(String).filter(Boolean))];
  if(!orgId||!name)return ctx.send(400,{error:'organisation_id and role name are required'});
  if(!isAdmin&&!moduleIds.length)return ctx.send(400,{error:'At least one module is required for a non-administrator role'});
  if(moduleIds.length){
    const modules=await ctx.broker('core_erp','query',{text:`SELECT module_id FROM erp_module WHERE tenant_id=$1 AND organisation_id=$2 AND module_id=ANY($3::uuid[]) AND is_active=true`,values:[access.tenantId,orgId,moduleIds]});
    if(modules.rows.length!==moduleIds.length)return ctx.send(400,{error:'Every selected module must be active and belong to this organisation'});
  }

  const roleCode=id?null:roleCodeFromName(name);
  const saved=id
    ? await ctx.broker('core_erp','query',{
        text:`UPDATE erp_role
              SET role_name=$3,role_description=$4,is_admin=$5,is_active=$6
              WHERE tenant_id=$1 AND organisation_id=$2 AND role_id=$7
              RETURNING *`,
        values:[access.tenantId,orgId,name,description,isAdmin,isActive,id]
      })
    : await ctx.broker('core_erp','query',{
        text:`INSERT INTO erp_role(tenant_id,organisation_id,role_code,role_name,role_description,is_admin,is_active)
              VALUES($1,$2,$3,$4,$5,$6,$7)
              ON CONFLICT(tenant_id,organisation_id,role_code) DO UPDATE
              SET role_name=excluded.role_name,
                  role_description=excluded.role_description,
                  is_admin=excluded.is_admin,
                  is_active=excluded.is_active
              RETURNING *`,
        values:[access.tenantId,orgId,roleCode,name,description,isAdmin,isActive]
      });
  if(!saved.rows.length)return ctx.send(404,{error:'Role was not found'});
  const roleId=saved.rows[0].role_id;

  const statements=[
    {
      text:`DELETE FROM erp_role_permission WHERE tenant_id=$1 AND organisation_id=$2 AND role_id=$3`,
      values:[access.tenantId,orgId,roleId]
    },
    {
      text:`DELETE FROM erp_user_role WHERE tenant_id=$1 AND organisation_id=$2 AND role_id=$3`,
      values:[access.tenantId,orgId,roleId]
    },
    {
      text:`DELETE FROM erp_role_module WHERE role_id=$3`,
      values:[access.tenantId,orgId,roleId]
    }
  ];
  moduleIds.forEach(moduleId=>statements.push({text:`INSERT INTO erp_role_module(role_id,module_id) VALUES($1,$2)`,values:[roleId,moduleId]}));
  const addPermission=(kind,row)=>{
    const divisionId=nullable(row.division_id);
    const resourceCode=kind==='master_data'?clean(row.ledger_family_code):clean(row.transaction_type_id);
    const workflow=clean(row.workflow_status,'*');
    if(!divisionId||!resourceCode)return;
    statements.push({
      text:`INSERT INTO erp_role_permission(tenant_id,organisation_id,role_id,division_id,resource_kind,resource_code,workflow_status,action_code,applies_to_children)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,true)`,
      values:[access.tenantId,orgId,roleId,divisionId,kind,resourceCode,workflow,workflow==='view'?'view':'manage']
    });
  };
  masterPermissions.forEach(row=>addPermission('master_data',row));
  transactionPermissions.forEach(row=>addPermission('transaction',row));
  roleUsers.forEach(row=>{
    const email=clean(row.email).toLowerCase();
    const validFrom=nullable(row.valid_from);
    const validTo=nullable(row.valid_to);
    if(!email)return;
    statements.push({
      text:`INSERT INTO erp_user_role(tenant_id,organisation_id,role_id,email,valid_from,valid_to)
            VALUES($1,$2,$3,$4,COALESCE($5::date,CURRENT_DATE),$6::date)
            ON CONFLICT(tenant_id,organisation_id,role_id,email) DO UPDATE
            SET valid_from=excluded.valid_from,valid_to=excluded.valid_to`,
      values:[access.tenantId,orgId,roleId,email,validFrom,validTo]
    });
  });

  await ctx.broker('core_erp','transaction',{statements});
  return {ok:true,role:saved.rows[0]};
};
