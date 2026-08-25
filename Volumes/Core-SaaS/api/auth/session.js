'use strict';
module.exports=async ctx=>{
  const a=ctx.auth();
  if(!a)return {authenticated:false,user:null};
  const r=await ctx.broker('core_saas','query',{text:`SELECT user_id,email,known_name,full_name,user_type,status,created_at,activated_at FROM core_user WHERE user_id=$1 AND status='active'`,values:[a.user_id]});
  let currentTenant=null;
  if(r.rowCount&&ctx.cookies.current_tenant){
    const tenant=await ctx.broker('core_saas','query',{
      text:`SELECT t.tenant_id
            FROM core_tenant t
            JOIN core_tenant_user tu ON tu.tenant_id=t.tenant_id
            WHERE t.tenant_id=$1
            AND lower(tu.email)=lower($2)
            AND t.status='active'
            AND tu.status='active'`,
      values:[ctx.cookies.current_tenant,r.rows[0].email]
    });
    currentTenant=tenant.rows[0]?.tenant_id||null;
  }
  return {authenticated:!!r.rowCount,user:r.rows[0]||null,current_tenant:currentTenant};
};
