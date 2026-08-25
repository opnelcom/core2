'use strict';

async function ensureApplicationColumns(ctx){
  await ctx.broker('core_saas','query',{text:`ALTER TABLE core_application ADD COLUMN IF NOT EXISTS application_description text`});
  await ctx.broker('core_saas','query',{text:`ALTER TABLE core_application ADD COLUMN IF NOT EXISTS application_icon_svg text`});
}

module.exports=async ctx=>{
  const a=ctx.auth();
  if(!a)return ctx.send(401,{error:'Authentication required'});

  const types=a.user_type==='administration_user'
    ? ['public_application','administration_application']
    : ['public_application'];

  const requestedTenantId=ctx.cookies.current_tenant||null;
  let tenantId=null;
  if(requestedTenantId){
    const tenantAccess=await ctx.broker('core_saas','query',{
      text:`SELECT t.tenant_id
            FROM core_tenant t
            JOIN core_tenant_user tu ON tu.tenant_id=t.tenant_id
            WHERE t.tenant_id=$1
            AND lower(tu.email)=lower($2)
            AND t.status='active'
            AND tu.status='active'`,
      values:[requestedTenantId,a.email]
    });
    tenantId=tenantAccess.rows[0]?.tenant_id||null;
  }
  await ensureApplicationColumns(ctx);
  const r=await ctx.broker('core_saas','query',{
    text:`WITH tenant_app_count AS (
            SELECT COUNT(*)::int app_count FROM core_tenant_application WHERE tenant_id=$2
          )
          SELECT DISTINCT a.application_id,a.application_code,a.application_name,a.application_description,a.application_icon_svg,a.application_type,a.route_prefix,a.status
          FROM core_application a
          CROSS JOIN tenant_app_count tac
          LEFT JOIN core_tenant_application ta ON ta.application_id=a.application_id AND ta.tenant_id=$2
          LEFT JOIN core_tenant_user tu ON tu.tenant_id=$2 AND lower(tu.email)=lower($3) AND tu.status='active'
          LEFT JOIN core_tenant_application_user tau ON tau.tenant_application_id=ta.tenant_application_id AND tau.tenant_user_id=tu.tenant_user_id
          WHERE a.status='active'
          AND a.application_type = ANY($1::text[])
          AND (
            $2::uuid IS NULL
            OR tac.app_count=0
            OR ta.status='active'
          )
          AND (
            $2::uuid IS NULL
            OR tac.app_count=0
            OR NOT EXISTS (
              SELECT 1 FROM core_tenant_application_user tau_any
              WHERE tau_any.tenant_application_id=ta.tenant_application_id
            )
            OR tau.tenant_application_user_id IS NOT NULL
          )
          ORDER BY application_type, application_name`,
    values:[types,tenantId,a.email]
  });

  return {applications:r.rows};
};
